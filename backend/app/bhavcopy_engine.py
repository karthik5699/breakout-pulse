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

    def get_latest_recorded_date(self) -> Optional[str]:
        """Returns the latest trade date recorded in SQLite or screener cache."""
        try:
            db_date = data_engine.get_latest_data_date()
            if db_date:
                return db_date
        except Exception:
            pass

        if os.path.exists(CACHE_JSON_PATH):
            try:
                with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                    return payload.get("latest_data_date")
            except Exception:
                pass
        return None

    def sync_daily_market(self) -> Dict[str, Any]:
        """
        Main scan action:
        1. Checks what trading session date our database currently has.
        2. Identifies any missing trading days (weekdays) between the recorded date and today.
        3. On weekends/holidays or weekdays, downloads and ingests missing Bhavcopies from NSE.
        4. Provides clear, accurate user guidance based on whether markets are closed,
           missing days were backfilled, or today's session data was loaded.
        """
        today = datetime.now()
        today_date = today.date()
        today_str = today.strftime("%Y-%m-%d")
        is_weekend = today.weekday() >= 5

        # Refresh official NSE F&O underlying stock list during market sync
        try:
            universe_store.sync_fno_from_nse()
        except Exception as e:
            logger.debug(f"F&O list sync skipped: {e}")

        latest_recorded_str = self.get_latest_recorded_date()
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
        total_stocks_updated = 0
        latest_ingested_date = None

        for c_date in candidate_dates:
            res = self.fetch_bhavcopy_for_date(datetime.combine(c_date, datetime.min.time()))
            if res:
                stocks, t_date = res
                count = self.ingest_stocks_to_db(stocks, t_date)
                ingested_dates.append(t_date)
                total_stocks_updated = count
                latest_ingested_date = t_date

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
        if os.path.exists(CACHE_JSON_PATH):
            try:
                with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                    existing_items = payload.get("results", [])
            except Exception as e:
                logger.warning(f"Could not load existing cache for incremental update: {e}")

        if not existing_items:
            return 0

        updated_results = []
        updated_count = 0

        for item in existing_items:
            sym = item.get("symbol", "").upper()
            if sym in parsed_map:
                p = parsed_map[sym]
                new_close = float(p["close"])
                new_high = float(p["high"])
                new_low = float(p["low"])
                new_vol = float(p["volume"])
                new_turnover = float(p.get("turnover", 0.0))

                prev_close = float(item.get("current_price") or new_close)
                change_pct = round(((new_close - prev_close) / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

                high_52w = max(float(item.get("high_52w") or new_high), new_high)
                high_ath = max(float(item.get("high_ath") or new_high), new_high)
                low_52w = min(float(item.get("low_52w") or new_low), new_low)

                dist_to_52w = round(((new_close - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
                dist_to_ath = round(((new_close - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

                # Volume multiple estimation
                old_vol = float(item.get("volume") or 0.0)
                old_mult = float(item.get("vol_multiple") or 1.0)
                vol_sma50 = (old_vol / old_mult) if (old_mult > 0 and old_vol > 0) else max(new_vol, 1.0)
                vol_mult = round(new_vol / vol_sma50, 2) if vol_sma50 > 0 else 1.0

                passes_liq = bool(item.get("passes_liquidity", True))
                is_vol_confirmed = bool(passes_liq and vol_mult >= 1.4 and new_vol >= 5000)
                turnover_cr = round(new_turnover / 1e7, 2) if new_turnover > 0 else float(item.get("turnover_cr") or 0.0)

                # Moving Averages and Stage 2 Trend Check
                sma50 = item.get("sma50")
                sma200 = item.get("sma200")
                n_bars = int(item.get("trading_days") or 500)
                passes_trend = bool(passes_liq and sma50 and sma200 and new_close > sma50 > sma200)

                # Strict Moving Average Rule: A stock cannot enter breakout lists if trading below 50 SMA or 200 SMA
                is_above_mas = True
                if sma50 is not None and new_close < float(sma50):
                    is_above_mas = False
                if sma200 is not None and n_bars >= 200 and new_close < float(sma200):
                    is_above_mas = False

                # Validate genuine recent listing using official exchange listing date
                is_recent = bool(item.get("is_recently_listed", False))
                try:
                    meta = universe_store.get(sym)
                    if meta and meta.listing_date:
                        dt = datetime.strptime(meta.listing_date.strip(), "%d-%b-%Y")
                        is_recent = (datetime.now() - dt).days <= 730
                except Exception:
                    pass

                # Status categorization
                if not passes_liq:
                    status = "ILLIQUID"
                    status_label = "Illiquid / Inactive"
                elif not is_above_mas:
                    status = "CONSOLIDATING"
                    status_label = "Consolidating"
                elif dist_to_ath >= -10.0 and dist_to_ath <= 10.0 and n_bars >= 500:
                    status = "NEAR_ATH"
                    status_label = "All-Time High (ATH)"
                elif is_recent and dist_to_52w >= -10.0:
                    status = "RECENT_LISTING"
                    status_label = "Recent Listing (<2Y)"
                elif dist_to_52w >= -0.5:
                    status = "AT_52W_HIGH"
                    status_label = "52-Week Breakout"
                elif dist_to_52w >= -10.0:
                    status = "NEAR_52W_HIGH"
                    status_label = "Near 52W High"
                else:
                    status = "CONSOLIDATING"
                    status_label = "Consolidating"

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
                item["status"] = status
                item["status_label"] = status_label
                item["passes_trend_check"] = passes_trend
                updated_count += 1

            item["is_fno"] = universe_store.is_fno(sym)
            item["fno_lot_size"] = universe_store.get_fno_lot_size(sym)
            updated_results.append(item)

        payload = {
            "last_scanned": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "latest_data_date": trade_date,
            "total_cached": len(updated_results),
            "results": updated_results
        }
        with open(CACHE_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f)

        logger.info(f"Incrementally updated screener cache for {updated_count} stocks as of {trade_date}.")
        return updated_count

    def ingest_stocks_to_db(self, parsed_stocks: List[Dict[str, Any]], trade_date: str) -> int:
        """
        Inserts new daily candles into SQLite in a single transaction,
        recalculates momentum indicators, and persists screener_cache.json.
        """
        if not parsed_stocks:
            return 0

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
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
                        """, (sym, round(h, 2), trade_date, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

            conn.commit()

        # Recalculate momentum screener and update cache strictly as of trade_date
        from backend.app.export_seed import export_cache
        exported_count = export_cache(as_of_date=trade_date)
        if not exported_count:
            # Fallback for cloud instances without full historical database:
            self.update_cache_with_bhavcopy(parsed_stocks, trade_date)
            
        logger.info(f"Ingested {len(parsed_stocks)} stocks for date {trade_date} and updated screener cache.")
        return len(parsed_stocks)

bhavcopy_engine = BhavcopyEngine()

