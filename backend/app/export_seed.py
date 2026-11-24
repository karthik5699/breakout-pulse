import json
import os
import sys
from typing import Optional
from datetime import datetime
from zoneinfo import ZoneInfo

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import pandas as pd
from backend.app.screener_engine import screener_engine
from backend.app.data_engine import data_engine, sanitize_and_adjust_candles

IST = ZoneInfo("Asia/Kolkata")
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "market_data.db")
CSV_PATH = os.path.join(DATA_DIR, "nse_universe.csv")
OUTPUT_PATH = os.path.join(DATA_DIR, "screener_cache.json")

def export_cache(as_of_date: Optional[str] = None):
    if not os.path.exists(DB_PATH):
        print("No market_data.db found to export.")
        return 0

    if as_of_date is None:
        as_of_date = data_engine.get_latest_complete_data_date()

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

    conn = data_engine._connect()
    cursor = conn.cursor()

    # Load existing cache if present so stocks with partial local SQLite history preserve multi-year MAs/52W/ATH
    existing_cache_map = {}
    cache_date = None
    if os.path.exists(OUTPUT_PATH):
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing_payload = json.load(f)
                cache_date = existing_payload.get("latest_data_date")
                for prev_item in existing_payload.get("results", []):
                    s_key = prev_item.get("symbol", "").strip().upper()
                    if s_key:
                        existing_cache_map[s_key] = prev_item
        except Exception as e:
            print(f"Warning: could not read existing cache at {OUTPUT_PATH}: {e}")

    # Safeguard: ensure database + baseline cache have sufficient multi-year historical depth
    cursor.execute("SELECT COUNT(*) FROM (SELECT symbol FROM daily_candles GROUP BY symbol HAVING COUNT(*) >= 200)")
    mature_row = cursor.fetchone()
    mature_count = mature_row[0] if mature_row else 0
    cached_mature_count = sum(1 for x in existing_cache_map.values() if (x.get("trading_days") or 0) >= 200)
    if mature_count < 1500 and cached_mature_count < 1500:
        print(f"Skipping cache overwrite: only {mature_count} stocks have >= 200 trading days in SQLite (and {cached_mature_count} in existing cache). Full universe history required (>= 1,500 mature stocks). Existing cache preserved.")
        conn.close()
        return 0

    # Load verified lifetime ATHs and dates from stock_ath table
    stock_aths = {}
    stock_ath_dates = {}
    try:
        cursor.execute("SELECT symbol, ath_price, ath_date FROM stock_ath")
        for r in cursor.fetchall():
            if r[1] is not None:
                stock_aths[r[0]] = float(r[1])
                stock_ath_dates[r[0]] = r[2]
    except Exception as e:
        print(f"Warning: could not load stock_ath: {e}")

    # Symbols with verified full max-history split-adjusted ATH in ticker_status
    ok_max_symbols = set()
    try:
        cursor.execute("SELECT symbol FROM ticker_status WHERE status = 'OK_MAX'")
        ok_max_symbols = {r[0] for r in cursor.fetchall()}
    except Exception as e:
        print(f"Warning: could not load ticker_status OK_MAX: {e}")

    cursor.execute("SELECT DISTINCT symbol FROM daily_candles")
    db_symbols = [r[0] for r in cursor.fetchall() if not r[0].startswith("^")]
    if stock_names:
        all_symbols = sorted(stock_names.keys())
    else:
        all_symbols = sorted(set(db_symbols) | set(existing_cache_map.keys()))
    print(f"Exporting cache for {len(all_symbols)} tracked symbols from SQLite as of {as_of_date or 'latest'}...")

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

    from backend.app.universe_store import universe_store

    stock_items = {}
    stock_dfs = {}
    latest_date_overall = as_of_date or "2026-08-25"

    for sym in all_symbols:
        prev = existing_cache_map.get(sym)
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
            if prev:
                preserved = dict(prev)
                preserved["is_fno"] = universe_store.is_fno(sym)
                preserved["fno_lot_size"] = universe_store.get_fno_lot_size(sym)
                preserved["passes_top10_step1"] = screener_engine.check_top10_step1(preserved, require_vol_confirm=False)
                preserved["composite_score"] = None
                preserved["top10_rank"] = None
                stock_items[sym] = preserved
            continue

        n_bars = len(rows)
        dates = [r[0] for r in rows]
        opens = [r[1] for r in rows]
        highs = [r[2] for r in rows]
        lows = [r[3] for r in rows]
        closes = [r[4] for r in rows]
        volumes = [r[5] for r in rows]

        dates, opens, highs, lows, closes, volumes, adj_factor, action_date = sanitize_and_adjust_candles(
            dates, opens, highs, lows, closes, volumes
        )

        raw_db_ath = stock_aths.get(sym, 0.0)
        db_ath_val = raw_db_ath
        db_ath_adjusted = False
        if adj_factor != 1.0:
            san_max_h = max(highs) if highs else 0.0
            if sym in stock_aths:
                ath_dt = stock_ath_dates.get(sym)
                if (
                    not action_date
                    or not ath_dt
                    or ath_dt < action_date
                    or (san_max_h > 0 and adj_factor < 0.60 and db_ath_val > san_max_h * 1.45)
                ):
                    db_ath_val = db_ath_val * adj_factor
                    db_ath_adjusted = True

            if prev:
                prev_h52 = float(prev.get("high_52w") or 0.0)
                needs_full_scale = not cache_date or (action_date and action_date > cache_date)
                needs_hist_field_scale = (
                    not needs_full_scale
                    and san_max_h > 0
                    and (
                        (adj_factor < 0.60 and prev_h52 > san_max_h * 1.45)
                        or (adj_factor > 1.45 and prev_h52 > 0 and prev_h52 < san_max_h * 0.65)
                    )
                )
                prev = dict(prev)
                if needs_full_scale or needs_hist_field_scale:
                    scale_fields = (
                        ("current_price", "high_52w", "low_52w", "high_ath", "sma20", "sma50", "sma100", "sma200", "sma200_21d_ago")
                        if needs_full_scale
                        else ("high_52w", "low_52w", "high_ath", "sma20", "sma50", "sma100", "sma200", "sma200_21d_ago")
                    )
                    for fld in scale_fields:
                        if prev.get(fld) is not None:
                            prev[fld] = float(prev[fld]) * adj_factor
                elif db_ath_adjusted and prev.get("high_ath") is not None and raw_db_ath > 0:
                    prev_ath_f = float(prev["high_ath"])
                    if prev_ath_f >= raw_db_ath * 0.98:
                        prev["high_ath"] = prev_ath_f * adj_factor

        if dates[-1] > latest_date_overall:
            latest_date_overall = dates[-1]

        new_sessions = sum(1 for d in dates if d > cache_date) if (prev and cache_date) else 0
        effective_bars = max(n_bars, int(prev.get("trading_days") if (prev and prev.get("trading_days") is not None) else 0) + new_sessions) if prev else n_bars

        current_price = closes[-1]
        prev_close = closes[-2] if n_bars >= 2 else opens[-1]
        change_pct = round(((current_price - prev_close) / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

        # Canonical Liquidity Check (last 20 days)
        active_days, turnover_cr, passes_liquidity = screener_engine.compute_liquidity(closes, volumes)

        # Highs (preserve multi-year 52W/ATH when local SQLite has < 252 bars, but trust verified OK_MAX ATH)
        if sym in ok_max_symbols:
            high_ath = max(max(highs), db_ath_val)
        else:
            prev_ath = float(prev.get("high_ath") or 0.0) if prev else 0.0
            high_ath = max(max(highs), db_ath_val, prev_ath)
        if n_bars >= 252:
            high_52w = max(highs[-252:])
            low_52w = min(lows[-252:])
        else:
            prev_52h = float(prev.get("high_52w") or 0.0) if prev else 0.0
            prev_52l = float(prev.get("low_52w") or 0.0) if prev else 0.0
            high_52w = max(max(highs), prev_52h)
            low_52w = min(min(lows), prev_52l) if prev_52l > 0 else min(lows)

        # Distances
        dist_to_52w = round(((current_price - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
        dist_to_ath = round(((current_price - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

        def _resolve_ma(window: int) -> Optional[float]:
            if n_bars >= window:
                return sum(closes[-window:]) / float(window)
            if prev and prev.get(f"sma{window}") is not None:
                val = float(prev[f"sma{window}"])
                if cache_date:
                    for d_val, c_val in zip(dates, closes):
                        if d_val > cache_date:
                            val = val + (c_val - val) / float(window)
                return val
            return None

        # Moving Averages (require full window so short-history stocks don't get fake MAs)
        sma20 = _resolve_ma(20)
        sma50 = _resolve_ma(50)
        sma100 = _resolve_ma(100)
        sma200 = _resolve_ma(200)

        sma200_slope_60d_pct = None
        if n_bars >= 260 and sma200 is not None:
            sma200_60d_ago = sum(closes[-260:-60]) / 200.0
            if sma200_60d_ago > 0:
                sma200_slope_60d_pct = round(((sma200 - sma200_60d_ago) / sma200_60d_ago) * 100.0, 2)
        elif n_bars > 200 and sma200 is not None:
            sma200_prev = sum(closes[:200]) / 200.0
            if sma200_prev > 0:
                sma200_slope_60d_pct = round(((sma200 - sma200_prev) / sma200_prev) * 100.0, 2)
        elif prev and prev.get("sma200_slope_60d_pct") is not None:
            sma200_slope_60d_pct = float(prev["sma200_slope_60d_pct"])

        # Canonical Volume Confirmation
        vol_50_bars = min(n_bars, 50)
        vol_sma50 = sum(volumes[-vol_50_bars:]) / vol_50_bars if vol_50_bars > 0 else 1.0
        vol_multiple, is_vol_confirmed = screener_engine.compute_volume_confirmation(
            volumes[-1], vol_sma50, passes_liquidity
        )

        # Determine genuine recent listing relative to latest candle date
        ref_dt = datetime.strptime(dates[-1], "%Y-%m-%d")
        is_recent = False
        list_date_str = stock_listing_dates.get(sym)
        if list_date_str:
            try:
                dt = datetime.strptime(list_date_str, "%d-%b-%Y")
                is_recent = (ref_dt - dt).days <= 730
            except Exception:
                is_recent = bool(prev.get("is_recently_listed", False)) if prev else False
        elif prev and prev.get("is_recently_listed") is not None:
            is_recent = bool(prev.get("is_recently_listed"))

        # Top 10 Momentum Oscillators, ROC, Persistence & Smoothness Metrics
        rsi14, adx14, atr14_pct = screener_engine.compute_wilder_oscillators(highs, lows, closes, period=14)
        roc21, roc63, roc126 = screener_engine.compute_roc_metrics(closes)
        sma200_21d_ago, days_above_ma50_20d, r2_63d = screener_engine.compute_persistence_and_smoothness(closes)

        if prev:
            # Find reference close on cache_date to compound 63d/126d ROC when local SQLite has < 64/127 bars
            c_ref = None
            if cache_date and cache_date in dates:
                c_ref = closes[dates.index(cache_date)]
            elif prev.get("current_price"):
                c_ref = float(prev["current_price"])

            if adj_factor == 1.0 and n_bars < 64 and prev.get("roc63") is not None and c_ref and c_ref > 0:
                roc63 = round(((current_price / float(c_ref)) * (1.0 + float(prev["roc63"]) / 100.0) - 1.0) * 100.0, 2)
            if adj_factor == 1.0 and n_bars < 127 and prev.get("roc126") is not None and c_ref and c_ref > 0:
                roc126 = round(((current_price / float(c_ref)) * (1.0 + float(prev["roc126"]) / 100.0) - 1.0) * 100.0, 2)
            if n_bars < 221 and prev.get("sma200_21d_ago") is not None:
                sma200_21d_ago = float(prev["sma200_21d_ago"])
            if n_bars < 50 and sma50 is not None:
                days_above_ma50_20d = int(sum(1 for c_val in closes[-min(20, n_bars):] if c_val > sma50))
            if n_bars < 63 and prev.get("r2_63d") is not None:
                r2_63d = float(prev["r2_63d"])

        # Canonical Stage 2 Trend Check & Status Classification
        passes_trend, _ = screener_engine.check_stage2_trend(
            price=current_price,
            sma20=sma20,
            sma50=sma50,
            sma200=sma200,
            sma200_21d_ago=sma200_21d_ago,
            sma200_slope_60d_pct=sma200_slope_60d_pct,
            trading_days=effective_bars,
            passes_liquidity=passes_liquidity,
            is_recently_listed=is_recent,
        )
        above_mas = screener_engine.is_above_mas(current_price, sma50, sma200, effective_bars)
        status, status_label = screener_engine.classify_status(
            dist_52w=dist_to_52w,
            dist_ath=dist_to_ath,
            trading_days=effective_bars,
            is_recent=is_recent,
            passes_liquidity=passes_liquidity,
            is_above_mas=above_mas,
        )

        name = stock_names.get(sym) or (prev.get("name") if prev else sym) or sym

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
            "rs_rating_smallmid": int(prev.get("rs_rating_smallmid", 50)) if prev else 50,
            "rs_rating_nifty50": int(prev.get("rs_rating_nifty50", 50)) if prev else 50,
            "turnover_cr": turnover_cr,
            "active_days_20d": active_days,
            "trading_days": effective_bars,
            "is_recently_listed": is_recent,
            "sma20": round(sma20, 2) if sma20 is not None else None,
            "sma50": round(sma50, 2) if sma50 is not None else None,
            "sma100": round(sma100, 2) if sma100 is not None else None,
            "sma200": round(sma200, 2) if sma200 is not None else None,
            "sma200_21d_ago": round(sma200_21d_ago, 2) if sma200_21d_ago is not None else None,
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
        if n_bars >= 127:
            stock_dfs[sym] = pd.DataFrame({"close": closes})
        elif roc63 is not None and roc126 is not None and current_price > 0:
            # Provide synthetic 127-bar series matching exact 3M (roc63) and 6M (roc126) returns for RS ranking
            c63 = current_price / (1.0 + roc63 / 100.0) if (1.0 + roc63 / 100.0) > 0 else current_price
            c126 = current_price / (1.0 + roc126 / 100.0) if (1.0 + roc126 / 100.0) > 0 else c63
            synth_closes = [c126] * 64 + [c63] * 62 + [current_price]
            stock_dfs[sym] = pd.DataFrame({"close": synth_closes})
        else:
            stock_dfs[sym] = pd.DataFrame({"close": closes})
        stock_items[sym] = item

    conn.close()

    print(f"Computing RS ratings for {len(stock_dfs)} stocks against benchmarks...")
    rs_ratings = screener_engine.compute_rs_ratings(stock_dfs, sm_bench, n50_bench)

    results = []
    for sym, item in stock_items.items():
        if sym in rs_ratings:
            rs_sm, rs_n50 = rs_ratings[sym]
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
        "last_scanned": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S"),
        "latest_data_date": latest_date_overall,
        "total_cached": len(results),
        "results": results
    }

    tmp_output = f"{OUTPUT_PATH}.tmp"
    with open(tmp_output, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    os.replace(tmp_output, OUTPUT_PATH)

    print(f"Successfully generated {OUTPUT_PATH} with {len(results)} stocks!")
    return len(results)

if __name__ == "__main__":
    export_cache()

