# -*- coding: utf-8 -*-
import io
import os
import re
import csv
import zipfile
import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Tuple, Any, Callable
import requests

from backend.app.models import StockScreenerItem
from backend.app.universe_store import universe_store
from backend.app.data_engine import data_engine, DB_PATH, DATA_DIR
from backend.app.screener_engine import screener_engine

logger = logging.getLogger(__name__)
CACHE_JSON_PATH = os.path.join(DATA_DIR, "screener_cache.json")
IST = ZoneInfo("Asia/Kolkata")


def _now_ist() -> datetime:
    """Returns current naive-local wall-clock datetime in Asia/Kolkata (IST)."""
    return datetime.now(IST).replace(tzinfo=None)

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
        Parses NSE 'pd<ddmmyyyy>.csv' content using header column names (with positional fallback).
        Columns: MKT,SERIES,SYMBOL,SECURITY,PREV_CL_PR,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,NET_TRDVAL,NET_TRDQTY,...
        """
        reader = csv.reader(io.StringIO(csv_text.strip()))
        rows = list(reader)
        if not rows:
            return [], default_date

        header = [h.strip().lstrip("\ufeff").upper() for h in rows[0]]
        col_idx = {name: i for i, name in enumerate(header) if name}

        idx_series = col_idx.get("SERIES", 1)
        idx_symbol = col_idx.get("SYMBOL", 2)
        idx_name = col_idx.get("SECURITY", 3)
        idx_prev = col_idx.get("PREV_CL_PR", 4)
        idx_open = col_idx.get("OPEN_PRICE", 5)
        idx_high = col_idx.get("HIGH_PRICE", 6)
        idx_low = col_idx.get("LOW_PRICE", 7)
        idx_close = col_idx.get("CLOSE_PRICE", 8)
        idx_val = col_idx.get("NET_TRDVAL", 9)
        idx_qty = col_idx.get("NET_TRDQTY", 10)

        min_required = max(idx_series, idx_symbol, idx_open, idx_high, idx_low, idx_close, idx_val, idx_qty) + 1
        stocks = []
        trade_date = default_date or _now_ist().strftime("%Y-%m-%d")

        for row in rows[1:]:
            if len(row) < min_required:
                continue

            series = row[idx_series].strip().upper()
            symbol = row[idx_symbol].strip().upper()
            name = row[idx_name].strip() if idx_name < len(row) else symbol

            # Filter equity series (EQ, BE, SM, ST)
            if series not in ("EQ", "BE", "SM", "ST") or not symbol:
                continue

            try:
                prev_cl_str = row[idx_prev].strip() if idx_prev < len(row) else ""
                prev_close = float(prev_cl_str) if prev_cl_str else None
            except (ValueError, IndexError):
                prev_close = None

            try:
                open_p = float(row[idx_open].strip())
                high_p = float(row[idx_high].strip())
                low_p = float(row[idx_low].strip())
                close_p = float(row[idx_close].strip())
                turnover_val = float(row[idx_val].strip())
                qty = float(row[idx_qty].strip())

                stocks.append({
                    "symbol": symbol,
                    "name": name or symbol,
                    "series": series,
                    "date": trade_date,
                    "prev_close": prev_close,
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
            cleaned = {k.strip().upper(): (v or "").strip() for k, v in row.items() if k is not None and not isinstance(v, list)}
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
                prev_raw = cleaned.get("PREV_CLOSE") or cleaned.get("PREVCLPR") or cleaned.get("PREVCLOSE")
                prev_close = float(prev_raw) if prev_raw else None
            except (ValueError, TypeError):
                prev_close = None

            try:
                open_p = float(cleaned.get("OPEN_PRICE") or cleaned.get("OPEN") or 0)
                high_p = float(cleaned.get("HIGH_PRICE") or cleaned.get("HIGH") or 0)
                low_p = float(cleaned.get("LOW_PRICE") or cleaned.get("LOW") or 0)
                close_p = float(cleaned.get("CLOSE_PRICE") or cleaned.get("CLOSE") or 0)
                qty = float(cleaned.get("TTL_TRD_QNTY") or cleaned.get("TOTTRDQTY") or 0)
                
                turnover_raw = cleaned.get("TURNOVER_LACS") or cleaned.get("TOTTRDVAL") or "0"
                turnover_val = float(turnover_raw)
                if cleaned.get("TURNOVER_LACS"):
                    turnover_val = turnover_val * 100000.0

                stocks.append({
                    "symbol": symbol,
                    "name": cleaned.get("NAME") or symbol,
                    "series": series,
                    "date": trade_date or _now_ist().strftime("%Y-%m-%d"),
                    "prev_close": prev_close,
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

    @staticmethod
    def _extract_date_from_filename(filename: str) -> Optional[str]:
        """Extracts YYYY-MM-DD from NSE Bhavcopy filenames (DDMMMYYYY, YYYY-MM-DD, DDMMYYYY, DDMMYY)."""
        base = os.path.basename(filename or "")
        # 1. DDMMMYYYY e.g. cm19NOV2026bhav.csv.zip
        m = re.search(r"(\d{2}[A-Za-z]{3}20\d{2})", base)
        if m:
            try:
                return datetime.strptime(m.group(1).upper(), "%d%b%Y").strftime("%Y-%m-%d")
            except ValueError:
                pass
        # 2. YYYY-MM-DD / YYYY_MM_DD / YYYYMMDD
        m = re.search(r"(?<!\d)(20\d{2})[-_]?(\d{2})[-_]?(\d{2})(?!\d)", base)
        if m:
            try:
                return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).strftime("%Y-%m-%d")
            except ValueError:
                pass
        # 3. DDMMYYYY e.g. sec_bhavdata_full_19112026.csv or pd19112026.csv
        m = re.search(r"(?<!\d)(\d{2})(\d{2})(20\d{2})(?!\d)", base)
        if m:
            try:
                return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).strftime("%Y-%m-%d")
            except ValueError:
                pass
        # 4. DDMMYY e.g. PR191126.zip
        m = re.search(r"(?<!\d)(\d{6})(?!\d)", base)
        if m:
            try:
                return datetime.strptime(m.group(1), "%d%m%y").strftime("%Y-%m-%d")
            except ValueError:
                pass
        return None

    def parse_bhavcopy_file(self, content: bytes, filename: str) -> Tuple[List[Dict[str, Any]], str]:
        """Auto-detects whether file is a ZIP archive, pd*.csv, or sec_bhavdata*.csv."""
        trade_date = self._extract_date_from_filename(filename) or _now_ist().strftime("%Y-%m-%d")

        if filename.lower().endswith(".zip") or zipfile.is_zipfile(io.BytesIO(content)):
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                csv_files = [f for f in z.namelist() if f.lower().endswith(".csv")]
                pd_files = [f for f in csv_files if os.path.basename(f).lower().startswith("pd")]
                if not csv_files:
                    return [], trade_date
                target_name = pd_files[0] if pd_files else csv_files[0]
                
                with z.open(target_name) as f:
                    csv_text = f.read().decode("utf-8-sig", errors="ignore")
                    if os.path.basename(target_name).lower().startswith("pd"):
                        return self.parse_pd_csv(csv_text, default_date=trade_date)
                    stocks, csv_date = self.parse_sec_bhavdata(csv_text)
                    return stocks, csv_date or trade_date

        csv_text = content.decode("utf-8-sig", errors="ignore")
        if "PREV_CL_PR" in csv_text or "NET_TRDVAL" in csv_text:
            return self.parse_pd_csv(csv_text, default_date=trade_date)
        stocks, csv_date = self.parse_sec_bhavdata(csv_text)
        return stocks, csv_date or trade_date

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

    def get_latest_cache_date(self) -> Optional[str]:
        """Returns the latest_data_date recorded in screener_cache.json."""
        if os.path.exists(CACHE_JSON_PATH):
            try:
                with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                    return payload.get("latest_data_date")
            except Exception:
                pass
        return None

    def get_latest_recorded_date(self) -> Optional[str]:
        """Returns the latest trade date recorded in SQLite or screener cache."""
        try:
            db_date = data_engine.get_latest_data_date()
            if db_date:
                return db_date
        except Exception:
            pass

        return self.get_latest_cache_date()

    def sync_daily_market(
        self,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> Dict[str, Any]:
        """
        Main scan action:
        1. Checks what complete trading session date our database currently has.
        2. Identifies any missing trading days (weekdays) between the recorded date and today (IST).
        3. Downloads and ingests missing Bhavcopies in a single batch, refreshes benchmarks, and
           recomputes screener_cache.json once at the end.
        """
        today = _now_ist()
        today_date = today.date()
        today_str = today.strftime("%Y-%m-%d")
        is_weekend = today.weekday() >= 5

        # Refresh official NSE F&O underlying stock list during market sync
        try:
            universe_store.sync_fno_from_nse()
        except Exception as e:
            logger.debug(f"F&O list sync skipped: {e}")

        db_date_str = None
        try:
            db_date_str = data_engine.get_latest_complete_data_date()
        except Exception:
            pass
        cache_date_str = self.get_latest_cache_date()

        latest_recorded_str = db_date_str or cache_date_str
        recorded_date = None
        if latest_recorded_str:
            try:
                recorded_date = datetime.strptime(latest_recorded_str, "%Y-%m-%d").date()
            except ValueError:
                pass

        # Allow backfilling up to 30 days if recorded_date is old or missing
        if not recorded_date or (today_date - recorded_date).days > 30:
            start_date = today_date - timedelta(days=14)
        else:
            start_date = recorded_date + timedelta(days=1)

        # Collect candidate missing trading days (Monday to Friday) up to today
        candidate_dates = []
        curr = start_date
        while curr <= today_date:
            if curr.weekday() < 5:  # Monday to Friday
                candidate_dates.append(curr)
            curr += timedelta(days=1)

        ingested_dates = []
        ingested_batches: List[Tuple[List[Dict[str, Any]], str]] = []
        total_stocks_updated = 0
        latest_ingested_date = None
        total_steps = max(1, len(candidate_dates) + 1)

        for idx, c_date in enumerate(candidate_dates, start=1):
            if progress_callback:
                progress_callback(idx - 1, total_steps, f"Checking NSE Bhavcopy {c_date.strftime('%d %b %Y')}...")
            res = self.fetch_bhavcopy_for_date(datetime.combine(c_date, datetime.min.time()))
            if res:
                stocks, t_date = res
                count = self.ingest_stocks_to_db(stocks, t_date, recompute_cache=False)
                ingested_dates.append(t_date)
                ingested_batches.append((stocks, t_date))
                total_stocks_updated = count
                latest_ingested_date = max(latest_ingested_date, t_date) if latest_ingested_date else t_date

        if ingested_dates:
            if progress_callback:
                progress_callback(len(candidate_dates), total_steps, "Refreshing benchmarks & recalculating screener...")
            try:
                data_engine.refresh_benchmarks()
            except Exception as e:
                logger.debug(f"Benchmark refresh skipped: {e}")

            from backend.app.export_seed import export_cache
            exported_count = export_cache(as_of_date=latest_ingested_date)
            if not exported_count:
                for batch_stocks, batch_date in ingested_batches:
                    self.update_cache_with_bhavcopy(batch_stocks, batch_date)
            if progress_callback:
                progress_callback(total_steps, total_steps, "Complete")

        # If SQLite already had newer complete trading data than screener_cache.json, sync cache from SQLite
        if not ingested_dates and db_date_str and (not cache_date_str or db_date_str > cache_date_str):
            if progress_callback:
                progress_callback(len(candidate_dates), total_steps, "Syncing screener cache from SQLite...")
            try:
                data_engine.refresh_benchmarks()
            except Exception as e:
                logger.debug(f"Benchmark refresh skipped: {e}")
            from backend.app.export_seed import export_cache
            exported_count = export_cache(as_of_date=db_date_str)
            if exported_count:
                ingested_dates.append(db_date_str)
                total_stocks_updated = exported_count
                latest_ingested_date = db_date_str
            if progress_callback:
                progress_callback(total_steps, total_steps, "Complete")

        current_latest_str = latest_ingested_date or latest_recorded_str or today_str
        try:
            curr_dt = datetime.strptime(current_latest_str, "%Y-%m-%d")
            formatted_latest = curr_dt.strftime("%A, %d %b %Y")
        except Exception:
            formatted_latest = current_latest_str

        # Case 1: Today is Weekend (Saturday or Sunday)
        if is_weekend:
            if ingested_dates:
                return {
                    "status": "success",
                    "is_today_available": False,
                    "trade_date": latest_ingested_date,
                    "stocks_updated": total_stocks_updated,
                    "message": f"NSE is closed today (Weekend). Successfully downloaded and loaded latest available trading session data for {formatted_latest}! {total_stocks_updated} stocks updated."
                }
            else:
                return {
                    "status": "info",
                    "is_today_available": False,
                    "trade_date": current_latest_str,
                    "stocks_updated": 0,
                    "message": f"NSE is closed today (Weekend). Market data is already up to date with the latest session ({formatted_latest})."
                }

        # Case 2: Today is a Weekday
        if today_str in ingested_dates:
            return {
                "status": "success",
                "is_today_available": True,
                "trade_date": today_str,
                "stocks_updated": total_stocks_updated,
                "message": f"⚡ Today's ({today.strftime('%d %b %Y')}) official NSE Bhavcopy was successfully downloaded and loaded! {total_stocks_updated} stocks updated."
            }

        if ingested_dates:
            return {
                "status": "success",
                "is_today_available": False,
                "trade_date": latest_ingested_date,
                "stocks_updated": total_stocks_updated,
                "message": f"Updated latest available session data for {formatted_latest} ({total_stocks_updated} stocks). Today's ({today.strftime('%d %b %Y')}) official Bhavcopy has not been released yet (typically published around 3:45 PM – 4:30 PM IST)."
            }

        if latest_recorded_str == today_str:
            return {
                "status": "info",
                "is_today_available": True,
                "trade_date": today_str,
                "stocks_updated": 0,
                "message": f"Market data is already up to date with today's ({today.strftime('%d %b %Y')}) session."
            }

        return {
            "status": "not_ready",
            "is_today_available": False,
            "trade_date": current_latest_str,
            "stocks_updated": 0,
            "message": f"Today's ({today.strftime('%d %b %Y')}) official NSE Bhavcopy has not been released yet (typically published around 3:45 PM – 4:30 PM IST). Displaying latest available session data ({formatted_latest})."
        }

    def update_cache_with_bhavcopy(self, parsed_stocks: List[Dict[str, Any]], trade_date: str) -> int:
        """
        Incrementally updates screener_cache.json in environments (e.g. Render)
        where SQLite does not contain full 5-year historical bars.
        """
        if not parsed_stocks:
            return 0

        parsed_map = {s["symbol"].upper(): s for s in parsed_stocks}
        existing_items = []
        old_cache_date: Optional[str] = None
        if os.path.exists(CACHE_JSON_PATH):
            try:
                with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                    existing_items = payload.get("results", [])
                    old_cache_date = payload.get("latest_data_date")
            except Exception as e:
                logger.warning(f"Could not load existing cache for incremental update: {e}")

        if not existing_items:
            return 0

        is_newer_session = (not old_cache_date) or (trade_date > old_cache_date)
        try:
            ref_dt = datetime.strptime(trade_date, "%Y-%m-%d")
        except Exception:
            ref_dt = _now_ist()

        updated_results = []
        updated_count = 0

        for item in existing_items:
            sym = item.get("symbol", "").upper()
            if sym in parsed_map:
                p = parsed_map[sym]
                new_open = float(p["open"])
                new_close = float(p["close"])
                new_high = float(p["high"])
                new_low = float(p["low"])
                new_vol = float(p["volume"])
                new_turnover = float(p.get("turnover", 0.0))

                old_price = float(item.get("current_price") or new_close)
                bhav_prev_close = p.get("prev_close")

                # Detect corporate action discontinuity (split / bonus / consolidation)
                adj_ratio = 1.0
                if old_price >= 5.0:
                    if bhav_prev_close is not None and float(bhav_prev_close) > 0:
                        r_prev = float(bhav_prev_close) / old_price
                        if r_prev > 1.45 or r_prev < 0.60:
                            adj_ratio = r_prev
                    elif new_open > 0 and new_close > 0:
                        r_open = new_open / old_price
                        r_close = new_close / old_price
                        if (r_open > 1.45 and r_close > 1.45) or (r_open < 0.60 and r_close < 0.60):
                            adj_ratio = r_open

                if adj_ratio != 1.0:
                    for fld in ("high_52w", "high_ath", "low_52w", "sma20", "sma50", "sma100", "sma200", "sma200_21d_ago"):
                        if item.get(fld) is not None:
                            item[fld] = round(float(item[fld]) * adj_ratio, 2)

                ref_prev_close = float(bhav_prev_close) if (bhav_prev_close is not None and float(bhav_prev_close) > 0) else (old_price * adj_ratio)
                change_pct = round(((new_close - ref_prev_close) / ref_prev_close) * 100.0, 2) if ref_prev_close > 0 else 0.0

                high_52w = max(float(item.get("high_52w") or new_high), new_high)
                high_ath = max(float(item.get("high_ath") or new_high), new_high)
                low_52w = min(float(item.get("low_52w") or new_low), new_low)

                dist_to_52w = round(((new_close - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
                dist_to_ath = round(((new_close - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

                raw_bars = item.get("trading_days")
                n_bars = int(raw_bars) if raw_bars is not None else 500
                if is_newer_session:
                    n_bars += 1
                    for ma_key, win in (("sma20", 20), ("sma50", 50), ("sma100", 100), ("sma200", 200)):
                        if item.get(ma_key) is not None:
                            old_ma = float(item[ma_key])
                            item[ma_key] = round(old_ma + (new_close - old_ma) / float(win), 2)

                # Rolling 20-day turnover blend & liquidity check
                today_cr = (new_turnover / 1e7) if new_turnover > 0 else ((new_close * new_vol) / 1e7)
                prev_t_cr = float(item.get("turnover_cr") or 0.0)
                if is_newer_session and prev_t_cr > 0 and today_cr > 0:
                    turnover_cr = round((prev_t_cr * 19.0 + today_cr) / 20.0, 2)
                else:
                    turnover_cr = round(today_cr, 2) if today_cr > 0 else prev_t_cr

                prev_active = int(item.get("active_days_20d") if item.get("active_days_20d") is not None else 20)
                if is_newer_session and new_vol > 0 and prev_active < 20:
                    prev_active = min(20, prev_active + 1)
                passes_liq = bool(prev_active >= min(screener_engine.min_active_days_20d, max(1, n_bars)) and turnover_cr >= 0.25)

                # Volume multiple estimation & canonical confirmation
                old_vol = float(item.get("volume") or 0.0)
                old_mult = float(item.get("vol_multiple") or 1.0)
                vol_sma50 = (old_vol / old_mult) if (old_mult > 0 and old_vol > 0) else max(new_vol, 1.0)
                if adj_ratio != 1.0 and adj_ratio > 0:
                    vol_sma50 = vol_sma50 / adj_ratio
                vol_mult, is_vol_confirmed = screener_engine.compute_volume_confirmation(new_vol, vol_sma50, passes_liq)

                # Validate genuine recent listing using official exchange listing date
                is_recent = bool(item.get("is_recently_listed", False))
                try:
                    meta = universe_store.get(sym)
                    if meta and meta.listing_date:
                        dt = datetime.strptime(meta.listing_date.strip(), "%d-%b-%Y")
                        is_recent = (ref_dt - dt).days <= 730
                except Exception:
                    pass

                sma20 = item.get("sma20")
                sma50 = item.get("sma50")
                sma200 = item.get("sma200")
                sma200_21d_ago = item.get("sma200_21d_ago")
                sma200_slope = item.get("sma200_slope_60d_pct")

                passes_trend, _ = screener_engine.check_stage2_trend(
                    price=new_close,
                    sma20=sma20,
                    sma50=sma50,
                    sma200=sma200,
                    sma200_21d_ago=sma200_21d_ago,
                    sma200_slope_60d_pct=sma200_slope,
                    trading_days=n_bars,
                    passes_liquidity=passes_liq,
                    is_recently_listed=is_recent,
                )
                above_mas = screener_engine.is_above_mas(new_close, sma50, sma200, n_bars)
                status, status_label = screener_engine.classify_status(
                    dist_52w=dist_to_52w,
                    dist_ath=dist_to_ath,
                    trading_days=n_bars,
                    is_recent=is_recent,
                    passes_liquidity=passes_liq,
                    is_above_mas=above_mas,
                )

                item["current_price"] = round(new_close, 2)
                item["change_pct"] = change_pct
                item["volume"] = new_vol
                item["vol_multiple"] = vol_mult
                item["is_volume_confirmed"] = is_vol_confirmed
                item["high_52w"] = round(high_52w, 2)
                item["high_ath"] = round(high_ath, 2)
                item["low_52w"] = round(low_52w, 2)
                item["dist_to_52w_high_pct"] = dist_to_52w
                item["dist_to_ath_pct"] = dist_to_ath
                item["turnover_cr"] = turnover_cr
                item["active_days_20d"] = prev_active
                item["trading_days"] = n_bars
                item["is_recently_listed"] = is_recent
                item["passes_liquidity"] = passes_liq
                item["status"] = status
                item["status_label"] = status_label
                item["passes_trend_check"] = passes_trend
                updated_count += 1

            item["is_fno"] = universe_store.is_fno(sym)
            item["fno_lot_size"] = universe_store.get_fno_lot_size(sym)
            item["passes_top10_step1"] = screener_engine.check_top10_step1(item, require_vol_confirm=False)
            item["composite_score"] = None
            item["top10_rank"] = None
            updated_results.append(item)

        top10_ranked = screener_engine.rank_top10_momentum(updated_results, require_vol_confirm=False)
        top10_map = {x["symbol"]: (x.get("composite_score"), x.get("top10_rank")) for x in top10_ranked}
        for item in updated_results:
            sym = item.get("symbol", "")
            if sym in top10_map:
                item["composite_score"], item["top10_rank"] = top10_map[sym]

        effective_date = max(trade_date, old_cache_date) if old_cache_date else trade_date
        payload = {
            "last_scanned": _now_ist().strftime("%Y-%m-%d %H:%M:%S"),
            "latest_data_date": effective_date,
            "total_cached": len(updated_results),
            "results": updated_results
        }
        tmp_cache = f"{CACHE_JSON_PATH}.tmp"
        with open(tmp_cache, "w", encoding="utf-8") as f:
            json.dump(payload, f)
        os.replace(tmp_cache, CACHE_JSON_PATH)

        logger.info(f"Incrementally updated screener cache for {updated_count} stocks as of {effective_date}.")
        return updated_count

    def ingest_stocks_to_db(
        self,
        parsed_stocks: List[Dict[str, Any]],
        trade_date: str,
        recompute_cache: bool = True,
    ) -> int:
        """
        Inserts new daily candles into SQLite in a single transaction,
        optionally recalculates momentum indicators, and persists screener_cache.json.
        """
        if not parsed_stocks:
            return 0

        corp_action_symbols: List[str] = []

        with data_engine._connect() as conn:
            cursor = conn.cursor()

            # Query latest close prior to trade_date to detect corporate actions (splits/bonuses/consolidations)
            cursor.execute("""
                SELECT d.symbol, d.close
                FROM daily_candles d
                INNER JOIN (
                    SELECT symbol, MAX(date) AS max_date
                    FROM daily_candles
                    WHERE date < ?
                    GROUP BY symbol
                ) m ON d.symbol = m.symbol AND d.date = m.max_date
            """, (trade_date,))
            prev_db_closes = {r[0]: float(r[1]) for r in cursor.fetchall() if r[1] is not None}

            for s in parsed_stocks:
                sym = s["symbol"]
                prev_db_close = prev_db_closes.get(sym)
                if prev_db_close is not None and prev_db_close >= 5.0:
                    bhav_prev = s.get("prev_close")
                    if bhav_prev is not None and float(bhav_prev) > 0:
                        r_prev = float(bhav_prev) / prev_db_close
                        if r_prev > 1.45 or r_prev < 0.60:
                            corp_action_symbols.append(sym)
                            continue
                    open_p = float(s.get("open") or 0)
                    close_p = float(s.get("close") or 0)
                    if open_p > 0 and close_p > 0:
                        r_open = open_p / prev_db_close
                        r_close = close_p / prev_db_close
                        if (r_open > 1.45 and r_close > 1.45) or (r_open < 0.60 and r_close < 0.60):
                            corp_action_symbols.append(sym)

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

            # Update stock_ath table if any stock hits a new lifetime high today
            now_ist_str = _now_ist().strftime("%Y-%m-%d %H:%M:%S")
            for s in parsed_stocks:
                sym = s["symbol"]
                h = float(s["high"])
                if h > 0:
                    cursor.execute("SELECT ath_price FROM stock_ath WHERE symbol = ?", (sym,))
                    row = cursor.fetchone()
                    if row is None or row[0] is None or h > float(row[0]):
                        cursor.execute("""
                            INSERT OR REPLACE INTO stock_ath (symbol, ath_price, ath_date, updated_at)
                            VALUES (?, ?, ?, ?)
                        """, (sym, round(h, 2), trade_date, now_ist_str))

            conn.commit()

        # Fetch full adjusted history for any stock showing a corporate-action discontinuity
        for sym in corp_action_symbols:
            try:
                logger.info(f"Corporate action discontinuity detected for {sym} on {trade_date}; refreshing adjusted history.")
                data_engine.fetch_and_cache_symbol(sym, period="max", max_retries=1, force_ath_reset=True)
            except Exception as e:
                logger.warning(f"Could not refresh adjusted history for {sym}: {e}")

        if recompute_cache:
            from backend.app.export_seed import export_cache
            latest_db_date = data_engine.get_latest_complete_data_date()
            effective_as_of = max(trade_date, latest_db_date) if latest_db_date else trade_date
            exported_count = export_cache(as_of_date=effective_as_of)
            if not exported_count:
                latest_cache_date = self.get_latest_cache_date()
                if not latest_cache_date or trade_date >= latest_cache_date:
                    self.update_cache_with_bhavcopy(parsed_stocks, trade_date)

        logger.info(f"Ingested {len(parsed_stocks)} stocks for date {trade_date}.")
        return len(parsed_stocks)

bhavcopy_engine = BhavcopyEngine()

