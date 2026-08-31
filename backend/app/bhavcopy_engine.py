# -*- coding: utf-8 -*-
import io
import os
import csv
import zipfile
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any
import requests

from backend.app.models import StockScreenerItem
from backend.app.universe_store import universe_store
from backend.app.data_engine import data_engine, DB_PATH, DATA_DIR

logger = logging.getLogger(__name__)
CACHE_JSON_PATH = os.path.join(DATA_DIR, "screener_cache.json")

class BhavcopyEngine:
    """
    Official NSE Daily Bhavcopy Ingestion Engine.
    Parses 'pd<ddmmyyyy>.csv', 'sec_bhavdata_full_<ddmmyyyy>.csv', or 'PR<ddmmyy>.zip'
    to update all 2,500+ NSE stocks in a single 0.3s database operation without Yahoo rate limits.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def parse_pd_csv(self, csv_text: str, default_date: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Parses NSE 'pd<ddmmyyyy>.csv' content.
        Columns: MKT,SERIES,SYMBOL,SECURITY,PREV_CL_PR,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,NET_TRDVAL,NET_TRDQTY,...
        """
        reader = csv.reader(io.StringIO(csv_text.strip()))
        rows = list(reader)
        if not rows:
            return [], default_date

        header = [h.strip() for h in rows[0]]
        stocks = []
        trade_date = default_date or datetime.now().strftime("%Y-%m-%d")

        for row in rows[1:]:
            if len(row) < 11:
                continue
            
            series = row[1].strip().upper()
            symbol = row[2].strip().upper()
            name = row[3].strip()

            # Filter equity series (EQ, BE, SM, ST)
            if series not in ("EQ", "BE", "SM", "ST") or not symbol:
                continue

            try:
                open_p = float(row[5].strip())
                high_p = float(row[6].strip())
                low_p = float(row[7].strip())
                close_p = float(row[8].strip())
                turnover_val = float(row[9].strip())
                qty = float(row[10].strip())

                stocks.append({
                    "symbol": symbol,
                    "name": name,
                    "series": series,
                    "date": trade_date,
                    "open": open_p,
                    "high": high_p,
                    "low": low_p,
                    "close": close_p,
                    "volume": qty,
                    "turnover": turnover_val,
                })
            except (ValueError, IndexError):
                continue

        return stocks, trade_date

    def parse_sec_bhavdata(self, csv_text: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Parses NSE 'sec_bhavdata_full_<ddmmyyyy>.csv' or 'cm<ddmmyyyy>bhav.csv'.
        Columns: SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, CLOSE_PRICE, TTL_TRD_QNTY, TURNOVER_LACS,...
        """
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        stocks = []
        trade_date = None

        for row in reader:
            cleaned = {k.strip().upper(): v.strip() for k, v in row.items() if k is not None}
            symbol = cleaned.get("SYMBOL", "").strip().upper()
            series = cleaned.get("SERIES", "").strip().upper()

            if series not in ("EQ", "BE", "SM", "ST") or not symbol:
                continue

            # Extract date if available
            date_raw = cleaned.get("DATE1") or cleaned.get("TIMESTAMP") or cleaned.get("TRADE_DATE")
            if date_raw and not trade_date:
                try:
                    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d%m%Y"):
                        try:
                            trade_date = datetime.strptime(date_raw, fmt).strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            pass
                except Exception:
                    pass

            try:
                open_p = float(cleaned.get("OPEN_PRICE") or cleaned.get("OPEN") or 0)
                high_p = float(cleaned.get("HIGH_PRICE") or cleaned.get("HIGH") or 0)
                low_p = float(cleaned.get("LOW_PRICE") or cleaned.get("LOW") or 0)
                close_p = float(cleaned.get("CLOSE_PRICE") or cleaned.get("CLOSE") or 0)
                qty = float(cleaned.get("TTL_TRD_QNTY") or cleaned.get("TOTTRDQTY") or 0)
                
                turnover_raw = cleaned.get("TURNOVER_LACS") or cleaned.get("TOTTRDVAL") or "0"
                turnover_val = float(turnover_raw)
                if "LACS" in (cleaned.get("TURNOVER_LACS") and "TURNOVER_LACS" or ""):
                    turnover_val = turnover_val * 100000.0

                stocks.append({
                    "symbol": symbol,
                    "name": cleaned.get("NAME") or symbol,
                    "series": series,
                    "date": trade_date or datetime.now().strftime("%Y-%m-%d"),
                    "open": open_p,
                    "high": high_p,
                    "low": low_p,
                    "close": close_p,
                    "volume": qty,
                    "turnover": turnover_val
                })
            except (ValueError, TypeError):
                continue

        return stocks, trade_date

    def parse_bhavcopy_file(self, content: bytes, filename: str) -> Tuple[List[Dict[str, Any]], str]:
        """Auto-detects whether file is a ZIP archive, pd*.csv, or sec_bhavdata*.csv."""
        trade_date = datetime.now().strftime("%Y-%m-%d")
        
        for part in filename.replace(".", "_").split("_"):
            digits = "".join(filter(str.isdigit, part))
            if len(digits) == 8: # ddmmyyyy
                try:
                    trade_date = datetime.strptime(digits, "%d%m%Y").strftime("%Y-%m-%d")
                    break
                except ValueError:
                    pass
            elif len(digits) == 6: # ddmmyy
                try:
                    trade_date = datetime.strptime(digits, "%d%m%y").strftime("%Y-%m-%d")
                    break
                except ValueError:
                    pass

        if filename.lower().endswith(".zip") or zipfile.is_zipfile(io.BytesIO(content)):
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                pd_files = [f for f in z.namelist() if f.lower().startswith("pd") and f.lower().endswith(".csv")]
                target_name = pd_files[0] if pd_files else [f for f in z.namelist() if f.lower().endswith(".csv")][0]
                
                with z.open(target_name) as f:
                    csv_text = f.read().decode("utf-8-sig", errors="ignore")
                    if target_name.lower().startswith("pd"):
                        return self.parse_pd_csv(csv_text, default_date=trade_date)
                    return self.parse_sec_bhavdata(csv_text)

        csv_text = content.decode("utf-8-sig", errors="ignore")
        if "PREV_CL_PR" in csv_text or "NET_TRDVAL" in csv_text:
            return self.parse_pd_csv(csv_text, default_date=trade_date)
        return self.parse_sec_bhavdata(csv_text)

    def fetch_bhavcopy_for_date(self, target_date: datetime) -> Optional[Tuple[List[Dict[str, Any]], str]]:
        """Checks if Bhavcopy for a specific date is published on NSE servers."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": "https://www.nseindia.com/"
        }

        ddmmyy = target_date.strftime("%d%m%y")
        ddmmyyyy = target_date.strftime("%d%m%Y")
        formatted_date = target_date.strftime("%Y-%m-%d")

        urls = [
            f"https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR{ddmmyy}.zip",
            f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{ddmmyyyy}.csv",
            f"https://nsearchives.nseindia.com/content/historical/EQUITIES/{target_date.strftime('%Y')}/{target_date.strftime('%b').upper()}/cm{target_date.strftime('%d%b%Y').upper()}bhav.csv.zip"
        ]

        session = requests.Session()
        for url in urls:
            try:
                resp = session.get(url, headers=headers, timeout=8)
                if resp.status_code == 200 and len(resp.content) > 5000:
                    filename = url.split("/")[-1]
                    stocks, t_date = self.parse_bhavcopy_file(resp.content, filename)
                    if stocks:
                        logger.info(f"Downloaded official NSE Bhavcopy ({len(stocks)} stocks) for {t_date} from {url}")
                        return stocks, t_date or formatted_date
            except Exception as e:
                logger.debug(f"Bhavcopy check at {url} returned: {e}")

        return None

    def sync_daily_market(self) -> Dict[str, Any]:
        """
        Main scan action:
        1. Checks if today's Bhavcopy is available on NSE.
        2. If available -> downloads, ingests in 0.3s, updates cache, and returns success message.
        3. If not yet published -> notifies user with clear timing guidance.
        """
        today = datetime.now()
        today_str = today.strftime("%Y-%m-%d")

        if today.weekday() >= 5:
            return {
                "status": "info",
                "is_today_available": False,
                "message": f"NSE is closed today (Weekend). Currently displaying latest available session data.",
                "stocks_updated": 0
            }

        # Check if today's Bhavcopy is available on NSE
        res = self.fetch_bhavcopy_for_date(today)
        if res:
            stocks, t_date = res
            count = self.ingest_stocks_to_db(stocks, t_date)
            return {
                "status": "success",
                "is_today_available": True,
                "trade_date": t_date,
                "stocks_updated": count,
                "message": f"⚡ Today's ({t_date}) official NSE Bhavcopy was successfully downloaded and loaded! {count} stocks updated."
            }

        return {
            "status": "not_ready",
            "is_today_available": False,
            "trade_date": today_str,
            "stocks_updated": 0,
            "message": f"Today's ({today.strftime('%d %b %Y')}) official NSE Bhavcopy has not been released yet (typically published around 3:45 PM – 4:30 PM IST). Displaying latest available session data."
        }

    def ingest_stocks_to_db(self, parsed_stocks: List[Dict[str, Any]], trade_date: str) -> int:
        """
        Inserts new daily candles into SQLite in a single transaction,
        recalculates momentum indicators, and persists screener_cache.json.
        """
        if not parsed_stocks:
            return 0

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM daily_candles WHERE date > ?", (trade_date,))
            records = [
                (
                    s["symbol"],
                    trade_date,
                    s["open"],
                    s["high"],
                    s["low"],
                    s["close"],
                    s["volume"]
                )
                for s in parsed_stocks
            ]
            cursor.executemany("""
                INSERT OR REPLACE INTO daily_candles (symbol, date, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, records)
            conn.commit()

        # Recalculate momentum screener and update cache strictly as of trade_date
        from backend.app.export_seed import export_cache
        export_cache(as_of_date=trade_date)
        logger.info(f"Ingested {len(parsed_stocks)} stocks for date {trade_date} and updated screener cache.")
        return len(parsed_stocks)

bhavcopy_engine = BhavcopyEngine()
