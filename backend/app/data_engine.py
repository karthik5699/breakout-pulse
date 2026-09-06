# -*- coding: utf-8 -*-
import os
import sqlite3
import time
import logging
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd
import numpy as np
import yfinance as yf

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "market_data.db")

SEED_GZ_PATH = os.path.join(DATA_DIR, "market_data_seed.db.gz")

BENCHMARK_NIFTY50 = "^NSEI"               # Nifty 50 Index (Largecap broad market context)
BENCHMARK_SMALLMID = "NIFTYSMLCAP250.NS"   # Nifty Smallcap 250 (Primary Small/Midcap benchmark)
BENCHMARK_MIDCAP = "NIFTYMIDCAP150.NS"     # Nifty Midcap 150

class DataEngine:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._seed_db_if_needed()
        self._init_db()

    def _seed_db_if_needed(self):
        """If main database does not exist or is empty, unpack from market_data_seed.db.gz."""
        if os.path.exists(SEED_GZ_PATH):
            if not os.path.exists(self.db_path) or os.path.getsize(self.db_path) < 10000:
                import gzip
                import shutil
                try:
                    with gzip.open(SEED_GZ_PATH, 'rb') as f_in:
                        with open(self.db_path, 'wb') as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    logger.info(f"Successfully unpacked database from {SEED_GZ_PATH}")
                except Exception as e:
                    logger.warning(f"Failed to unpack seed db: {e}")

    def _init_db(self):
        """Initializes SQLite tables for candles, scan metadata, and dropped tickers."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_candles (
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    open REAL NOT NULL,
                    high REAL NOT NULL,
                    low REAL NOT NULL,
                    close REAL NOT NULL,
                    volume REAL NOT NULL,
                    PRIMARY KEY (symbol, date)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ticker_status (
                    symbol TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    last_attempt TEXT NOT NULL,
                    error_message TEXT,
                    bar_count INTEGER DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scan_cache (
                    symbol TEXT PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS stock_ath (
                    symbol TEXT PRIMARY KEY,
                    ath_price REAL NOT NULL,
                    ath_date TEXT,
                    updated_at TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_candles_date ON daily_candles(date)
            """)
            conn.commit()

    def get_stock_ath(self, symbol: str) -> Optional[float]:
        """Retrieves verified lifetime All-Time High price for symbol."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ath_price FROM stock_ath WHERE symbol = ?", (clean_sym,))
            row = cursor.fetchone()
            return float(row[0]) if (row and row[0] is not None) else None

    def get_all_stock_aths(self) -> Dict[str, float]:
        """Retrieves all verified lifetime All-Time High prices as a dictionary."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT symbol, ath_price FROM stock_ath")
            return {row[0]: float(row[1]) for row in cursor.fetchall() if row[1] is not None}

    def update_stock_ath(self, symbol: str, ath_price: float, ath_date: str):
        """Updates or inserts lifetime All-Time High if new price exceeds existing ATH."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ath_price FROM stock_ath WHERE symbol = ?", (clean_sym,))
            row = cursor.fetchone()
            if row is None or row[0] is None or float(ath_price) > float(row[0]):
                now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT OR REPLACE INTO stock_ath (symbol, ath_price, ath_date, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (clean_sym, round(float(ath_price), 2), str(ath_date), now_str))
                conn.commit()

    def _format_ticker(self, symbol: str) -> str:
        """Appends .NS for NSE equities if not already present or index."""
        clean = symbol.strip().upper()
        if clean.startswith("^"):
            return clean
        if not clean.endswith(".NS") and not clean.endswith(".BO"):
            return f"{clean}.NS"
        return clean

    def _clean_symbol(self, ticker: str) -> str:
        """Strips .NS suffix for internal consistent symbol keys."""
        return ticker.replace(".NS", "").replace(".BO", "").upper()

    def fetch_benchmarks(self, period: str = "5y") -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
        """Fetches both Small/Midcap benchmark and Nifty 50 benchmark."""
        sm_df = self.fetch_and_cache_symbol(BENCHMARK_SMALLMID, period=period)
        if sm_df is None:
            sm_df = self.fetch_and_cache_symbol(BENCHMARK_MIDCAP, period=period)
        if sm_df is None:
            sm_df = self.fetch_and_cache_symbol(BENCHMARK_NIFTY50, period=period)

        n50_df = self.fetch_and_cache_symbol(BENCHMARK_NIFTY50, period=period)
        return sm_df, n50_df

    def fetch_and_cache_symbol(
        self, 
        symbol: str, 
        period: str = "5y", 
        max_retries: int = 3
    ) -> Optional[pd.DataFrame]:
        """
        Fetches adjusted multi-year OHLCV data for a single symbol with retry logic,
        auto_adjust=True for bonus/split protection, and persists to SQLite.
        """
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        yf_ticker = self._format_ticker(symbol)
        
        last_err = None
        for attempt in range(1, max_retries + 1):
            try:
                # auto_adjust=True handles stock splits, bonus shares, and dividends seamlessly
                ticker_obj = yf.Ticker(yf_ticker)
                df = ticker_obj.history(period=period, auto_adjust=True, interval="1d")
                
                if df is None or df.empty or len(df) < 10:
                    raise ValueError(f"Empty or insufficient data returned for {yf_ticker} (bars: {len(df) if df is not None else 0})")
                
                # Format into standard DataFrame
                df = df.reset_index()
                date_col = "Date" if "Date" in df.columns else "Datetime"
                df["date"] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")
                
                req_cols = ["open", "high", "low", "close", "volume"]
                for col in req_cols:
                    cap_col = col.capitalize()
                    if cap_col in df.columns:
                        df[col] = df[cap_col].astype(float)
                    elif col in df.columns:
                        df[col] = df[col].astype(float)
                    else:
                        raise ValueError(f"Missing column {col} in yfinance response")

                clean_df = df[["date", "open", "high", "low", "close", "volume"]].copy()
                clean_df = clean_df.dropna().drop_duplicates(subset=["date"]).sort_values("date")
                
                # Save to SQLite
                self._save_candles_to_db(clean_sym, clean_df)
                self._record_ticker_status(clean_sym, "OK", len(clean_df), None)

                # Update stock ATH if fetched history has higher price
                if not clean_df.empty:
                    max_h_idx = clean_df["high"].idxmax()
                    max_h = float(clean_df.loc[max_h_idx, "high"])
                    max_d = str(clean_df.loc[max_h_idx, "date"])
                    self.update_stock_ath(clean_sym, max_h, max_d)
                
                return clean_df

            except Exception as e:
                last_err = str(e)
                wait_time = (2 ** attempt) + random.uniform(0.1, 0.5)
                logger.warning(f"[Attempt {attempt}/{max_retries}] Fetch failed for {symbol} ({yf_ticker}): {last_err}. Retrying in {wait_time:.1f}s...")
                time.sleep(wait_time)

        # Record error in database
        logger.error(f"Permanently failed to fetch {symbol} after {max_retries} attempts: {last_err}")
        self._record_ticker_status(clean_sym, "ERROR", 0, last_err)
        return None

    def _save_candles_to_db(self, symbol: str, df: pd.DataFrame):
        """Persists daily candles into SQLite database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            records = [
                (
                    symbol,
                    row["date"],
                    float(row["open"]),
                    float(row["high"]),
                    float(row["low"]),
                    float(row["close"]),
                    float(row["volume"])
                )
                for _, row in df.iterrows()
            ]
            cursor.executemany("""
                INSERT OR REPLACE INTO daily_candles (symbol, date, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, records)
            conn.commit()

    def _record_ticker_status(self, symbol: str, status: str, bar_count: int, error_message: Optional[str]):
        """Logs ticker fetch status and silent drops in SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT OR REPLACE INTO ticker_status (symbol, status, last_attempt, error_message, bar_count)
                VALUES (?, ?, ?, ?, ?)
            """, (symbol, status, now_str, error_message, bar_count))
            conn.commit()

    def get_cached_candles(self, symbol: str) -> Optional[pd.DataFrame]:
        """Retrieves cached candles from SQLite for instant access."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with sqlite3.connect(self.db_path) as conn:
            query = """
                SELECT date, open, high, low, close, volume
                FROM daily_candles
                WHERE symbol = ?
                ORDER BY date ASC
            """
            df = pd.read_sql_query(query, conn, params=(clean_sym,))
            if df.empty:
                return None
            return df

    def get_all_cached_symbols(self) -> List[str]:
        """Returns all symbols currently stored in the SQLite database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT symbol FROM daily_candles WHERE symbol NOT LIKE '^%'")
            return [row[0] for row in cursor.fetchall()]

    def get_latest_data_date(self) -> Optional[str]:
        """Returns the most recent trading candle date recorded in SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(date) FROM daily_candles WHERE symbol NOT LIKE '^%'")
            row = cursor.fetchone()
            return row[0] if (row and row[0]) else None

data_engine = DataEngine()
