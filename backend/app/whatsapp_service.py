# -*- coding: utf-8 -*-
import os
import json
import logging
import urllib.parse
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests

from backend.app.models import StockScreenerItem

logger = logging.getLogger(__name__)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
WHATSAPP_CONFIG_PATH = os.path.join(DATA_DIR, "whatsapp_config.json")

DEFAULT_CONFIG: Dict[str, Any] = {
    "phone_number": os.getenv("WHATSAPP_PHONE_NUMBER", ""),
    "provider": os.getenv("WHATSAPP_PROVIDER", "direct"),  # 'direct' | 'callmebot' | 'meta' | 'twilio'
    "auto_send_on_scan": False,
    "include_ath": True,
    "include_near_52w": True,
    "volume_confirmed_only": True,
    "fno_only": False,
    "max_stocks_per_section": 8,
    "callmebot_api_key": os.getenv("CALLMEBOT_API_KEY", ""),
    "meta_phone_number_id": os.getenv("META_WA_PHONE_NUMBER_ID", ""),
    "meta_access_token": os.getenv("META_WA_ACCESS_TOKEN", ""),
    "twilio_account_sid": os.getenv("TWILIO_ACCOUNT_SID", ""),
    "twilio_auth_token": os.getenv("TWILIO_AUTH_TOKEN", ""),
    "twilio_from_number": os.getenv("TWILIO_WA_FROM", "whatsapp:+14155238886"),
}


class WhatsAppService:
    def __init__(self, config_path: str = WHATSAPP_CONFIG_PATH):
        self.config_path = config_path
        self.config: Dict[str, Any] = dict(DEFAULT_CONFIG)
        self.load_config()

    def load_config(self) -> Dict[str, Any]:
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    if isinstance(saved, dict):
                        self.config.update(saved)
            except Exception as e:
                logger.warning(f"Failed to load WhatsApp config: {e}")
        return self.config

    def save_config(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        for k, v in updates.items():
            if k in DEFAULT_CONFIG:
                self.config[k] = v
        # Normalize phone number (digits only)
        raw_phone = str(self.config.get("phone_number", "")).strip()
        digits = "".join(ch for ch in raw_phone if ch.isdigit())
        if len(digits) == 10:
            digits = "91" + digits  # Default India country code if 10-digit mobile entered
        self.config["phone_number"] = digits

        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save WhatsApp config: {e}")
        return self.config

    def _format_date(self, date_str: Optional[str]) -> str:
        if not date_str:
            return datetime.now().strftime("%d %b %Y")
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%d %b %Y")
        except Exception:
            return str(date_str)

    def build_digest_message(
        self,
        ath_stocks: List[StockScreenerItem],
        near_52w_stocks: List[StockScreenerItem],
        latest_date: Optional[str] = None,
        override_opts: Optional[Dict[str, Any]] = None
    ) -> str:
        cfg = dict(self.config)
        if override_opts:
            cfg.update(override_opts)

        vol_only = bool(cfg.get("volume_confirmed_only", True))
        fno_only = bool(cfg.get("fno_only", False))
        include_ath = bool(cfg.get("include_ath", True))
        include_52w = bool(cfg.get("include_near_52w", True))
        limit = int(cfg.get("max_stocks_per_section", 8) or 8)

        def filter_and_sort(items: List[StockScreenerItem]) -> List[StockScreenerItem]:
            res = list(items)
            if vol_only:
                res = [x for x in res if x.is_volume_confirmed]
            if fno_only:
                res = [x for x in res if x.is_fno]
            res.sort(key=lambda x: (x.vol_multiple or 0.0), reverse=True)
            return res[:limit]

        ath_list = filter_and_sort(ath_stocks) if include_ath else []
        w52_list = filter_and_sort(near_52w_stocks) if include_52w else []

        formatted_date = self._format_date(latest_date)
        filter_tags = []
        if vol_only:
            filter_tags.append("Vol ≥ 1.4x")
        if fno_only:
            filter_tags.append("F&O Only")
        filter_str = f" ({' • '.join(filter_tags)})" if filter_tags else ""

        lines = [
            f"⚡ *BreakoutPulse — NSE Momentum Digest*",
            f"📅 *Session:* {formatted_date}{filter_str}",
            ""
        ]

        if include_ath:
            lines.append(f"👑 *All-Time High (ATH) Setups ({len(ath_list)}):*")
            if ath_list:
                for s in ath_list:
                    fno_tag = " `[F&O]`" if s.is_fno else ""
                    chg = f"+{s.change_pct:.2f}%" if s.change_pct >= 0 else f"{s.change_pct:.2f}%"
                    dist = f"+{s.dist_to_ath_pct:.1f}%" if s.dist_to_ath_pct >= 0 else f"{s.dist_to_ath_pct:.1f}%"
                    lines.append(
                        f"• *{s.symbol}*{fno_tag} — ₹{s.current_price:,.2f} ({chg}) | 🔥 {s.vol_multiple:.2f}x | ATH: {dist}"
                    )
            else:
                lines.append("_No matching ATH setups for current filters._")
            lines.append("")

        if include_52w:
            lines.append(f"🎯 *Near 52-Week High Setups ({len(w52_list)}):*")
            if w52_list:
                for s in w52_list:
                    fno_tag = " `[F&O]`" if s.is_fno else ""
                    chg = f"+{s.change_pct:.2f}%" if s.change_pct >= 0 else f"{s.change_pct:.2f}%"
                    dist = f"+{s.dist_to_52w_high_pct:.1f}%" if s.dist_to_52w_high_pct >= 0 else f"{s.dist_to_52w_high_pct:.1f}%"
                    lines.append(
                        f"• *{s.symbol}*{fno_tag} — ₹{s.current_price:,.2f} ({chg}) | 🔥 {s.vol_multiple:.2f}x | 52W: {dist}"
                    )
            else:
                lines.append("_No matching 52W High setups for current filters._")
            lines.append("")

        lines.append("_Generated by BreakoutPulse Quantitative Screener_")
        return "\n".join(lines)

    def build_wa_me_url(self, message: str, phone_number: Optional[str] = None) -> str:
        phone = (phone_number if phone_number is not None else self.config.get("phone_number", "")).strip()
        digits = "".join(ch for ch in phone if ch.isdigit())
        if len(digits) == 10:
            digits = "91" + digits
        encoded = urllib.parse.quote(message)
        if digits:
            return f"https://wa.me/{digits}?text={encoded}"
        return f"https://wa.me/?text={encoded}"

    def send_message(self, message: str, custom_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        cfg = dict(self.config)
        if custom_config:
            cfg.update(custom_config)

        provider = cfg.get("provider", "direct").lower()
        phone = "".join(ch for ch in str(cfg.get("phone_number", "")) if ch.isdigit())
        if len(phone) == 10:
            phone = "91" + phone

        wa_url = self.build_wa_me_url(message, phone)

        if provider == "direct":
            return {
                "status": "direct_link",
                "provider": "direct",
                "message": "WhatsApp digest prepared! Opening WhatsApp to send.",
                "whatsapp_text": message,
                "wa_me_url": wa_url
            }

        if not phone:
            return {
                "status": "error",
                "provider": provider,
                "message": "Please configure a valid WhatsApp recipient phone number (with country code, e.g., 919876543210).",
                "whatsapp_text": message,
                "wa_me_url": wa_url
            }

        if provider == "callmebot":
            api_key = str(cfg.get("callmebot_api_key", "")).strip()
            if not api_key:
                return {
                    "status": "error",
                    "provider": "callmebot",
                    "message": "CallMeBot API Key is required for automated background sending, or switch mode to Instant WhatsApp Web.",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            try:
                url = "https://api.callmebot.com/whatsapp.php"
                resp = requests.get(
                    url,
                    params={"phone": f"+{phone}", "text": message, "apikey": api_key},
                    timeout=12
                )
                if resp.status_code == 200 and "error" not in resp.text.lower():
                    return {
                        "status": "sent",
                        "provider": "callmebot",
                        "message": f"WhatsApp alert successfully dispatched to +{phone} via CallMeBot!",
                        "whatsapp_text": message,
                        "wa_me_url": wa_url
                    }
                return {
                    "status": "error",
                    "provider": "callmebot",
                    "message": f"CallMeBot returned HTTP {resp.status_code}: {resp.text[:160]}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            except Exception as e:
                return {
                    "status": "error",
                    "provider": "callmebot",
                    "message": f"CallMeBot request failed: {e}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }

        if provider == "meta":
            phone_id = str(cfg.get("meta_phone_number_id", "")).strip()
            token = str(cfg.get("meta_access_token", "")).strip()
            if not phone_id or not token:
                return {
                    "status": "error",
                    "provider": "meta",
                    "message": "Meta WhatsApp Cloud API requires both Phone Number ID and Access Token.",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            try:
                url = f"https://graph.facebook.com/v20.0/{phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone,
                    "type": "text",
                    "text": {"preview_url": False, "body": message}
                }
                resp = requests.post(url, headers=headers, json=payload, timeout=12)
                if resp.status_code in (200, 201):
                    return {
                        "status": "sent",
                        "provider": "meta",
                        "message": f"WhatsApp alert successfully sent to +{phone} via Meta Cloud API!",
                        "whatsapp_text": message,
                        "wa_me_url": wa_url
                    }
                return {
                    "status": "error",
                    "provider": "meta",
                    "message": f"Meta Cloud API error ({resp.status_code}): {resp.text[:200]}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            except Exception as e:
                return {
                    "status": "error",
                    "provider": "meta",
                    "message": f"Meta Cloud API request failed: {e}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }

        if provider == "twilio":
            sid = str(cfg.get("twilio_account_sid", "")).strip()
            token = str(cfg.get("twilio_auth_token", "")).strip()
            from_num = str(cfg.get("twilio_from_number", "whatsapp:+14155238886")).strip()
            if not from_num.startswith("whatsapp:"):
                from_num = f"whatsapp:{from_num}"
            if not sid or not token:
                return {
                    "status": "error",
                    "provider": "twilio",
                    "message": "Twilio Account SID and Auth Token are required.",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            try:
                url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
                resp = requests.post(
                    url,
                    data={
                        "From": from_num,
                        "To": f"whatsapp:+{phone}",
                        "Body": message
                    },
                    auth=(sid, token),
                    timeout=12
                )
                if resp.status_code in (200, 201):
                    return {
                        "status": "sent",
                        "provider": "twilio",
                        "message": f"WhatsApp alert successfully sent to +{phone} via Twilio!",
                        "whatsapp_text": message,
                        "wa_me_url": wa_url
                    }
                return {
                    "status": "error",
                    "provider": "twilio",
                    "message": f"Twilio API error ({resp.status_code}): {resp.text[:200]}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }
            except Exception as e:
                return {
                    "status": "error",
                    "provider": "twilio",
                    "message": f"Twilio request failed: {e}",
                    "whatsapp_text": message,
                    "wa_me_url": wa_url
                }

        return {
            "status": "direct_link",
            "provider": "direct",
            "message": "Opening WhatsApp Web/App link.",
            "whatsapp_text": message,
            "wa_me_url": wa_url
        }


whatsapp_service = WhatsAppService()
