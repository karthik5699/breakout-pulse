# -*- coding: utf-8 -*-
import sqlite3
import json
import os
import math
from datetime import datetime

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "market_data.db")
CSV_PATH = os.path.join(DATA_DIR, "nse_universe.csv")
OUTPUT_PATH = os.path.join(DATA_DIR, "screener_cache.json")

def export_cache():
    if not os.path.exists(DB_PATH):
        print("No market_data.db found to export.")
        return

    # Load universe names
    stock_names = {}
    if os.path.exists(CSV_PATH):
        import csv
        with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned = {k.strip(): v.strip() for k, v in row.items() if k is not None}
                sym = cleaned.get("SYMBOL", "").strip().upper()
                if sym:
                    stock_names[sym] = cleaned.get("NAME OF COMPANY", sym).strip()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT symbol FROM daily_candles")
    symbols = [r[0] for r in cursor.fetchall() if not r[0].startswith("^")]
    print(f"Exporting cache for {len(symbols)} symbols from SQLite...")

    results = []
    latest_date_overall = "2026-08-25"

    for sym in symbols:
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

        # Highs
        high_ath = max(highs)
        w52_bars = min(n_bars, 252)
        high_52w = max(highs[-w52_bars:])
        low_52w = min(lows[-w52_bars:])

        # Distances
        dist_to_52w = round(((current_price - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
        dist_to_ath = round(((current_price - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

        # Moving Averages
        sma50_bars = min(n_bars, 50)
        sma50 = sum(closes[-sma50_bars:]) / sma50_bars
        sma200_bars = min(n_bars, 200)
        sma200 = sum(closes[-sma200_bars:]) / sma200_bars

        # Volume Multiple
        vol_50_bars = min(n_bars, 50)
        vol_sma50 = sum(volumes[-vol_50_bars:]) / vol_50_bars if vol_50_bars > 0 else 1.0
        vol_multiple = round(volumes[-1] / vol_sma50, 2) if vol_sma50 > 0 else 1.0
        is_vol_confirmed = (vol_multiple >= 1.4)

        # Turnover (20d avg)
        t_bars = min(n_bars, 20)
        turnovers = [closes[-i] * volumes[-i] for i in range(1, t_bars + 1)]
        turnover_cr = round((sum(turnovers) / t_bars) / 1e7, 2) if t_bars > 0 else 0.0

        # Status categorization
        if n_bars < 500:
            status = "RECENT_LISTING"
        elif dist_to_ath >= -5.0 and dist_to_ath <= 2.0:
            status = "NEAR_ATH"
        elif dist_to_52w >= -0.5:
            status = "AT_52W_HIGH"
        elif dist_to_52w >= -10.0:
            status = "NEAR_52W_HIGH"
        else:
            status = "CONSOLIDATING"

        # Stage 2 Trend Check: Price > 50 SMA > 200 SMA
        passes_trend = bool(current_price > sma50 > sma200 and n_bars >= 100)

        name = stock_names.get(sym, sym)

        item = {
            "symbol": sym,
            "name": name,
            "current_price": round(current_price, 2),
            "change_pct": change_pct,
            "high_52w": round(high_52w, 2),
            "dist_to_52w_high_pct": dist_to_52w,
            "high_ath": round(high_ath, 2),
            "dist_to_ath_pct": dist_to_ath,
            "vol_multiple": vol_multiple,
            "is_volume_confirmed": is_vol_confirmed,
            "turnover_cr": turnover_cr,
            "rs_rating_smallmid": 75,
            "rs_rating_nifty50": 70,
            "passes_trend_check": passes_trend,
            "status": status,
            "sma_50": round(sma50, 2),
            "sma_200": round(sma200, 2),
            "bars_count": n_bars
        }
        results.append(item)

    conn.close()

    payload = {
        "last_scanned": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest_data_date": latest_date_overall,
        "total_cached": len(results),
        "results": results
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"Successfully generated {OUTPUT_PATH} with {len(results)} stocks!")

if __name__ == "__main__":
    export_cache()
