# -*- coding: utf-8 -*-
import os
import csv
import pandas as pd
import json
import logging
import threading
from typing import Annotated, List, Optional, Dict, Any
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.models import (
    StockScreenerItem, ChartPayload, Candle, HighLowAnalysis, UniverseStats
)
from backend.app.universe_store import universe_store
from backend.app.data_engine import (
    data_engine,
    sanitize_candles_df,
    BENCHMARK_SMALLMID,
    BENCHMARK_NIFTY50,
)
from backend.app.screener_engine import screener_engine

IST = ZoneInfo("Asia/Kolkata")
MAX_BHAVCOPY_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_CSV_BYTES = 10 * 1024 * 1024       # 10 MB

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = FastAPI(
    title="BreakoutPulse · NSE Momentum Screener",
    description="52-Week High, 52-Week Breakout, and All-Time High scanner with Volume Confirmation",
    version="2.0.0"
)

# CORS middleware (never combine allow_origins=["*"] with allow_credentials=True)
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()] if _allowed_origins_env else ["*"]
_allow_creds = bool(_allowed_origins_env and "*" not in _cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

CACHE_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "screener_cache.json"))

# Global scan status state
scan_state = {
    "is_scanning": False,
    "progress": 0,
    "total": 0,
    "current_symbol": "",
    "last_scanned": None,
    "latest_data_date": None,
    "scan_message": None,
    "scan_status_type": "info",
    "scan_result_status": None,
    "stocks_updated": 0,
    "is_today_available": False,
    "cached_results": [],
    "cache_mtime": None
}

# Guards Bhavcopy ingestion (scan + upload) so concurrent requests don't write SQLite/cache simultaneously
_scan_lock = threading.Lock()


def _now_ist_str() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")


def _load_initial_cache():
    """Loads pre-seeded screener cache so the dashboard is immediately populated on cloud launch."""
    global scan_state
    if os.path.exists(CACHE_JSON_PATH):
        try:
            mtime = os.path.getmtime(CACHE_JSON_PATH)
            with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                payload = json.load(f)
                items = []
                for x in payload.get("results", []):
                    sym = x.get("symbol", "")
                    x["is_fno"] = universe_store.is_fno(sym)
                    x["fno_lot_size"] = universe_store.get_fno_lot_size(sym)
                    items.append(StockScreenerItem(**x))
                if items:
                    scan_state["cached_results"] = items
                    scan_state["cache_mtime"] = mtime
                    scan_state["last_scanned"] = payload.get("last_scanned", _now_ist_str())
                    scan_state["latest_data_date"] = payload.get("latest_data_date", "2026-08-28")
                    logger.info(f"Loaded {len(items)} pre-calculated stocks from {CACHE_JSON_PATH}")
                else:
                    logger.warning(f"Cache file at {CACHE_JSON_PATH} had 0 items; preserving in-memory cached results ({len(scan_state.get('cached_results', []))} stocks).")
        except Exception as e:
            logger.warning(f"Could not load pre-seeded cache: {e}")

def _get_live_cached_results() -> List[StockScreenerItem]:
    """Returns cached screener items scoped to the tracked universe, reloading if disk cache changed."""
    if os.path.exists(CACHE_JSON_PATH):
        try:
            current_mtime = os.path.getmtime(CACHE_JSON_PATH)
            if not scan_state.get("cached_results") or scan_state.get("cache_mtime") != current_mtime:
                _load_initial_cache()
        except Exception:
            pass
    results: List[StockScreenerItem] = scan_state.get("cached_results", [])
    if not results:
        results = _recompute_from_sqlite()
    if universe_store.total_count() > 0:
        tracked = set(universe_store.get_symbols())
        scoped = [x for x in results if x.symbol in tracked]
        if scoped:
            return scoped
    return results

_load_initial_cache()


def _recompute_from_sqlite():
    """Recalculates cached SQLite stocks using ScreenerEngine if sufficient history is available."""
    cached_syms = data_engine.get_all_cached_symbols()
    if not cached_syms:
        _load_initial_cache()
        return scan_state.get("cached_results", [])
    
    stock_dfs = {}
    stock_names = {}
    for s in cached_syms:
        df = data_engine.get_cached_candles(s)
        if df is not None and len(df) >= 15:
            stock_dfs[s] = df
            meta = universe_store.get(s)
            stock_names[s] = meta.name if meta else s
            
    if len(stock_dfs) < 1500:
        _load_initial_cache()
        return scan_state.get("cached_results", [])

    sm_bench = data_engine.get_cached_candles(BENCHMARK_SMALLMID)
    n50_bench = data_engine.get_cached_candles(BENCHMARK_NIFTY50)
    ath_dict = data_engine.get_all_stock_aths()
    
    results = screener_engine.run_screener(stock_dfs, stock_names, sm_bench, n50_bench, ath_dict=ath_dict)
    if results and len(results) >= 1500:
        scan_state["cached_results"] = results
        scan_state["last_scanned"] = _now_ist_str()
    return scan_state.get("cached_results", [])


@app.get("/api/health")
def health_check():
    cached_count = len(scan_state.get("cached_results", [])) or len(data_engine.get_all_cached_symbols())
    return {
        "status": "healthy",
        "universe_size": universe_store.total_count(),
        "cached_symbols": cached_count,
        "is_scanning": scan_state["is_scanning"]
    }


def _trading_days(x: StockScreenerItem) -> int:
    return int(x.trading_days) if x.trading_days is not None else 500


def _is_above_mas(x: StockScreenerItem) -> bool:
    """A momentum setup must at minimum trade above its 50 DMA and 200 DMA (if available)."""
    return screener_engine.is_above_mas(x.current_price, x.sma50, x.sma200, x.trading_days)


def _is_recent(x: StockScreenerItem) -> bool:
    """Genuine recent listing as computed by the engines (official listing date, bar-count fallback)."""
    if x.is_recently_listed is not None:
        return bool(x.is_recently_listed)
    return _trading_days(x) < screener_engine.ath_min_trading_days


def _is_ath(x: StockScreenerItem) -> bool:
    # Within +-10% of ATH (Early setups & active breakouts), mature stock, and trading above MA50 & MA200
    return bool(
        -10.0 <= x.dist_to_ath_pct <= 10.0
        and _trading_days(x) >= screener_engine.ath_min_trading_days
        and not _is_recent(x)
        and x.passes_liquidity
        and _is_above_mas(x)
    )


def _is_recent_listing(x: StockScreenerItem) -> bool:
    return bool(
        _is_recent(x)
        and x.dist_to_52w_high_pct >= -10.0
        and x.passes_liquidity
        and _is_above_mas(x)
    )


def _is_near_52w(x: StockScreenerItem) -> bool:
    # Within 10% of 52W High (>=200 bars), excluding ATH and Recent Listings to guarantee ZERO duplicates
    return bool(
        x.dist_to_52w_high_pct >= -10.0
        and _trading_days(x) >= 200
        and not _is_ath(x)
        and not _is_recent_listing(x)
        and x.passes_liquidity
        and _is_above_mas(x)
    )


def _is_at_52w(x: StockScreenerItem) -> bool:
    return bool(
        x.dist_to_52w_high_pct >= -0.5
        and _trading_days(x) >= 200
        and not _is_ath(x)
        and not _is_recent_listing(x)
        and x.passes_liquidity
        and _is_above_mas(x)
    )


def _filter_stocks_for_tab(
    results: List[StockScreenerItem],
    tab: str,
    volume_confirmed_only: bool,
    trend_only: bool,
    fno_only: bool,
    search: Optional[str] = None,
    min_rs: int = 0,
) -> List[StockScreenerItem]:
    """Single source of truth for tab & pill filtering shared by /api/stocks and /api/universe-stats."""
    if tab == "top10":
        candidates = results
        if fno_only:
            candidates = [x for x in candidates if x.is_fno]
        if min_rs > 0:
            candidates = [x for x in candidates if (x.rs_rating_smallmid or 0) >= min_rs]
        top10 = screener_engine.rank_top10_momentum(
            candidates,
            require_vol_confirm=volume_confirmed_only,
            volatility_adjust=True,
            limit=10,
        )
        if search:
            s = search.strip().upper()
            top10 = [x for x in top10 if s in x.symbol.upper() or s in x.name.upper()]
        return top10

    filtered = [x for x in results if x.passes_liquidity] if tab != "all" else list(results)

    if tab == "ath":
        filtered = [x for x in filtered if _is_ath(x)]
    elif tab == "near_52w":
        filtered = [x for x in filtered if _is_near_52w(x)]
    elif tab == "breakout_52w":
        filtered = [x for x in filtered if _is_at_52w(x)]
    elif tab == "recent_listings":
        filtered = [x for x in filtered if _is_recent_listing(x)]

    if volume_confirmed_only:
        filtered = [x for x in filtered if x.is_volume_confirmed]

    if trend_only:
        filtered = [x for x in filtered if x.passes_trend_check]

    if fno_only:
        filtered = [x for x in filtered if x.is_fno]

    if min_rs > 0:
        filtered = [x for x in filtered if (x.rs_rating_smallmid or 0) >= min_rs]

    if search:
        s = search.strip().upper()
        filtered = [x for x in filtered if s in x.symbol.upper() or s in x.name.upper()]

    return filtered


@app.get("/api/universe-stats", response_model=UniverseStats)
def get_universe_stats(
    volume_confirmed_only: Annotated[Optional[bool], Query(description="Optional filter state for filtered card counts")] = None,
    trend_only: Annotated[Optional[bool], Query(description="Optional filter state for filtered card counts")] = None,
    fno_only: Annotated[Optional[bool], Query(description="Optional filter state for filtered card counts")] = None,
    min_rs: Annotated[int, Query(description="Optional RS threshold for filtered card counts")] = 0,
):
    results: List[StockScreenerItem] = _get_live_cached_results()

    near_ath = sum(1 for x in results if _is_ath(x))
    recent_listing = sum(1 for x in results if _is_recent_listing(x))
    near_52w = sum(1 for x in results if _is_near_52w(x))
    at_52w = sum(1 for x in results if _is_at_52w(x))
    confirmed_vol = sum(1 for x in results if x.is_volume_confirmed and (_is_ath(x) or _is_near_52w(x) or _is_recent_listing(x)))
    top10_ranked = screener_engine.rank_top10_momentum(results, require_vol_confirm=False, limit=10)
    top10_count = len(top10_ranked)
    fno_total = sum(1 for x in results if x.is_fno)

    vc_flag = True if volume_confirmed_only is None else bool(volume_confirmed_only)
    tr_flag = True if trend_only is None else bool(trend_only)
    fno_flag = bool(fno_only) if fno_only is not None else False

    filtered_near_ath = len(_filter_stocks_for_tab(results, "ath", vc_flag, tr_flag, fno_flag, min_rs=min_rs))
    filtered_near_52w = len(_filter_stocks_for_tab(results, "near_52w", vc_flag, tr_flag, fno_flag, min_rs=min_rs))
    filtered_recent_listing = len(_filter_stocks_for_tab(results, "recent_listings", vc_flag, tr_flag, fno_flag, min_rs=min_rs))
    filtered_top10 = len(_filter_stocks_for_tab(results, "top10", vc_flag, tr_flag, fno_flag, min_rs=min_rs))
    filtered_all = len(_filter_stocks_for_tab(results, "all", vc_flag, tr_flag, fno_flag, min_rs=min_rs))

    # Small/Midcap Benchmark Trend
    sm_df = data_engine.get_cached_candles(BENCHMARK_SMALLMID)
    sm_trend = "Bullish Uptrend (Above 50 SMA)"
    if sm_df is not None and len(sm_df) >= 50:
        c = sm_df["close"].iloc[-1]
        sma50 = sm_df["close"].rolling(50).mean().iloc[-1]
        if c < sma50:
            sm_trend = "Consolidating / Below 50 SMA"

    # Nifty 50 Trend
    n50_df = data_engine.get_cached_candles(BENCHMARK_NIFTY50)
    n50_trend = "Bullish Uptrend (Above 50 SMA)"
    if n50_df is not None and len(n50_df) >= 50:
        c = n50_df["close"].iloc[-1]
        sma50 = n50_df["close"].rolling(50).mean().iloc[-1]
        if c < sma50:
            n50_trend = "Consolidating / Below 50 SMA"

    total_cached = len(results) or len(data_engine.get_all_cached_symbols())
    db_date = data_engine.get_latest_complete_data_date()
    cache_date = scan_state.get("latest_data_date")
    date_candidates = [d for d in (db_date, cache_date) if d]
    latest_date = max(date_candidates) if date_candidates else "2026-08-25"

    advances = sum(1 for x in results if (x.change_pct or 0.0) > 0)
    declines = sum(1 for x in results if (x.change_pct or 0.0) < 0)
    unchanged = sum(1 for x in results if (x.change_pct or 0.0) == 0)
    breadth_total = len(results)
    breadth_up_pct = round((advances / breadth_total) * 100.0, 1) if breadth_total > 0 else 0.0

    vc_stage2_symbols = [
        x.symbol for x in results
        if x.is_volume_confirmed and x.passes_trend_check and (_is_ath(x) or _is_near_52w(x) or _is_recent_listing(x))
    ]

    return UniverseStats(
        total_stocks=universe_store.total_count() or total_cached,
        cached_stocks=total_cached,
        near_52w_count=near_52w,
        at_52w_count=at_52w,
        near_ath_count=near_ath,
        recent_listing_count=recent_listing,
        confirmed_volume_count=confirmed_vol,
        top10_count=top10_count,
        fno_count=fno_total,
        advances_count=advances,
        declines_count=declines,
        unchanged_count=unchanged,
        breadth_up_pct=breadth_up_pct,
        last_scanned=scan_state.get("last_scanned"),
        latest_data_date=latest_date,
        smallmid_trend=sm_trend,
        nifty50_trend=n50_trend,
        vc_stage2_symbols=vc_stage2_symbols,
        filtered_near_ath_count=filtered_near_ath,
        filtered_near_52w_count=filtered_near_52w,
        filtered_recent_listing_count=filtered_recent_listing,
        filtered_top10_count=filtered_top10,
        filtered_all_count=filtered_all,
    )


@app.get("/api/stocks", response_model=List[StockScreenerItem])
def get_screened_stocks(
    tab: Annotated[str, Query(description="Filter tab: ath, near_52w, breakout_52w, recent_listings, top10, all")] = "ath",
    volume_confirmed_only: Annotated[bool, Query(description="Default view shows only volume confirmed (>=1.4x) stocks")] = True,
    trend_only: Annotated[bool, Query(description="Filter only stocks passing Stage 2 trend checks (Price > 50 > 200 SMA)")] = True,
    fno_only: Annotated[bool, Query(description="Filter only official NSE F&O stocks")] = False,
    search: Annotated[Optional[str], Query(description="Search by symbol or company name")] = None,
    min_rs: Annotated[int, Query(description="Minimum Small/Midcap RS rating (e.g. 70)")] = 0,
    limit: Annotated[int, Query(ge=1, le=5000, description="Max items to return")] = 250,
    response: Response = None,
):
    results: List[StockScreenerItem] = _get_live_cached_results()

    filtered = _filter_stocks_for_tab(
        results,
        tab=tab,
        volume_confirmed_only=volume_confirmed_only,
        trend_only=trend_only,
        fno_only=fno_only,
        search=search,
        min_rs=min_rs,
    )

    if tab != "top10":
        filtered.sort(key=lambda x: (x.vol_multiple if x.vol_multiple is not None else 0.0), reverse=True)

    if response is not None:
        response.headers["X-Total-Count"] = str(len(filtered))
    page = filtered[:limit]
    spark_map = data_engine.get_sparklines([x.symbol for x in page], days=30)
    return [x.model_copy(update={"spark": spark_map.get(x.symbol)}) for x in page]


def _sync_single_symbol_in_cache(symbol: str, computed_df: pd.DataFrame) -> None:
    """Updates a single symbol's indicators & Top 10 ranking in live cache and screener_cache.json."""
    if computed_df is None or len(computed_df) < 20:
        return
    clean_sym = data_engine._clean_symbol(symbol) if not symbol.startswith("^") else symbol
    with _scan_lock:
        results = list(scan_state.get("cached_results") or [])
        if not results:
            results = list(_recompute_from_sqlite() if not os.path.exists(CACHE_JSON_PATH) else [])
        if not results:
            return

        existing_idx = None
        rs_sm, rs_n50 = 50, 50
        for idx, item in enumerate(results):
            if item.symbol == clean_sym:
                existing_idx = idx
                rs_sm = item.rs_rating_smallmid if item.rs_rating_smallmid is not None else 50
                rs_n50 = item.rs_rating_nifty50 if item.rs_rating_nifty50 is not None else 50
                break

        if existing_idx is not None:
            existing_bars = results[existing_idx].trading_days or 0
            if len(computed_df) < 200 and existing_bars >= 200:
                return

        meta = universe_store.get(clean_sym)
        name = meta.name if meta else (results[existing_idx].name if existing_idx is not None else clean_sym)
        analysis = screener_engine.analyze_stock(computed_df, rs_sm, rs_n50, symbol=clean_sym)

        updated_item = StockScreenerItem(
            symbol=clean_sym,
            name=name,
            current_price=analysis.current_price,
            change_pct=analysis.change_pct,
            volume=float(computed_df["volume"].iloc[-1]),
            vol_multiple=analysis.volume_multiple,
            is_volume_confirmed=analysis.is_volume_confirmed,
            status=analysis.status,
            status_label=analysis.status_label,
            high_52w=analysis.high_52w,
            low_52w=analysis.low_52w,
            high_ath=analysis.high_ath,
            dist_to_52w_high_pct=analysis.dist_to_52w_high_pct,
            dist_to_ath_pct=analysis.dist_to_ath_pct,
            rs_rating_smallmid=analysis.rs_rating_smallmid,
            rs_rating_nifty50=analysis.rs_rating_nifty50,
            turnover_cr=analysis.turnover_cr,
            active_days_20d=analysis.active_days_20d,
            trading_days=analysis.trading_days,
            is_recently_listed=analysis.is_recently_listed,
            sma20=analysis.sma20,
            sma50=analysis.sma50,
            sma100=analysis.sma100,
            sma200=analysis.sma200,
            sma200_21d_ago=analysis.sma200_21d_ago,
            sma200_slope_60d_pct=analysis.sma200_slope_60d_pct,
            days_above_ma50_20d=analysis.days_above_ma50_20d,
            r2_63d=analysis.r2_63d,
            passes_trend_check=analysis.passes_trend_check,
            passes_liquidity=analysis.passes_liquidity,
            is_fno=universe_store.is_fno(clean_sym),
            fno_lot_size=universe_store.get_fno_lot_size(clean_sym),
            rsi14=analysis.rsi14,
            adx14=analysis.adx14,
            atr14_pct=analysis.atr14_pct,
            roc21=analysis.roc21,
            roc63=analysis.roc63,
            roc126=analysis.roc126,
            passes_top10_step1=analysis.passes_top10_step1,
            composite_score=None,
            top10_rank=None,
        )

        if existing_idx is not None:
            results[existing_idx] = updated_item
        else:
            results.append(updated_item)

        for it in results:
            it.composite_score = None
            it.top10_rank = None

        top10_ranked = screener_engine.rank_top10_momentum(results, require_vol_confirm=False)
        top10_map = {x.symbol: (x.composite_score, x.top10_rank) for x in top10_ranked}
        for it in results:
            if it.symbol in top10_map:
                it.composite_score, it.top10_rank = top10_map[it.symbol]

        scan_state["cached_results"] = results
        if len(results) >= 1500 or not os.path.exists(CACHE_JSON_PATH):
            try:
                latest_date = (
                    scan_state.get("latest_data_date")
                    or data_engine.get_latest_complete_data_date()
                    or str(computed_df["date"].iloc[-1])
                )
                payload = {
                    "last_scanned": scan_state.get("last_scanned") or _now_ist_str(),
                    "latest_data_date": latest_date,
                    "total_cached": len(results),
                    "results": [it.model_dump() for it in results],
                }
                tmp_cache = f"{CACHE_JSON_PATH}.tmp"
                with open(tmp_cache, "w", encoding="utf-8") as f:
                    json.dump(payload, f)
                os.replace(tmp_cache, CACHE_JSON_PATH)
                scan_state["cache_mtime"] = os.path.getmtime(CACHE_JSON_PATH)
            except Exception as e:
                logger.warning(f"Could not persist synced cache for {clean_sym}: {e}")


@app.get("/api/stocks/{symbol}/chart", response_model=ChartPayload)
def get_stock_chart(
    symbol: str,
    response: Response = None,
    timeframe: Annotated[str, Query(description="Candle timeframe: 1H, 1D, or 1W")] = "1D",
):
    import numpy as np
    if response is not None:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"

    tf = (timeframe or "1D").strip().upper()
    clean_sym = data_engine._clean_symbol(symbol) if not symbol.startswith("^") else symbol
    df = data_engine.get_cached_candles(clean_sym)

    has_discontinuity = False
    if df is not None and len(df) >= 2:
        _, adj_f, _ = sanitize_candles_df(df)
        has_discontinuity = (adj_f != 1.0)

    should_backfill = df is None or len(df) < 100
    if not should_backfill and has_discontinuity:
        t_status = data_engine.get_ticker_status(clean_sym)
        today_ist = datetime.now(IST).strftime("%Y-%m-%d")
        if not (t_status and t_status[1][:10] == today_ist and t_status[0] in ("OK_MAX", "ERROR")):
            should_backfill = True

    did_backfill = False
    if should_backfill:
        try:
            fetch_period = "max" if has_discontinuity else "5y"
            fetched_df = data_engine.fetch_and_cache_symbol(
                clean_sym,
                period=fetch_period,
                max_retries=2,
                force_ath_reset=has_discontinuity,
            )
            if fetched_df is not None and not fetched_df.empty:
                df = data_engine.get_cached_candles(clean_sym)
                did_backfill = True
        except Exception as e:
            logger.warning(f"Could not fetch historical chart data for {clean_sym}: {e}")

    if df is None or len(df) < 1:
        raise HTTPException(status_code=404, detail=f"No chart data available for {symbol}")

    # Always sanitize candles before computing indicators or rendering chart bars
    df, adj_f, _ = sanitize_candles_df(df)

    true_ath = data_engine.get_stock_ath(clean_sym)
    if true_ath is not None and adj_f != 1.0 and not df.empty:
        san_max_h = float(df["high"].max())
        if san_max_h > 0 and adj_f < 0.60 and true_ath > san_max_h * 1.45:
            true_ath = round(float(true_ath) * adj_f, 2)

    computed_df = screener_engine.compute_indicators(df, lifetime_ath=true_ath)
    analysis = screener_engine.analyze_stock(computed_df, 50, 50, symbol=clean_sym)
    if did_backfill:
        try:
            _sync_single_symbol_in_cache(clean_sym, computed_df)
        except Exception as e:
            logger.warning(f"Could not sync cache after chart backfill for {clean_sym}: {e}")
    meta = universe_store.get(clean_sym)
    name = meta.name if meta else clean_sym

    c_last = float(computed_df["close"].iloc[-1])

    h_52w_val = computed_df["high_52w"].iloc[-1] if "high_52w" in computed_df else c_last
    if pd.isna(h_52w_val) or np.isnan(h_52w_val) or float(h_52w_val) <= 0:
        h_52w = c_last
    else:
        h_52w = float(h_52w_val)

    h_ath_val = computed_df["high_ath"].iloc[-1] if "high_ath" in computed_df else max(h_52w, c_last)
    if true_ath is not None and true_ath > 0:
        h_ath_val = max(float(h_ath_val), float(true_ath))
    if pd.isna(h_ath_val) or np.isnan(h_ath_val) or float(h_ath_val) <= 0:
        h_ath = max(h_52w, c_last)
    else:
        h_ath = float(h_ath_val)

    dist_52w = round(((c_last - h_52w) / h_52w) * 100, 2) if h_52w > 0 else 0.0
    dist_ath = round(((c_last - h_ath) / h_ath) * 100, 2) if h_ath > 0 else 0.0

    candles = []
    is_synthetic = False
    if tf == "1H":
        intraday_df, is_synthetic = data_engine.get_intraday_candles(
            clean_sym, interval="1h", period="6mo", fallback_daily_df=computed_df
        )
        if intraday_df is not None and not intraday_df.empty:
            for _, row in intraday_df.iterrows():
                o = float(row["open"]) if pd.notna(row["open"]) and not np.isnan(row["open"]) else c_last
                h = float(row["high"]) if pd.notna(row["high"]) and not np.isnan(row["high"]) else max(o, c_last)
                l = float(row["low"]) if pd.notna(row["low"]) and not np.isnan(row["low"]) else min(o, c_last)
                c = float(row["close"]) if pd.notna(row["close"]) and not np.isnan(row["close"]) else o
                v = float(row["volume"]) if pd.notna(row["volume"]) and not np.isnan(row["volume"]) else 0.0

                h = max(h, o, c)
                l = min(l, o, c)

                candles.append(
                    Candle(
                        time=int(row["time_ts"]),
                        open=round(o, 2),
                        high=round(h, 2),
                        low=round(l, 2),
                        close=round(c, 2),
                        volume=round(v, 2),
                    )
                )

    elif tf == "1W":
        weekly_df = data_engine.resample_weekly_candles(computed_df)
        for _, row in weekly_df.iterrows():
            o = float(row["open"]) if pd.notna(row["open"]) and not np.isnan(row["open"]) else c_last
            h = float(row["high"]) if pd.notna(row["high"]) and not np.isnan(row["high"]) else max(o, c_last)
            l = float(row["low"]) if pd.notna(row["low"]) and not np.isnan(row["low"]) else min(o, c_last)
            c = float(row["close"]) if pd.notna(row["close"]) and not np.isnan(row["close"]) else o
            v = float(row["volume"]) if pd.notna(row["volume"]) and not np.isnan(row["volume"]) else 0.0

            h = max(h, o, c)
            l = min(l, o, c)

            candles.append(
                Candle(
                    time=str(row["date"]),
                    open=round(o, 2),
                    high=round(h, 2),
                    low=round(l, 2),
                    close=round(c, 2),
                    volume=round(v, 2),
                )
            )

    if not candles:
        is_synthetic = False
        for _, row in computed_df.iterrows():
            o = float(row["open"]) if pd.notna(row["open"]) and not np.isnan(row["open"]) else c_last
            h = float(row["high"]) if pd.notna(row["high"]) and not np.isnan(row["high"]) else max(o, c_last)
            l = float(row["low"]) if pd.notna(row["low"]) and not np.isnan(row["low"]) else min(o, c_last)
            c = float(row["close"]) if pd.notna(row["close"]) and not np.isnan(row["close"]) else o
            v = float(row["volume"]) if pd.notna(row["volume"]) and not np.isnan(row["volume"]) else 0.0

            h = max(h, o, c)
            l = min(l, o, c)

            candles.append(
                Candle(
                    time=str(row["date_str"]),
                    open=round(o, 2),
                    high=round(h, 2),
                    low=round(l, 2),
                    close=round(c, 2),
                    volume=round(v, 2)
                )
            )

    return ChartPayload(
        symbol=clean_sym,
        name=name,
        candles=candles,
        high_52w=round(h_52w, 2),
        dist_to_52w_high_pct=round(dist_52w, 2),
        high_ath=round(h_ath, 2),
        dist_to_ath_pct=round(dist_ath, 2),
        volume_multiple=analysis.volume_multiple,
        is_volume_confirmed=analysis.is_volume_confirmed,
        turnover_cr=analysis.turnover_cr,
        is_fno=universe_store.is_fno(clean_sym),
        fno_lot_size=universe_store.get_fno_lot_size(clean_sym),
        is_synthetic=is_synthetic,
        current_price=analysis.current_price,
        change_pct=analysis.change_pct,
        atr14_pct=analysis.atr14_pct,
        sma20=analysis.sma20,
        sma50=analysis.sma50,
        sma100=analysis.sma100,
        sma200=analysis.sma200,
    )


@app.post("/api/scan")
def trigger_scan():
    global scan_state
    if not _scan_lock.acquire(blocking=False):
        return {
            "status": "already_running",
            "is_scanning": True,
            "message": "Scan already in progress.",
        }

    scan_state["is_scanning"] = True
    scan_state["progress"] = 0
    scan_state["total"] = 1
    scan_state["current_symbol"] = "Checking NSE servers..."
    scan_state["scan_message"] = None
    scan_state["scan_status_type"] = "info"
    scan_state["scan_result_status"] = "running"
    scan_state["stocks_updated"] = 0
    scan_state["is_today_available"] = False

    def _on_progress(step: int, total: int, label: str) -> None:
        scan_state["progress"] = step
        scan_state["total"] = max(1, total)
        scan_state["current_symbol"] = label

    def _bg_scan_worker() -> None:
        try:
            from backend.app.bhavcopy_engine import bhavcopy_engine
            result = bhavcopy_engine.sync_daily_market(progress_callback=_on_progress)
            _load_initial_cache()
            data_engine.clear_sparkline_cache()
            scan_state["last_scanned"] = _now_ist_str()
            scan_state["scan_message"] = result["message"]
            res_status = result.get("status", "info")
            scan_state["scan_result_status"] = res_status
            scan_state["scan_status_type"] = "success" if res_status == "success" else "info"
            scan_state["stocks_updated"] = int(result.get("stocks_updated", 0) or 0)
            scan_state["is_today_available"] = bool(result.get("is_today_available", False))
            if result.get("trade_date") and (scan_state["stocks_updated"] > 0 or scan_state["is_today_available"]):
                scan_state["latest_data_date"] = result["trade_date"]
        except Exception as e:
            logger.error(f"Error during Bhavcopy scan: {e}", exc_info=True)
            scan_state["scan_message"] = f"Scan failed: {e}"
            scan_state["scan_status_type"] = "error"
            scan_state["scan_result_status"] = "error"
            scan_state["stocks_updated"] = 0
            scan_state["is_today_available"] = False
        finally:
            scan_state["is_scanning"] = False
            scan_state["current_symbol"] = ""
            _scan_lock.release()

    t = threading.Thread(target=_bg_scan_worker, daemon=True)
    t.start()

    return {
        "status": "started",
        "is_scanning": True,
        "message": "Checking official NSE servers for latest market data...",
    }


@app.get("/api/scan-status")
def get_scan_status():
    return {
        "is_scanning": scan_state["is_scanning"],
        "progress": scan_state["progress"],
        "total": scan_state["total"],
        "current_symbol": scan_state["current_symbol"],
        "last_scanned": scan_state["last_scanned"],
        "latest_data_date": scan_state.get("latest_data_date"),
        "scan_message": scan_state.get("scan_message"),
        "scan_status_type": scan_state.get("scan_status_type", "info"),
        "scan_result_status": scan_state.get("scan_result_status"),
        "stocks_updated": scan_state.get("stocks_updated", 0),
        "is_today_available": scan_state.get("is_today_available", False),
    }


@app.post("/api/upload-bhavcopy")
async def upload_bhavcopy(file: UploadFile = File(...)):
    """Uploads and ingests official NSE Bhavcopy (pd*.csv, sec_bhavdata*.csv, or PR*.zip)."""
    if not _scan_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A market scan / ingestion is already in progress. Please retry shortly.")
    scan_state["is_scanning"] = True
    try:
        from backend.app.bhavcopy_engine import bhavcopy_engine
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(content) > MAX_BHAVCOPY_BYTES:
            raise HTTPException(status_code=413, detail="Uploaded file is too large (max 25 MB).")

        stocks, t_date = await run_in_threadpool(bhavcopy_engine.parse_bhavcopy_file, content, file.filename or "")
        if not stocks:
            raise HTTPException(status_code=400, detail="No valid equity stocks found in uploaded Bhavcopy.")

        # Heavy SQLite write + full screener recompute: keep it off the event loop
        count = await run_in_threadpool(bhavcopy_engine.ingest_stocks_to_db, stocks, t_date)
        _load_initial_cache()
        data_engine.clear_sparkline_cache()
        complete_date = data_engine.get_latest_complete_data_date()
        candidates = [d for d in (t_date, scan_state.get("latest_data_date"), complete_date) if d]
        if candidates:
            scan_state["latest_data_date"] = max(candidates)
        scan_state["last_scanned"] = _now_ist_str()
        return {
            "status": "success",
            "message": f"Successfully ingested official NSE Bhavcopy for {t_date}! {count} stocks updated.",
            "trade_date": t_date,
            "stocks_updated": count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process uploaded Bhavcopy: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        scan_state["is_scanning"] = False
        _scan_lock.release()


@app.post("/api/upload-csv")
async def upload_universe_csv(file: UploadFile = File(...), replace: bool = Form(True)):
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(content) > MAX_CSV_BYTES:
            raise HTTPException(status_code=413, detail="Uploaded CSV is too large (max 10 MB).")

        lines = content.decode("utf-8", errors="ignore").splitlines()
        if not lines:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Guard against wiping the universe with a CSV that has no SYMBOL column (supporting quoted headers)
        first_row = next(csv.reader([lines[0]]), [])
        header_cols = [h.strip().lstrip("\ufeff").upper() for h in first_row]
        if "SYMBOL" not in header_cols:
            raise HTTPException(status_code=400, detail="CSV must contain a 'SYMBOL' column header.")

        imported_count = universe_store.save_uploaded_csv(lines, overwrite=replace)
        return {
            "status": "success",
            "message": f"Imported {imported_count} NSE stocks into persistent universe.",
            "total_universe": universe_store.total_count()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process uploaded CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Serve React Frontend in Production
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        real_static = os.path.realpath(STATIC_DIR)
        real_target = os.path.realpath(os.path.join(real_static, full_path))
        try:
            is_inside = os.path.commonpath([real_static, real_target]) == real_static
        except ValueError:
            is_inside = False
        if is_inside and os.path.isfile(real_target):
            return FileResponse(real_target)
        return FileResponse(os.path.join(real_static, "index.html"))
