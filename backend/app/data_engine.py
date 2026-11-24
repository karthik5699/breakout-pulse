# -*- coding: utf-8 -*-
import os
import sqlite3
import time
import logging
import random
import threading
from collections import OrderedDict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd
import numpy as np
import yfinance as yf

IST = ZoneInfo("Asia/Kolkata")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "market_data.db")

SEED_GZ_PATH = os.path.join(DATA_DIR, "market_data_seed.db.gz")

BENCHMARK_NIFTY50 = "^NSEI"               # Nifty 50 Index (Largecap broad market context)
BENCHMARK_SMALLMID = "NIFTYSMLCAP250.NS"   # Nifty Smallcap 250 (Primary Small/Midcap benchmark)
BENCHMARK_MIDCAP = "NIFTYMIDCAP150.NS"     # Nifty Midcap 150


def sanitize_and_adjust_candles(
    dates: List[str],
    opens: List[float],
    highs: List[float],
    lows: List[float],
    closes: List[float],
    volumes: List[float],
) -> Tuple[List[str], List[float], List[float], List[float], List[float], List[float], float, Optional[str]]:
    """
    Sanitizes single-bar corrupted price spikes and backward-adjusts unadjusted corporate
    action discontinuities (splits, bonuses, reverse splits/consolidations).
    Returns (dates, opens, highs, lows, closes, volumes, cumulative_adj_factor, latest_action_date).
    """
    d_out = list(dates)
    o_out = [float(x) for x in opens]
    h_out = [float(x) for x in highs]
    l_out = [float(x) for x in lows]
    c_out = [float(x) for x in closes]
    v_out = [float(x) for x in volumes]
    n = len(c_out)

    if n < 2:
        return d_out, o_out, h_out, l_out, c_out, v_out, 1.0, None

    # Pass 1: Single-bar corrupted spike filter (e.g., isolated bad print reverting next session)
    for i in range(1, n - 1):
        prev_c = c_out[i - 1]
        next_c = c_out[i + 1]
        curr_c = c_out[i]
        if prev_c > 0 and next_c > 0 and curr_c > 0:
            pair_ratio = next_c / prev_c
            if 0.80 <= pair_ratio <= 1.25:
                if (curr_c / prev_c > 1.45 and curr_c / next_c > 1.45) or (
                    curr_c / prev_c < 0.60 and curr_c / next_c < 0.60
                ):
                    mid = round((prev_c + next_c) / 2.0, 2)
                    o_out[i] = mid
                    h_out[i] = mid
                    l_out[i] = mid
                    c_out[i] = mid

    # Pass 2: Backward adjustment for unadjusted corporate actions (splits, bonuses, reverse splits)
    cumulative_adj_factor = 1.0
    latest_action_date: Optional[str] = None

    for i in range(n - 1, 0, -1):
        prev_c = c_out[i - 1]
        curr_o = o_out[i]
        curr_c = c_out[i]
        if max(prev_c, curr_o, curr_c) < 5.0 or prev_c <= 0 or curr_o <= 0 or curr_c <= 0:
            continue

        r_open = curr_o / prev_c
        r_close = curr_c / prev_c
        if (r_open > 1.45 and r_close > 1.45) or (r_open < 0.60 and r_close < 0.60):
            factor = r_open
            for j in range(i):
                o_out[j] *= factor
                h_out[j] *= factor
                l_out[j] *= factor
                c_out[j] *= factor
                if factor > 0:
                    v_out[j] /= factor
            cumulative_adj_factor *= factor
            if latest_action_date is None:
                latest_action_date = d_out[i]

    return d_out, o_out, h_out, l_out, c_out, v_out, cumulative_adj_factor, latest_action_date


def sanitize_candles_df(df: Optional[pd.DataFrame]) -> Tuple[Optional[pd.DataFrame], float, Optional[str]]:
    """Applies sanitize_and_adjust_candles to a candle DataFrame and returns (adjusted_df, adj_factor, action_date)."""
    if df is None or df.empty or len(df) < 2:
        return (df.copy() if df is not None else None), 1.0, None
    dates, opens, highs, lows, closes, volumes, adj_factor, action_date = sanitize_and_adjust_candles(
        df["date"].astype(str).tolist(),
        df["open"].tolist(),
        df["high"].tolist(),
        df["low"].tolist(),
        df["close"].tolist(),
        df["volume"].tolist(),
    )
    out = df.copy().reset_index(drop=True)
    out["date"] = dates
    out["open"] = opens
    out["high"] = highs
    out["low"] = lows
    out["close"] = closes
    out["volume"] = volumes
    return out, adj_factor, action_date


class DataEngine:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._intraday_cache: OrderedDict[str, Tuple[float, pd.DataFrame]] = OrderedDict()
        self._intraday_lock = threading.Lock()
        self._intraday_max_entries = 64
        self._intraday_ttl_sec = 300
        self._sparkline_cache: Dict[Tuple[str, int], List[float]] = {}
        self._sparkline_lock = threading.Lock()
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._seed_db_if_needed()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        """Opens a SQLite connection configured with busy timeout for concurrent access."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

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
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
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
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ath_price FROM stock_ath WHERE symbol = ?", (clean_sym,))
            row = cursor.fetchone()
            return float(row[0]) if (row and row[0] is not None) else None

    def get_all_stock_aths(self) -> Dict[str, float]:
        """Retrieves all verified lifetime All-Time High prices as a dictionary."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT symbol, ath_price FROM stock_ath")
            return {row[0]: float(row[1]) for row in cursor.fetchall() if row[1] is not None}

    def update_stock_ath(self, symbol: str, ath_price: float, ath_date: str, force_overwrite: bool = False):
        """Updates or inserts lifetime All-Time High if new price exceeds existing ATH (or force_overwrite=True)."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ath_price FROM stock_ath WHERE symbol = ?", (clean_sym,))
            row = cursor.fetchone()
            if force_overwrite or row is None or row[0] is None or float(ath_price) > float(row[0]):
                now_str = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
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

    def refresh_benchmarks(self) -> None:
        """Incrementally refreshes benchmark indices while preserving full multi-year history."""
        sm_cached = self.get_cached_candles(BENCHMARK_SMALLMID)
        sm_period = "6mo" if (sm_cached is not None and len(sm_cached) >= 200) else "5y"
        try:
            sm_df = self.fetch_and_cache_symbol(BENCHMARK_SMALLMID, period=sm_period, max_retries=1)
        except Exception:
            sm_df = None
        if sm_df is None:
            mid_cached = self.get_cached_candles(BENCHMARK_MIDCAP)
            mid_period = "6mo" if (mid_cached is not None and len(mid_cached) >= 200) else "5y"
            try:
                self.fetch_and_cache_symbol(BENCHMARK_MIDCAP, period=mid_period, max_retries=1)
            except Exception:
                pass

        n50_cached = self.get_cached_candles(BENCHMARK_NIFTY50)
        n50_period = "6mo" if (n50_cached is not None and len(n50_cached) >= 200) else "5y"
        try:
            self.fetch_and_cache_symbol(BENCHMARK_NIFTY50, period=n50_period, max_retries=1)
        except Exception:
            pass

    def fetch_and_cache_symbol(
        self, 
        symbol: str, 
        period: str = "5y", 
        max_retries: int = 3,
        force_ath_reset: bool = False
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
                clean_df = clean_df.dropna().drop_duplicates(subset=["date"]).sort_values("date").reset_index(drop=True)

                # Sanitize corporate action discontinuities (missed splits/demergers) before storing & computing ATH
                clean_df, _, _ = sanitize_candles_df(clean_df)

                # Compute full-history ATH before trimming daily_candles window
                max_h = None
                max_d = None
                if not clean_df.empty:
                    max_h_idx = clean_df["high"].idxmax()
                    max_h = float(clean_df.loc[max_h_idx, "high"])
                    max_d = str(clean_df.loc[max_h_idx, "date"])

                candles_to_save = clean_df.tail(1300).copy() if (period == "max" and len(clean_df) > 1300) else clean_df
                replace_history = period in ("2y", "5y", "10y", "max")

                # Save to SQLite
                self._save_candles_to_db(clean_sym, candles_to_save, replace_up_to_max_date=replace_history)
                status_label = "OK_MAX" if (period == "max" or force_ath_reset) else "OK"
                self._record_ticker_status(clean_sym, status_label, len(candles_to_save), None)

                # Update stock ATH (resetting downward if force_ath_reset or full max history fetched)
                if max_h is not None and max_d is not None:
                    self.update_stock_ath(
                        clean_sym,
                        max_h,
                        max_d,
                        force_overwrite=(force_ath_reset or period == "max"),
                    )
                
                return candles_to_save

            except Exception as e:
                last_err = str(e)
                wait_time = (2 ** attempt) + random.uniform(0.1, 0.5)
                logger.warning(f"[Attempt {attempt}/{max_retries}] Fetch failed for {symbol} ({yf_ticker}): {last_err}")
                if attempt < max_retries:
                    time.sleep(wait_time)

        # Record error in database
        logger.error(f"Permanently failed to fetch {symbol} after {max_retries} attempts: {last_err}")
        self._record_ticker_status(clean_sym, "ERROR", 0, last_err)
        return None

    def _save_candles_to_db(self, symbol: str, df: pd.DataFrame, replace_up_to_max_date: bool = False):
        """Persists daily candles into SQLite database."""
        with self._connect() as conn:
            cursor = conn.cursor()
            if replace_up_to_max_date and not df.empty:
                max_date = str(df["date"].max())
                cursor.execute(
                    "DELETE FROM daily_candles WHERE symbol = ? AND date <= ?",
                    (symbol, max_date),
                )
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
        with self._sparkline_lock:
            for k in [k for k in self._sparkline_cache if k[0] == symbol]:
                self._sparkline_cache.pop(k, None)

    def _record_ticker_status(self, symbol: str, status: str, bar_count: int, error_message: Optional[str]):
        """Logs ticker fetch status and silent drops in SQLite."""
        with self._connect() as conn:
            cursor = conn.cursor()
            now_str = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT OR REPLACE INTO ticker_status (symbol, status, last_attempt, error_message, bar_count)
                VALUES (?, ?, ?, ?, ?)
            """, (symbol, status, now_str, error_message, bar_count))
            conn.commit()

    def get_ticker_status(self, symbol: str) -> Optional[Tuple[str, str, int]]:
        """Returns (status, last_attempt, bar_count) for a symbol if recorded."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT status, last_attempt, bar_count FROM ticker_status WHERE symbol = ?",
                (clean_sym,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return str(row[0]), str(row[1]), int(row[2] or 0)

    def get_cached_candles(self, symbol: str) -> Optional[pd.DataFrame]:
        """Retrieves cached candles from SQLite for instant access."""
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        with self._connect() as conn:
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
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT symbol FROM daily_candles WHERE symbol NOT LIKE '^%'")
            return [row[0] for row in cursor.fetchall()]

    def clear_sparkline_cache(self) -> None:
        """Clears cached closing-price sparklines after bulk Bhavcopy ingestion."""
        with self._sparkline_lock:
            self._sparkline_cache.clear()

    def get_sparklines(self, symbols: List[str], days: int = 30) -> Dict[str, List[float]]:
        """Batch-fetches sanitized trailing closing prices for table/inspector sparklines."""
        if not symbols or days <= 0:
            return {}

        cleaned_pairs: List[Tuple[str, str]] = []
        seen_clean = set()
        for sym in symbols:
            if not sym:
                continue
            clean = self._clean_symbol(sym) if not sym.startswith("^") else sym
            cleaned_pairs.append((sym, clean))
            seen_clean.add(clean)

        out_by_clean: Dict[str, List[float]] = {}
        missing: List[str] = []
        with self._sparkline_lock:
            for clean in seen_clean:
                cached = self._sparkline_cache.get((clean, days))
                if cached is not None:
                    out_by_clean[clean] = list(cached)
                else:
                    missing.append(clean)

        if missing:
            lookback = days + 5
            fetched_rows: Dict[str, List[Tuple[str, float, float, float, float, float]]] = {}
            chunk_size = 400
            with self._connect() as conn:
                cursor = conn.cursor()
                for i in range(0, len(missing), chunk_size):
                    chunk = missing[i : i + chunk_size]
                    placeholders = ",".join("?" for _ in chunk)
                    sql = f"""
                        SELECT symbol, date, open, high, low, close, volume
                        FROM (
                            SELECT symbol, date, open, high, low, close, volume,
                                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
                            FROM daily_candles
                            WHERE symbol IN ({placeholders})
                        )
                        WHERE rn <= ?
                        ORDER BY symbol ASC, date ASC
                    """
                    cursor.execute(sql, [*chunk, lookback])
                    for sym_row, dt, o, h, l, c, v in cursor.fetchall():
                        fetched_rows.setdefault(sym_row, []).append((dt, o, h, l, c, v))

            newly_cached: Dict[Tuple[str, int], List[float]] = {}
            for clean in missing:
                bars = fetched_rows.get(clean, [])
                if not bars:
                    series: List[float] = []
                else:
                    dates = [b[0] for b in bars]
                    opens = [b[1] for b in bars]
                    highs = [b[2] for b in bars]
                    lows = [b[3] for b in bars]
                    closes = [b[4] for b in bars]
                    vols = [b[5] for b in bars]
                    _, _, _, _, adj_closes, _, _, _ = sanitize_and_adjust_candles(
                        dates, opens, highs, lows, closes, vols
                    )
                    series = [round(float(x), 2) for x in adj_closes[-days:]]
                out_by_clean[clean] = series
                newly_cached[(clean, days)] = list(series)

            with self._sparkline_lock:
                self._sparkline_cache.update(newly_cached)

        return {orig: list(out_by_clean.get(clean, [])) for orig, clean in cleaned_pairs}

    def get_latest_complete_data_date(self, min_symbols: int = 500) -> Optional[str]:
        """Returns the most recent trading session date having at least min_symbols equity candles."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT date
                FROM daily_candles
                WHERE symbol NOT LIKE '^%'
                GROUP BY date
                HAVING COUNT(*) >= ?
                ORDER BY date DESC
                LIMIT 1
                """,
                (min_symbols,),
            )
            row = cursor.fetchone()
            if row and row[0]:
                return row[0]
            cursor.execute("SELECT MAX(date) FROM daily_candles WHERE symbol NOT LIKE '^%'")
            row = cursor.fetchone()
            return row[0] if (row and row[0]) else None

    def get_latest_data_date(self) -> Optional[str]:
        """Returns the most recent complete trading candle date recorded in SQLite."""
        return self.get_latest_complete_data_date()

    def resample_weekly_candles(self, df: pd.DataFrame) -> pd.DataFrame:
        """Aggregates daily OHLCV candles into Monday-anchored weekly candles."""
        if df is None or df.empty:
            return df
        wdf = df.copy()
        wdf["dt"] = pd.to_datetime(wdf["date"])
        wdf = wdf.sort_values("dt")
        wdf["week_start"] = wdf["dt"] - pd.to_timedelta(wdf["dt"].dt.weekday, unit="D")
        weekly = (
            wdf.groupby("week_start", as_index=False)
            .agg(
                date=("date", "last"),
                open=("open", "first"),
                high=("high", "max"),
                low=("low", "min"),
                close=("close", "last"),
                volume=("volume", "sum"),
            )
            .sort_values("date")
            .reset_index(drop=True)
        )
        return weekly[["date", "open", "high", "low", "close", "volume"]]

    def _prune_intraday_cache_locked(self, now_ts: float) -> None:
        expired = [k for k, (ts, _) in self._intraday_cache.items() if (now_ts - ts) >= self._intraday_ttl_sec]
        for k in expired:
            self._intraday_cache.pop(k, None)
        while len(self._intraday_cache) > self._intraday_max_entries:
            self._intraday_cache.popitem(last=False)

    def get_intraday_candles(
        self,
        symbol: str,
        interval: str = "1h",
        period: str = "6mo",
        fallback_daily_df: Optional[pd.DataFrame] = None,
    ) -> Tuple[Optional[pd.DataFrame], bool]:
        """
        Fetches intraday (e.g. 1h) OHLCV candles from yfinance with an in-memory bounded TTL cache.
        Converts timestamps to IST wall-clock Unix epoch seconds for Lightweight Charts.
        Falls back to synthesizing 7 hourly candles per session from daily bars if offline,
        returning (df, is_synthetic).
        """
        clean_sym = self._clean_symbol(symbol) if not symbol.startswith("^") else symbol
        cache_key = f"{clean_sym}:{interval}:{period}"
        now_ts = time.time()

        with self._intraday_lock:
            self._prune_intraday_cache_locked(now_ts)
            cached = self._intraday_cache.get(cache_key)
            if cached is not None and (now_ts - cached[0]) < self._intraday_ttl_sec:
                self._intraday_cache.move_to_end(cache_key)
                return cached[1].copy(), False

        candidates = [f"{clean_sym}.NS", f"{clean_sym}.BO"] if not clean_sym.startswith("^") else [clean_sym]
        for yf_ticker in candidates:
            try:
                ticker_obj = yf.Ticker(yf_ticker)
                raw = ticker_obj.history(period=period, interval=interval, auto_adjust=True)
                if raw is None or raw.empty or len(raw) < 5:
                    continue

                raw = raw.reset_index()
                date_col = "Datetime" if "Datetime" in raw.columns else ("Date" if "Date" in raw.columns else raw.columns[0])
                dt_series = pd.to_datetime(raw[date_col])
                if dt_series.dt.tz is not None:
                    dt_series = dt_series.dt.tz_convert("Asia/Kolkata").dt.tz_localize(None)

                raw["time_ts"] = ((dt_series - pd.Timestamp("1970-01-01")) // pd.Timedelta("1s")).astype(np.int64)
                for col in ["open", "high", "low", "close", "volume"]:
                    cap = col.capitalize()
                    raw[col] = raw[cap].astype(float) if cap in raw.columns else raw[col].astype(float)

                clean_df = raw[["time_ts", "open", "high", "low", "close", "volume"]].copy()
                clean_df = (
                    clean_df.dropna()
                    .drop_duplicates(subset=["time_ts"])
                    .sort_values("time_ts")
                    .reset_index(drop=True)
                )
                if not clean_df.empty:
                    with self._intraday_lock:
                        self._intraday_cache[cache_key] = (time.time(), clean_df)
                        self._intraday_cache.move_to_end(cache_key)
                        self._prune_intraday_cache_locked(time.time())
                    return clean_df.copy(), False
            except Exception as e:
                logger.warning(f"Intraday ({interval}) fetch failed for {yf_ticker}: {e}")

        # Graceful fallback: synthesize 7 hourly bars (09:15..15:15 IST) per daily session
        if fallback_daily_df is not None and not fallback_daily_df.empty:
            daily_tail = fallback_daily_df.tail(90).reset_index(drop=True)
            rows = []
            hours_offsets = [
                9 * 3600 + 15 * 60,
                10 * 3600 + 15 * 60,
                11 * 3600 + 15 * 60,
                12 * 3600 + 15 * 60,
                13 * 3600 + 15 * 60,
                14 * 3600 + 15 * 60,
                15 * 3600 + 15 * 60,
            ]
            vol_weights = [0.22, 0.15, 0.12, 0.10, 0.11, 0.13, 0.17]
            for _, drow in daily_tail.iterrows():
                base_ts = int((pd.Timestamp(str(drow["date"])) - pd.Timestamp("1970-01-01")) // pd.Timedelta("1s"))
                o_day = float(drow["open"])
                h_day = float(drow["high"])
                l_day = float(drow["low"])
                c_day = float(drow["close"])
                v_day = float(drow["volume"])
                # Smooth intraday waypoints hitting open, low/high, and close
                if c_day >= o_day:
                    waypoints = [
                        o_day,
                        l_day + 0.25 * (o_day - l_day),
                        l_day,
                        o_day + 0.45 * (c_day - o_day),
                        o_day + 0.70 * (c_day - o_day),
                        h_day,
                        h_day - 0.30 * (h_day - c_day),
                        c_day,
                    ]
                else:
                    waypoints = [
                        o_day,
                        h_day - 0.25 * (h_day - o_day),
                        h_day,
                        o_day - 0.45 * (o_day - c_day),
                        o_day - 0.70 * (o_day - c_day),
                        l_day,
                        l_day + 0.30 * (c_day - l_day),
                        c_day,
                    ]
                for idx_h in range(7):
                    ho = waypoints[idx_h]
                    hc = waypoints[idx_h + 1]
                    spread = (h_day - l_day) * 0.12
                    hh = min(h_day, max(ho, hc) + spread * 0.5)
                    hl = max(l_day, min(ho, hc) - spread * 0.5)
                    if idx_h == 2 and c_day < o_day:
                        hh = h_day
                    if idx_h == 2 and c_day >= o_day:
                        hl = l_day
                    if idx_h == 5 and c_day >= o_day:
                        hh = h_day
                    if idx_h == 5 and c_day < o_day:
                        hl = l_day
                    rows.append({
                        "time_ts": base_ts + hours_offsets[idx_h],
                        "open": round(ho, 2),
                        "high": round(max(hh, ho, hc), 2),
                        "low": round(min(hl, ho, hc), 2),
                        "close": round(hc, 2),
                        "volume": round(v_day * vol_weights[idx_h], 2),
                    })
            if rows:
                synth_df = pd.DataFrame(rows)
                return synth_df, True

        return None, False

data_engine = DataEngine()
