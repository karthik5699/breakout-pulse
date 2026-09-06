# -*- coding: utf-8 -*-
import os
import pandas as pd
import json
import asyncio
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import yfinance as yf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.app.models import (
    StockScreenerItem, ChartPayload, Candle, HighLowAnalysis, UniverseStats
)
from backend.app.universe_store import universe_store
from backend.app.data_engine import data_engine, BENCHMARK_SMALLMID, BENCHMARK_NIFTY50
from backend.app.screener_engine import screener_engine

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = FastAPI(
    title="BreakoutPulse — 52-Week High & ATH Momentum Screener (NSE)",
    description="52-Week High, 52-Week Breakout, and All-Time High scanner with Volume Confirmation",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    "cached_results": []
}

def _load_initial_cache():
    """Loads pre-seeded screener cache so the dashboard is immediately populated on cloud launch."""
    global scan_state
    if os.path.exists(CACHE_JSON_PATH):
        try:
            with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
                payload = json.load(f)
                items = [StockScreenerItem(**x) for x in payload.get("results", [])]
                if items:
                    scan_state["cached_results"] = items
                    scan_state["last_scanned"] = payload.get("last_scanned", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    scan_state["latest_data_date"] = payload.get("latest_data_date", "2026-08-28")
                    logger.info(f"Loaded {len(items)} pre-calculated stocks from {CACHE_JSON_PATH}")
                else:
                    logger.warning(f"Cache file at {CACHE_JSON_PATH} had 0 items; preserving in-memory cached results ({len(scan_state.get('cached_results', []))} stocks).")
        except Exception as e:
            logger.warning(f"Could not load pre-seeded cache: {e}")

_load_initial_cache()


def _run_scan_job():
    """Background task to fetch and analyze universe stocks strictly using official NSE Bhavcopy data."""
    global scan_state
    scan_state["is_scanning"] = True
    scan_state["progress"] = 0
    scan_state["total"] = universe_store.total_count()
    
    try:
        from backend.app.bhavcopy_engine import bhavcopy_engine
        result = bhavcopy_engine.sync_daily_market()
        _load_initial_cache()
        scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        scan_state["progress"] = scan_state["total"]
        scan_state["scan_message"] = result["message"]
        scan_state["scan_status_type"] = "success" if result.get("status") == "success" else "info"
        if result.get("trade_date") and (result.get("stocks_updated", 0) > 0 or result.get("is_today_available")):
            scan_state["latest_data_date"] = result["trade_date"]
    except Exception as e:
        logger.error(f"Error during Bhavcopy scan: {e}", exc_info=True)
        scan_state["scan_message"] = f"Scan error: {e}"
        scan_state["scan_status_type"] = "error"
    finally:
        scan_state["is_scanning"] = False


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
        scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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


def _is_ath(x: StockScreenerItem) -> bool:
    # Within +-10% of ATH (Early setups & active breakouts)
    return bool(x.dist_to_ath_pct >= -10.0 and x.dist_to_ath_pct <= 10.0 and (x.trading_days or 500) >= 500 and x.passes_liquidity)

def _is_recent_listing(x: StockScreenerItem) -> bool:
    return bool((x.trading_days or 500) < 500 and x.dist_to_52w_high_pct >= -10.0 and x.passes_liquidity)

def _is_near_52w(x: StockScreenerItem) -> bool:
    # Within 10% of 52W High, excluding ATH and Recent Listings to guarantee ZERO duplicates
    return bool(x.dist_to_52w_high_pct >= -10.0 and not _is_ath(x) and not _is_recent_listing(x) and x.passes_liquidity)


@app.get("/api/universe-stats", response_model=UniverseStats)
def get_universe_stats():
    results: List[StockScreenerItem] = scan_state.get("cached_results", [])
    if not results:
        _load_initial_cache()
        results = scan_state.get("cached_results", [])
    if not results:
        results = _recompute_from_sqlite()

    near_ath = sum(1 for x in results if _is_ath(x))
    recent_listing = sum(1 for x in results if _is_recent_listing(x))
    near_52w = sum(1 for x in results if _is_near_52w(x))
    at_52w = sum(1 for x in results if x.dist_to_52w_high_pct >= -0.5 and not _is_ath(x) and not _is_recent_listing(x) and x.passes_liquidity)
    confirmed_vol = sum(1 for x in results if x.is_volume_confirmed and (_is_ath(x) or _is_near_52w(x) or _is_recent_listing(x)))

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
    latest_date = data_engine.get_latest_data_date() or scan_state.get("latest_data_date", "2026-08-25")

    return UniverseStats(
        total_stocks=universe_store.total_count(),
        cached_stocks=total_cached,
        near_52w_count=near_52w,
        at_52w_count=at_52w,
        near_ath_count=near_ath,
        recent_listing_count=recent_listing,
        confirmed_volume_count=confirmed_vol,
        last_scanned=scan_state.get("last_scanned"),
        latest_data_date=latest_date,
        smallmid_trend=sm_trend,
        nifty50_trend=n50_trend
    )


@app.get("/api/stocks", response_model=List[StockScreenerItem])
def get_screened_stocks(
    tab: str = Query("ath", description="Filter tab: ath, near_52w, breakout_52w, recent_listings, all"),
    volume_confirmed_only: bool = Query(True, description="Default view shows only volume confirmed (>=1.4x) stocks"),
    trend_only: bool = Query(False, description="Filter only stocks passing trend checks"),
    search: Optional[str] = Query(None, description="Search by symbol or company name"),
    min_rs: int = Query(0, description="Minimum Small/Midcap RS rating (e.g. 70)"),
    limit: int = Query(250, description="Max items to return")
):
    results: List[StockScreenerItem] = scan_state.get("cached_results", [])
    if not results:
        _load_initial_cache()
        results = scan_state.get("cached_results", [])
    if not results:
        results = _recompute_from_sqlite()

    # Base liquidity filter: require valid liquidity for all setups
    filtered = [x for x in results if x.passes_liquidity] if tab != "all" else results

    # 1. Mutually Exclusive Tab Filtering (Zero Duplicates)
    if tab == "ath":
        filtered = [x for x in filtered if _is_ath(x)]
    elif tab == "near_52w":
        filtered = [x for x in filtered if _is_near_52w(x)]
    elif tab == "breakout_52w":
        filtered = [x for x in filtered if x.dist_to_52w_high_pct >= -0.5 and not _is_ath(x) and not _is_recent_listing(x)]
    elif tab == "recent_listings":
        filtered = [x for x in filtered if _is_recent_listing(x)]

    # 2. Volume confirmation filter
    if volume_confirmed_only and tab != "all":
        filtered = [x for x in filtered if x.is_volume_confirmed]

    # 3. Trend health filter
    if trend_only:
        filtered = [x for x in filtered if x.passes_trend_check]

    # 4. RS filter
    if min_rs > 0:
        filtered = [x for x in filtered if (x.rs_rating_smallmid or 0) >= min_rs]

    # 5. Search filter
    if search:
        s = search.strip().upper()
        filtered = [x for x in filtered if s in x.symbol.upper() or s in x.name.upper()]

    # 6. Sort descending by Volume Signal
    filtered.sort(key=lambda x: (x.vol_multiple if x.vol_multiple is not None else 0.0), reverse=True)

    return filtered[:limit]


@app.get("/api/stocks/{symbol}/chart", response_model=ChartPayload)
def get_stock_chart(symbol: str, response: Response):
    import numpy as np
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"

    clean_sym = symbol.strip().upper().replace(".NS", "")
    df = data_engine.get_cached_candles(clean_sym)
    
    # If not cached or only has few recent Bhavcopy daily bars, fetch full multi-year history
    if df is None or len(df) < 100:
        try:
            fetched_df = data_engine.fetch_and_cache_symbol(clean_sym, period="5y")
            if fetched_df is not None and not fetched_df.empty:
                df = data_engine.get_cached_candles(clean_sym)
        except Exception as e:
            logger.warning(f"Could not fetch historical chart data for {clean_sym}: {e}")

    if df is None or len(df) < 1:
        raise HTTPException(status_code=404, detail=f"No chart data available for {symbol}")

    true_ath = data_engine.get_stock_ath(clean_sym)
    computed_df = screener_engine.compute_indicators(df, lifetime_ath=true_ath)
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

    vol_last = float(computed_df["volume"].iloc[-1])
    vol_sma50_val = computed_df["vol_sma50"].iloc[-1] if "vol_sma50" in computed_df else vol_last
    if pd.isna(vol_sma50_val) or np.isnan(vol_sma50_val) or float(vol_sma50_val) <= 0:
        vol_sma50 = max(vol_last, 1.0)
    else:
        vol_sma50 = float(vol_sma50_val)

    vol_mult = round(vol_last / vol_sma50, 2) if vol_sma50 > 0 else 1.0
    dist_52w = round(((c_last - h_52w) / h_52w) * 100, 2) if h_52w > 0 else 0.0
    dist_ath = round(((c_last - h_ath) / h_ath) * 100, 2) if h_ath > 0 else 0.0
    
    turnover_sma_val = computed_df["turnover_sma20"].iloc[-1] if "turnover_sma20" in computed_df else 0.0
    turnover_cr = round(float(turnover_sma_val) / 1e7, 2) if (pd.notna(turnover_sma_val) and not np.isnan(turnover_sma_val)) else 0.0

    candles = []
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
        volume_multiple=round(vol_mult, 2),
        is_volume_confirmed=bool(vol_mult >= 1.4 and vol_last >= 5000),
        turnover_cr=round(turnover_cr, 2)
    )


@app.post("/api/scan")
def trigger_scan():
    global scan_state
    if scan_state["is_scanning"]:
        return {"status": "already_running", "message": "Scan already in progress."}
    
    scan_state["is_scanning"] = True
    try:
        from backend.app.bhavcopy_engine import bhavcopy_engine
        result = bhavcopy_engine.sync_daily_market()
        _load_initial_cache()
        scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        scan_state["scan_message"] = result["message"]
        scan_state["scan_status_type"] = "success" if result.get("status") == "success" else "info"
        if result.get("trade_date") and (result.get("stocks_updated", 0) > 0 or result.get("is_today_available")):
            scan_state["latest_data_date"] = result["trade_date"]
        
        return {
            "status": result["status"],
            "is_today_available": result.get("is_today_available", False),
            "message": result["message"],
            "trade_date": result.get("trade_date"),
            "stocks_updated": result.get("stocks_updated", 0)
        }
    finally:
        scan_state["is_scanning"] = False


@app.get("/api/scan-status")
def get_scan_status():
    return {
        "is_scanning": scan_state["is_scanning"],
        "progress": scan_state["progress"],
        "total": scan_state["total"],
        "current_symbol": scan_state["current_symbol"],
        "last_scanned": scan_state["last_scanned"],
        "scan_message": scan_state.get("scan_message"),
        "scan_status_type": scan_state.get("scan_status_type", "info")
    }


@app.post("/api/upload-bhavcopy")
async def upload_bhavcopy(file: UploadFile = File(...)):
    """Uploads and ingests official NSE Bhavcopy (pd*.csv, sec_bhavdata*.csv, or PR*.zip)."""
    try:
        from backend.app.bhavcopy_engine import bhavcopy_engine
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
        stocks, t_date = bhavcopy_engine.parse_bhavcopy_file(content, file.filename)
        if not stocks:
            raise HTTPException(status_code=400, detail="No valid equity stocks found in uploaded Bhavcopy.")
            
        count = bhavcopy_engine.ingest_stocks_to_db(stocks, t_date)
        _load_initial_cache()
        scan_state["latest_data_date"] = t_date
        scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return {
            "status": "success",
            "message": f"Successfully ingested official NSE Bhavcopy for {t_date}! {count} stocks updated.",
            "trade_date": t_date,
            "stocks_updated": count
        }
    except Exception as e:
        logger.error(f"Failed to process uploaded Bhavcopy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-csv")
async def upload_universe_csv(file: UploadFile = File(...), replace: bool = Form(True)):
    try:
        content = await file.read()
        lines = content.decode("utf-8", errors="ignore").splitlines()
        if not lines:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
        imported_count = universe_store.save_uploaded_csv(lines, overwrite=replace)
        return {
            "status": "success",
            "message": f"Imported {imported_count} NSE stocks into persistent universe.",
            "total_universe": universe_store.total_count()
        }
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
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
