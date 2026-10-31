import sqlite3
import json
import os
import math
import sys
from typing import Optional
from datetime import datetime

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import pandas as pd
from backend.app.screener_engine import screener_engine

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "market_data.db")
CSV_PATH = os.path.join(DATA_DIR, "nse_universe.csv")
OUTPUT_PATH = os.path.join(DATA_DIR, "screener_cache.json")

def export_cache(as_of_date: Optional[str] = None):
    if not os.path.exists(DB_PATH):
        print("No market_data.db found to export.")
        return

    # Load universe names and listing dates
    stock_names = {}
    stock_listing_dates = {}
    if os.path.exists(CSV_PATH):
        import csv
        with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned = {k.strip(): (v or "").strip() for k, v in row.items() if k is not None and not isinstance(v, list)}
                sym = cleaned.get("SYMBOL", "").strip().upper()
                if sym:
                    stock_names[sym] = cleaned.get("NAME OF COMPANY", sym).strip()
                    stock_listing_dates[sym] = cleaned.get("DATE OF LISTING", "").strip()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Safeguard: ensure database has sufficient multi-year historical depth
    # Overwriting the pre-calculated 5-year cache from SQLite requires at least 1,500 stocks with >= 200 trading days
    cursor.execute("SELECT COUNT(*) FROM (SELECT symbol FROM daily_candles GROUP BY symbol HAVING COUNT(*) >= 200)")
    mature_row = cursor.fetchone()
    mature_count = mature_row[0] if mature_row else 0
    if mature_count < 1500:
        print(f"Skipping cache overwrite: only {mature_count} stocks have >= 200 trading days in SQLite. Full universe history required (>= 1,500 mature stocks). Existing cache preserved.")
        conn.close()
        return 0

    # Load verified lifetime ATHs from stock_ath table
    stock_aths = {}
    try:
        cursor.execute("SELECT symbol, ath_price FROM stock_ath")
        stock_aths = {r[0]: float(r[1]) for r in cursor.fetchall() if r[1] is not None}
    except Exception as e:
        print(f"Warning: could not load stock_ath: {e}")

    cursor.execute("SELECT DISTINCT symbol FROM daily_candles")
    symbols = [r[0] for r in cursor.fetchall() if not r[0].startswith("^")]
    print(f"Exporting cache for {len(symbols)} symbols from SQLite as of {as_of_date or 'latest'}...")

    def load_bench_df(bench_sym):
        if as_of_date:
            cursor.execute(
                "SELECT date, close FROM daily_candles WHERE symbol = ? AND date <= ? ORDER BY date ASC",
                (bench_sym, as_of_date)
            )
        else:
            cursor.execute(
                "SELECT date, close FROM daily_candles WHERE symbol = ? ORDER BY date ASC",
                (bench_sym,)
            )
        b_rows = cursor.fetchall()
        if b_rows:
            return pd.DataFrame(b_rows, columns=["date", "close"])
        return None

    sm_bench = load_bench_df("NIFTYSMLCAP250")
    if sm_bench is None:
        sm_bench = load_bench_df("NIFTYSMLCAP250.NS")
    if sm_bench is None:
        sm_bench = load_bench_df("^NSEI")

    n50_bench = load_bench_df("^NSEI")

    stock_items = {}
    stock_dfs = {}
    latest_date_overall = as_of_date or "2026-08-25"

    for sym in symbols:
        if as_of_date:
            cursor.execute(
                "SELECT date, open, high, low, close, volume FROM daily_candles WHERE symbol = ? AND date <= ? ORDER BY date ASC",
                (sym, as_of_date)
            )
        else:
            cursor.execute(
                "SELECT date, open, high, low, close, volume FROM daily_candles WHERE symbol = ? ORDER BY date ASC",
                (sym,)
            )
        rows = cursor.fetchall()
        if not rows or len(rows) < 15:
            continue

        n_bars = len(rows)
        dates = [r[0] for r in rows]
        opens = [r[1] for r in rows]
        highs = [r[2] for r in rows]
        lows = [r[3] for r in rows]
        closes = [r[4] for r in rows]
        volumes = [r[5] for r in rows]

        if dates[-1] > latest_date_overall:
            latest_date_overall = dates[-1]

        current_price = closes[-1]
        prev_close = closes[-2] if n_bars >= 2 else opens[-1]
        change_pct = round(((current_price - prev_close) / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

        # Liquidity Check (last 20 days)
        last_20_vols = volumes[-min(20, n_bars):]
        last_20_closes = closes[-min(20, n_bars):]
        active_days = sum(1 for v in last_20_vols if v > 0)
        
        turnovers_20 = [c * v for c, v in zip(last_20_closes, last_20_vols)]
        if len(turnovers_20) > 5:
            sorted_t20 = sorted(turnovers_20)
            # Exclude single highest 1-day outlier spike if it is > 4x the rest of the 20-day mean
            rest_mean = sum(sorted_t20[:-1]) / (len(sorted_t20) - 1)
            if sorted_t20[-1] > 4.0 * rest_mean:
                turnover_cr = round(rest_mean / 1e7, 2)
            else:
                turnover_cr = round((sum(turnovers_20) / len(turnovers_20)) / 1e7, 2)
        else:
            turnover_cr = round((sum(turnovers_20) / len(turnovers_20)) / 1e7, 2) if turnovers_20 else 0.0

        # Require >= 15 active non-zero trading days and >= ₹25 Lakhs/day turnover
        passes_liquidity = bool(active_days >= 15 and turnover_cr >= 0.25)

        # Highs
        high_ath = max(max(highs), stock_aths.get(sym, 0.0))
        w52_bars = min(n_bars, 252)
        high_52w = max(highs[-w52_bars:])
        low_52w = min(lows[-w52_bars:])

        # Distances
        dist_to_52w = round(((current_price - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
        dist_to_ath = round(((current_price - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

        # Moving Averages (require full window so short-history stocks don't get fake MAs)
        sma20 = (sum(closes[-20:]) / 20.0) if n_bars >= 20 else None
        sma50 = (sum(closes[-50:]) / 50.0) if n_bars >= 50 else None
        sma100 = (sum(closes[-100:]) / 100.0) if n_bars >= 100 else None
        sma200 = (sum(closes[-200:]) / 200.0) if n_bars >= 200 else None

        sma200_slope_60d_pct = None
        if n_bars >= 260 and sma200 is not None:
            sma200_60d_ago = sum(closes[-260:-60]) / 200.0
            if sma200_60d_ago > 0:
                sma200_slope_60d_pct = round(((sma200 - sma200_60d_ago) / sma200_60d_ago) * 100.0, 2)
        elif n_bars > 200 and sma200 is not None:
            sma200_prev = sum(closes[:200]) / 200.0
            if sma200_prev > 0:
                sma200_slope_60d_pct = round(((sma200 - sma200_prev) / sma200_prev) * 100.0, 2)

        # Volume Multiple: Require >= 5,000 shares for confirmed institutional volume
        vol_50_bars = min(n_bars, 50)
        vol_sma50 = sum(volumes[-vol_50_bars:]) / vol_50_bars if vol_50_bars > 0 else 1.0
        vol_multiple = round(volumes[-1] / vol_sma50, 2) if vol_sma50 > 0 else 1.0
        is_vol_confirmed = bool(passes_liquidity and vol_multiple >= 1.4 and volumes[-1] >= 5000)

        # Determine genuine recent listing from official exchange listing date
        is_recent = False
        list_date_str = stock_listing_dates.get(sym)
        if list_date_str:
            try:
                dt = datetime.strptime(list_date_str, "%d-%b-%Y")
                is_recent = (datetime.now() - dt).days <= 730
            except Exception:
                is_recent = False

        # Strict Moving Average Rule: A stock cannot enter breakout lists if trading below 50 SMA or 200 SMA
        is_above_mas = True
        if sma50 is not None and current_price < sma50:
            is_above_mas = False
        if sma200 is not None and current_price < sma200:
            is_above_mas = False

        # Status categorization:
        if not passes_liquidity:
            status = "ILLIQUID"
            status_label = "Illiquid / Inactive"
        elif not is_above_mas:
            status = "CONSOLIDATING"
            status_label = "Consolidating"
        elif is_recent and dist_to_52w >= -10.0:
            status = "RECENT_LISTING"
            status_label = "Recent Listing (<2Y)"
        elif dist_to_ath >= -10.0 and dist_to_ath <= 10.0 and n_bars >= 500:
            status = "NEAR_ATH"
            status_label = "All-Time High (ATH)"
        elif dist_to_52w >= -0.5:
            status = "AT_52W_HIGH"
            status_label = "52-Week Breakout"
        elif dist_to_52w >= -10.0:
            status = "NEAR_52W_HIGH"
            status_label = "Near 52W High"
        else:
            status = "CONSOLIDATING"
            status_label = "Consolidating"

        # Top 10 Momentum Oscillators, ROC, Persistence & Smoothness Metrics
        rsi14, adx14, atr14_pct = screener_engine.compute_wilder_oscillators(highs, lows, closes, period=14)
        roc21, roc63, roc126 = screener_engine.compute_roc_metrics(closes)
        sma200_21d_ago, days_above_ma50_20d, r2_63d = screener_engine.compute_persistence_and_smoothness(closes)

        # Stage 2 Trend Check: Price > 50 SMA, 50 SMA > 200 SMA, and rising 200 SMA (MA200 > MA200[21])
        passes_trend = bool(
            passes_liquidity
            and sma50 is not None
            and sma200 is not None
            and current_price > sma50
            and sma50 > sma200
            and n_bars >= 200
            and (sma200_21d_ago is None or sma200 > sma200_21d_ago)
        )

        from backend.app.universe_store import universe_store
        name = stock_names.get(sym, sym)

        item = {
            "symbol": sym,
            "name": name,
            "current_price": round(current_price, 2),
            "change_pct": change_pct,
            "volume": float(volumes[-1]),
            "vol_multiple": vol_multiple,
            "is_volume_confirmed": is_vol_confirmed,
            "status": status,
            "status_label": status_label,
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "high_ath": round(high_ath, 2),
            "dist_to_52w_high_pct": dist_to_52w,
            "dist_to_ath_pct": dist_to_ath,
            "rs_rating_smallmid": 50,
            "rs_rating_nifty50": 50,
            "turnover_cr": turnover_cr,
            "active_days_20d": active_days,
            "trading_days": n_bars,
            "is_recently_listed": is_recent,
            "sma20": round(sma20, 2) if sma20 is not None else None,
            "sma50": round(sma50, 2) if sma50 is not None else None,
            "sma100": round(sma100, 2) if sma100 is not None else None,
            "sma200": round(sma200, 2) if sma200 is not None else None,
            "sma200_21d_ago": sma200_21d_ago,
            "sma200_slope_60d_pct": sma200_slope_60d_pct,
            "days_above_ma50_20d": days_above_ma50_20d,
            "r2_63d": r2_63d,
            "passes_trend_check": passes_trend,
            "passes_liquidity": passes_liquidity,
            "is_fno": universe_store.is_fno(sym),
            "fno_lot_size": universe_store.get_fno_lot_size(sym),
            "rsi14": rsi14,
            "adx14": adx14,
            "atr14_pct": atr14_pct,
            "roc21": roc21,
            "roc63": roc63,
            "roc126": roc126,
            "passes_top10_step1": False,
            "composite_score": None,
            "top10_rank": None
        }
        item["passes_top10_step1"] = screener_engine.check_top10_step1(item, require_vol_confirm=False)
        stock_dfs[sym] = pd.DataFrame({"close": closes})
        stock_items[sym] = item

    conn.close()

    print(f"Computing RS ratings for {len(stock_dfs)} stocks against benchmarks...")
    rs_ratings = screener_engine.compute_rs_ratings(stock_dfs, sm_bench, n50_bench)

    results = []
    for sym, item in stock_items.items():
        rs_sm, rs_n50 = rs_ratings.get(sym, (50, 50))
        item["rs_rating_smallmid"] = rs_sm
        item["rs_rating_nifty50"] = rs_n50
        results.append(item)

    # Compute Top 10 Composite Scores & Ranks across Step 1 shortlisted stocks
    top10_ranked = screener_engine.rank_top10_momentum(results, require_vol_confirm=False)
    top10_map = {x["symbol"]: (x.get("composite_score"), x.get("top10_rank")) for x in top10_ranked}
    for item in results:
        sym = item["symbol"]
        if sym in top10_map:
            item["composite_score"], item["top10_rank"] = top10_map[sym]

    if len(results) < 1500:
        print(f"Skipping cache overwrite: only {len(results)} stocks computed from SQLite (insufficient database history for full universe). Existing cache preserved.")
        return 0

    payload = {
        "last_scanned": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest_data_date": latest_date_overall,
        "total_cached": len(results),
        "results": results
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"Successfully generated {OUTPUT_PATH} with {len(results)} stocks!")
    return len(results)

if __name__ == "__main__":
    export_cache()

