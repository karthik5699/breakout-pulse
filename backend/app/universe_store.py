# -*- coding: utf-8 -*-
import os
import io
import csv
import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional
import requests
from backend.app.models import StockMeta

IST = ZoneInfo("Asia/Kolkata")

logger = logging.getLogger(__name__)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
CSV_PATH = os.path.join(DATA_DIR, "nse_universe.csv")
FNO_JSON_PATH = os.path.join(DATA_DIR, "nse_fo_stocks.json")

# Official NSE F&O symbol aliases for recent ticker renames across equity/derivative segments
FNO_SYMBOL_ALIASES: Dict[str, str] = {
    "ICICILIFE": "ICICIPRULI",
    "ICICIPRULI": "ICICILIFE",
    "LTIM": "LTM",
    "LTM": "LTIM",
    "TATAMOTORS": "TMPV",
    "TMPV": "TATAMOTORS",
    "ZOMATO": "ETERNAL",
    "ETERNAL": "ZOMATO",
}


class UniverseStore:
    def __init__(self, csv_path: str = CSV_PATH, fno_json_path: str = FNO_JSON_PATH):
        self.csv_path = csv_path
        self.fno_json_path = fno_json_path
        self._stocks: Dict[str, StockMeta] = {}
        self._fno_lots: Dict[str, int] = {}
        self.load_fno()
        self.load()

    def load_fno(self) -> None:
        """Loads official NSE F&O stock symbols and lot sizes from persistent JSON."""
        self._fno_lots.clear()
        if not os.path.exists(self.fno_json_path):
            return
        try:
            with open(self.fno_json_path, mode="r", encoding="utf-8") as f:
                payload = json.load(f)
                stocks_map = payload.get("stocks", {})
                for sym, info in stocks_map.items():
                    clean_sym = sym.strip().upper()
                    lot_size = info.get("lot_size") if isinstance(info, dict) else info
                    try:
                        lot_val = int(lot_size) if lot_size else 0
                    except (ValueError, TypeError):
                        lot_val = 0
                    self._fno_lots[clean_sym] = lot_val
                    # Also register alias so lookups by either old or new ticker succeed
                    alias = FNO_SYMBOL_ALIASES.get(clean_sym)
                    if alias and alias not in self._fno_lots:
                        self._fno_lots[alias] = lot_val
        except Exception as e:
            logger.warning(f"Failed to load F&O stock list from {self.fno_json_path}: {e}")

    def is_fno(self, symbol: str) -> bool:
        """Returns True if the symbol is an official NSE F&O stock."""
        if not symbol:
            return False
        clean_sym = symbol.replace(".NS", "").strip().upper()
        if clean_sym in self._fno_lots:
            return True
        alias = FNO_SYMBOL_ALIASES.get(clean_sym)
        return bool(alias and alias in self._fno_lots)

    def get_fno_lot_size(self, symbol: str) -> Optional[int]:
        """Returns the current NSE F&O market lot size for the symbol, or None if not in F&O."""
        if not symbol:
            return None
        clean_sym = symbol.replace(".NS", "").strip().upper()
        if clean_sym in self._fno_lots:
            val = self._fno_lots[clean_sym]
            return val if val > 0 else None
        alias = FNO_SYMBOL_ALIASES.get(clean_sym)
        if alias and alias in self._fno_lots:
            val = self._fno_lots[alias]
            return val if val > 0 else None
        return None

    def sync_fno_from_nse(self) -> int:
        """
        Fetches the official NSE F&O market lots file (fo_mktlots.csv) from nsearchives.nseindia.com,
        extracts all individual equity F&O securities and their current lot sizes, persists to
        backend/data/nse_fo_stocks.json, and refreshes in-memory F&O metadata.
        """
        url = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": "https://www.nseindia.com/"
        }
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200 or not resp.text:
                logger.warning(f"NSE fo_mktlots.csv returned status {resp.status_code}")
                return 0

            lines = resp.text.splitlines()
            in_individual = False
            fno_entries: Dict[str, Dict[str, object]] = {}

            for line in lines:
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 2:
                    continue
                if parts[0].lower().startswith("derivatives on individual securities"):
                    in_individual = True
                    continue
                if not in_individual:
                    continue

                sym = parts[1].strip().upper()
                name = parts[0].strip()
                if not sym or sym == "SYMBOL":
                    continue

                # Find the first valid positive integer lot size across active contract month columns
                lot_val = 0
                for col in parts[2:]:
                    if col.isdigit():
                        lot_val = int(col)
                        break

                fno_entries[sym] = {
                    "name": name,
                    "lot_size": lot_val
                }

            if len(fno_entries) < 50:
                logger.warning(f"Parsed suspiciously few ({len(fno_entries)}) F&O stocks from NSE; skipping overwrite.")
                return 0

            os.makedirs(os.path.dirname(self.fno_json_path), exist_ok=True)
            payload = {
                "source": url,
                "last_updated": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
                "count": len(fno_entries),
                "stocks": fno_entries
            }
            tmp_fno = f"{self.fno_json_path}.tmp"
            with open(tmp_fno, mode="w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            os.replace(tmp_fno, self.fno_json_path)

            self.load_fno()
            self.load()
            logger.info(f"Synced {len(fno_entries)} official NSE F&O stocks from {url}")
            return len(fno_entries)
        except Exception as e:
            logger.warning(f"Could not sync official F&O list from NSE: {e}")
            return 0

    def load(self) -> None:
        """Loads or reloads the universe CSV into memory."""
        self._stocks.clear()
        if not os.path.exists(self.csv_path):
            return

        with open(self.csv_path, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Strip spaces from keys and values
                cleaned = {k.strip(): (v or "").strip() for k, v in row.items() if k is not None and not isinstance(v, list)}
                symbol = cleaned.get("SYMBOL", "").strip().upper()
                if not symbol:
                    continue
                
                name = cleaned.get("NAME OF COMPANY", symbol).strip()
                series = cleaned.get("SERIES", "EQ").strip()
                listing_date = cleaned.get("DATE OF LISTING", None)
                
                try:
                    face_value = float(cleaned.get("FACE VALUE", 0))
                except (ValueError, TypeError):
                    face_value = None

                self._stocks[symbol] = StockMeta(
                    symbol=symbol,
                    name=name,
                    series=series,
                    listing_date=listing_date,
                    face_value=face_value,
                    is_fno=self.is_fno(symbol),
                    fno_lot_size=self.get_fno_lot_size(symbol)
                )

    def save_csv_content(self, csv_text: str) -> int:
        """Atomically overwrites the persistent CSV file with new uploaded content and reloads."""
        os.makedirs(os.path.dirname(self.csv_path), exist_ok=True)
        tmp_path = f"{self.csv_path}.tmp"
        with open(tmp_path, mode="w", encoding="utf-8") as f:
            f.write(csv_text)
        os.replace(tmp_path, self.csv_path)
        self.load()
        return len(self._stocks)

    def save_uploaded_csv(self, lines: List[str], overwrite: bool = True) -> int:
        """Handles uploaded CSV lines from API, supporting overwrite or merge by SYMBOL."""
        csv_text = "\n".join(lines) if isinstance(lines, list) else str(lines)
        if overwrite or not os.path.exists(self.csv_path):
            return self.save_csv_content(csv_text)

        merged: Dict[str, Dict[str, str]] = {}
        ordered_fields: List[str] = []

        def _ingest_reader(reader: csv.DictReader) -> int:
            count = 0
            if reader.fieldnames:
                for fn in reader.fieldnames:
                    clean_fn = fn.strip().lstrip("\ufeff")
                    if clean_fn and clean_fn not in ordered_fields:
                        ordered_fields.append(clean_fn)
            for row in reader:
                cleaned = {
                    k.strip().lstrip("\ufeff"): (v or "").strip()
                    for k, v in row.items()
                    if k is not None and not isinstance(v, list)
                }
                sym = cleaned.get("SYMBOL", "").strip().upper()
                if not sym:
                    continue
                cleaned["SYMBOL"] = sym
                if sym in merged:
                    existing = merged[sym]
                    for k, v in cleaned.items():
                        if v != "" or k not in existing:
                            existing[k] = v
                else:
                    merged[sym] = cleaned
                count += 1
            return count

        with open(self.csv_path, mode="r", encoding="utf-8-sig") as f:
            _ingest_reader(csv.DictReader(f))

        uploaded_count = _ingest_reader(csv.DictReader(io.StringIO(csv_text)))

        if "SYMBOL" not in ordered_fields:
            ordered_fields.insert(0, "SYMBOL")

        out_buf = io.StringIO()
        writer = csv.DictWriter(out_buf, fieldnames=ordered_fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row_dict in merged.values():
            writer.writerow({k: row_dict.get(k, "") for k in ordered_fields})

        self.save_csv_content(out_buf.getvalue())
        return uploaded_count

    def get_all(self) -> List[StockMeta]:
        return list(self._stocks.values())

    def get(self, symbol: str) -> Optional[StockMeta]:
        clean_sym = symbol.replace(".NS", "").upper()
        return self._stocks.get(clean_sym)

    def get_symbols(self, exclude_be: bool = False) -> List[str]:
        """Returns list of stock symbols. Can filter out BE/BZ if requested."""
        if exclude_be:
            return [s for s, m in self._stocks.items() if m.series == "EQ"]
        return list(self._stocks.keys())

    def total_count(self) -> int:
        return len(self._stocks)


# Global singleton instance
universe_store = UniverseStore()
