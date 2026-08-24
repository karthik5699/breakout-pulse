# -*- coding: utf-8 -*-
import os
import csv
from typing import List, Dict, Optional
from backend.app.models import StockMeta

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
CSV_PATH = os.path.join(DATA_DIR, "nse_universe.csv")

class UniverseStore:
    def __init__(self, csv_path: str = CSV_PATH):
        self.csv_path = csv_path
        self._stocks: Dict[str, StockMeta] = {}
        self.load()

    def load(self) -> None:
        """Loads or reloads the universe CSV into memory."""
        self._stocks.clear()
        if not os.path.exists(self.csv_path):
            return

        with open(self.csv_path, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Strip spaces from keys and values
                cleaned = {k.strip(): v.strip() for k, v in row.items() if k is not None}
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
                    face_value=face_value
                )

    def save_csv_content(self, csv_text: str) -> int:
        """Overwrites the persistent CSV file with new uploaded content and reloads."""
        os.makedirs(os.path.dirname(self.csv_path), exist_ok=True)
        with open(self.csv_path, mode="w", encoding="utf-8") as f:
            f.write(csv_text)
        self.load()
        return len(self._stocks)

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
