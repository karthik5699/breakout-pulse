# -*- coding: utf-8 -*-
import os
import pandas as pd
import json
import asyncio
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Query
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
    title="52-Week High & ATH Momentum Screener (NSE)",
    description="Small/Midcap-optimized 52-Week High, 52-Week Breakout, and All-Time High scanner with Volume Confirmation",
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

# Global scan status state
scan_state = {
    "is_scanning": False,
    "progress": 0,
    "total": 0,
    "current_symbol": "",
    "last_scanned": None,
    "cached_results": []
}

def _run_scan_job():
    """Background task to fetch and analyze universe stocks."""
    global scan_state
    scan_state["is_scanning"] = True
    scan_state["progress"] = 0
    
    try:
        symbols = universe_store.get_symbols(exclude_be=False)
        scan_state["total"] = len(symbols)
        
        # 1. Fetch benchmarks
        sm_bench, n50_bench = data_engine.fetch_benchmarks(period="5y")
        
        # 2. Fetch or load cached stocks
        stock_dfs = {}
        stock_names = {}
        
        for idx, sym in enumerate(symbols):
            scan_state["progress"] = idx + 1
            scan_state["current_symbol"] = sym
            meta = universe_store.get(sym)
            stock_names[sym] = meta.name if meta else sym
            
            # Check cached or fetch if missing
            cached_df = data_engine.get_cached_candles(sym)
            if cached_df is None or len(cached_df) < 20:
                cached_df = data_engine.fetch_and_cache_symbol(sym, period="5y")
            
            if cached_df is not None and len(cached_df) >= 20:
                stock_dfs[sym] = cached_df
                
        # 3. Run full High/ATH analysis
        results = screener_engine.run_screener(stock_dfs, stock_names, sm_bench, n50_bench)
        scan_state["cached_results"] = results
        scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"Scan complete: analyzed {len(stock_dfs)} stocks, computed {len(results)} screener items.")

    except Exception as e:
        logger.error(f"Error during universe scan: {e}", exc_info=True)
    finally:
        scan_state["is_scanning"] = False

def _recompute_from_sqlite():
    """Recalculates all cached SQLite stocks using ScreenerEngine."""
    cached_syms = data_engine.get_all_cached_symbols()
    if not cached_syms:
        return []
    
    stock_dfs = {}
    stock_names = {}
    for s in cached_syms:
        df = data_engine.get_cached_candles(s)
        if df is not None and len(df) >= 20:
            stock_dfs[s] = df
            meta = universe_store.get(s)
            stock_names[s] = meta.name if meta else s
            
    sm_bench = data_engine.get_cached_candles(BENCHMARK_SMALLMID)
    n50_bench = data_engine.get_cached_candles(BENCHMARK_NIFTY50)
    
    results = screener_engine.run_screener(stock_dfs, stock_names, sm_bench, n50_bench)
    scan_state["cached_results"] = results
    scan_state["last_scanned"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return results


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "universe_size": universe_store.total_count(),
        "cached_symbols": len(data_engine.get_all_cached_symbols()),
        "is_scanning": scan_state["is_scanning"]
    }


@app.get("/api/universe-stats", response_model=UniverseStats)
def get_universe_stats():
    results: List[StockScreenerItem] = scan_state.get("cached_results", [])
    if not results:
        results = _recompute_from_sqlite()

    near_52w = sum(1 for x in results if x.status == "NEAR_52W_HIGH")
    at_52w = sum(1 for x in results if x.status == "AT_52W_HIGH")
    near_ath = sum(1 for x in results if x.status == "NEAR_ATH")
    recent_listing = sum(1 for x in results if x.status == "RECENT_LISTING")
    confirmed_vol = sum(1 for x in results if x.is_volume_confirmed and x.status in ("NEAR_52W_HIGH", "AT_52W_HIGH", "NEAR_ATH", "RECENT_LISTING"))

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

    return UniverseStats(
        total_stocks=universe_store.total_count(),
        cached_stocks=len(data_engine.get_all_cached_symbols()),
        near_52w_count=near_52w,
        at_52w_count=at_52w,
        near_ath_count=near_ath,
        recent_listing_count=recent_listing,
        confirmed_volume_count=confirmed_vol,
        last_scanned=scan_state.get("last_scanned"),
        smallmid_trend=sm_trend,
        nifty50_trend=n50_trend
    )


@app.get("/api/stocks", response_model=List[StockScreenerItem])
def get_screened_stocks(
    tab: str = Query("near_52w", description="Filter tab: near_52w, breakout_52w, ath, recent_listings, all"),
    volume_confirmed_only: bool = Query(True, description="Default view shows only volume confirmed (>=1.4x) stocks"),
    trend_only: bool = Query(False, description="Filter only stocks passing trend checks"),
    search: Optional[str] = Query(None, description="Search by symbol or company name"),
    min_rs: int = Query(0, description="Minimum Small/Midcap RS rating (e.g. 70)"),
    limit: int = Query(250, description="Max items to return")
):
    results: List[StockScreenerItem] = scan_state.get("cached_results", [])
    if not results:
        results = _recompute_from_sqlite()

    filtered = results

    # 1. Tab filtering
    if tab == "near_52w":
        filtered = [x for x in filtered if x.status in ("NEAR_52W_HIGH", "AT_52W_HIGH")]
    elif tab == "breakout_52w":
        filtered = [x for x in filtered if x.status == "AT_52W_HIGH"]
    elif tab == "ath":
        filtered = [x for x in filtered if x.status == "NEAR_ATH"]
    elif tab == "recent_listings":
        filtered = [x for x in filtered if x.status == "RECENT_LISTING"]

    # 2. Volume confirmation filter
    if volume_confirmed_only and tab != "all":
        filtered = [x for x in filtered if x.is_volume_confirmed]

    # 3. Trend health filter
    if trend_only:
        filtered = [x for x in filtered if x.passes_trend_check]

    # 4. RS filter
    if min_rs > 0:
        filtered = [x for x in filtered if x.rs_rating_smallmid >= min_rs]

    # 5. Search filter
    if search:
        s = search.strip().upper()
        filtered = [x for x in filtered if s in x.symbol.upper() or s in x.name.upper()]

    # 6. Sort descending by Volume Signal
    filtered.sort(key=lambda x: (x.vol_multiple if x.vol_multiple is not None else 0.0), reverse=True)

    return filtered[:limit]


@app.get("/api/stocks/{symbol}/chart", response_model=ChartPayload)
def get_stock_chart(symbol: str):
    clean_sym = symbol.strip().upper().replace(".NS", "")
    df = data_engine.get_cached_candles(clean_sym)
    
    if df is None or len(df) < 5:
        # Try fetching live
        df = data_engine.fetch_and_cache_symbol(clean_sym, period="5y")
        if df is None or len(df) < 5:
            raise HTTPException(status_code=404, detail=f"No chart data available for {symbol}")

    computed_df = screener_engine.compute_indicators(df)
    meta = universe_store.get(clean_sym)
    name = meta.name if meta else clean_sym

    # Get RS ratings
    sm_bench = data_engine.get_cached_candles(BENCHMARK_SMALLMID)
    n50_bench = data_engine.get_cached_candles(BENCHMARK_NIFTY50)
    rs_map = screener_engine.compute_rs_ratings({clean_sym: computed_df}, sm_bench, n50_bench)
    rs_sm, rs_n50 = rs_map.get(clean_sym, (50, 50))

    analysis = screener_engine.analyze_stock(computed_df, rs_sm, rs_n50)

    # Format candles for TradingView Lightweight Charts
    candles = [
        Candle(
            time=row["date_str"],
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=float(row["volume"])
        )
        for _, row in computed_df.iterrows()
    ]

    return ChartPayload(
        symbol=clean_sym,
        name=name,
        candles=candles,
        high_52w=analysis.high_52w,
        low_52w=analysis.low_52w,
        high_ath=analysis.high_ath,
        dist_to_52w_high_pct=analysis.dist_to_52w_high_pct,
        dist_to_ath_pct=analysis.dist_to_ath_pct,
        status=analysis.status,
        status_label=analysis.status_label,
        volume_multiple=analysis.volume_multiple,
        is_volume_confirmed=analysis.is_volume_confirmed,
        rs_rating_smallmid=analysis.rs_rating_smallmid,
        rs_rating_nifty50=analysis.rs_rating_nifty50,
        sma50=analysis.sma50,
        sma200=analysis.sma200,
        sma200_slope_60d_pct=analysis.sma200_slope_60d_pct,
        turnover_cr=analysis.turnover_cr
    )


@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks):
    if scan_state["is_scanning"]:
        return {"status": "in_progress", "progress": scan_state["progress"], "total": scan_state["total"]}
    
    background_tasks.add_task(_run_scan_job)
    return {"status": "started", "message": f"Scan initiated for {universe_store.total_count()} symbols."}


@app.post("/api/recalculate")
def recalculate_cached_stocks():
    """Immediately re-evaluates all cached stocks in SQLite using ScreenerEngine."""
    results = _recompute_from_sqlite()
    near_52w = sum(1 for x in results if x.status == "NEAR_52W_HIGH")
    at_52w = sum(1 for x in results if x.status == "AT_52W_HIGH")
    near_ath = sum(1 for x in results if x.status == "NEAR_ATH")
    recent_listing = sum(1 for x in results if x.status == "RECENT_LISTING")
    
    return {
        "status": "success",
        "total_analyzed": len(results),
        "near_52w_high": near_52w,
        "at_52w_high": at_52w,
        "near_ath": near_ath,
        "recent_listings": recent_listing
    }


@app.get("/api/scan-status")
def get_scan_status():
    return {
        "is_scanning": scan_state["is_scanning"],
        "progress": scan_state["progress"],
        "total": scan_state["total"],
        "current_symbol": scan_state["current_symbol"],
        "last_scanned": scan_state["last_scanned"]
    }


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
