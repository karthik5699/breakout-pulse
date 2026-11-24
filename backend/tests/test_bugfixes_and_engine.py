# -*- coding: utf-8 -*-
import asyncio
import io
import json
import os
import sqlite3
import sys
import zipfile

import numpy as np
import pandas as pd

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.bhavcopy_engine import BhavcopyEngine
from backend.app.data_engine import DataEngine
from backend.app.main import (
    CACHE_JSON_PATH,
    STATIC_DIR,
    _is_near_52w,
    get_screened_stocks,
    get_stock_chart,
    get_universe_stats,
    health_check,
    serve_spa,
)
from backend.app.models import StockScreenerItem
from backend.app.screener_engine import screener_engine
from backend.app.universe_store import UniverseStore


def test_serve_spa_blocks_path_traversal():
    if not os.path.exists(STATIC_DIR):
        return
    resp = asyncio.run(serve_spa("../../backend/requirements.txt"))
    real_resp = os.path.realpath(resp.path)
    real_static = os.path.realpath(STATIC_DIR)
    assert os.path.commonpath([real_static, real_resp]) == real_static
    assert os.path.basename(real_resp) == "index.html"


def test_adx14_wilder_includes_period_bar_and_matches_exact_recurrence():
    # Construct 35 bars with realistic oscillations (+DM and -DM both non-zero)
    n = 35
    closes = [100.0 + i * 0.8 + (3.0 if i % 3 == 0 else -2.2 if i % 3 == 1 else 0.6) for i in range(n)]
    highs = [c + (2.5 if i % 2 == 0 else 1.2) for i, c in enumerate(closes)]
    lows = [c - (1.2 if i % 2 == 0 else 2.6) for i, c in enumerate(closes)]
    # Inject a sharp downward reversal right on bar 15 (which is tr[14], i == period in TR array)
    lows[15] -= 15.0
    closes[15] -= 10.0

    # Compare against independent reference Wilder ADX(14) calculation
    period = 14
    h = np.asarray(highs, dtype=np.float64)
    l = np.asarray(lows, dtype=np.float64)
    c = np.asarray(closes, dtype=np.float64)
    up_move = h[1:] - h[:-1]
    down_move = l[:-1] - l[1:]
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))

    tr_s = float(np.sum(tr[:period]))
    p_s = float(np.sum(plus_dm[:period]))
    m_s = float(np.sum(minus_dm[:period]))

    dxs = []
    p_di = 100.0 * p_s / tr_s
    m_di = 100.0 * m_s / tr_s
    dxs.append(100.0 * abs(p_di - m_di) / (p_di + m_di))

    for i in range(period, len(tr)):
        tr_s = tr_s - tr_s / period + float(tr[i])
        p_s = p_s - p_s / period + float(plus_dm[i])
        m_s = m_s - m_s / period + float(minus_dm[i])
        p_di = 100.0 * p_s / tr_s
        m_di = 100.0 * m_s / tr_s
        dxs.append(100.0 * abs(p_di - m_di) / (p_di + m_di))

    expected_adx = float(np.mean(dxs[:period]))
    for i in range(period, len(dxs)):
        expected_adx = (expected_adx * (period - 1) + dxs[i]) / period

    _, got_adx, _ = screener_engine.compute_wilder_oscillators(highs, lows, closes, period=14)
    assert got_adx is not None
    assert 0.0 < got_adx < 100.0
    assert abs(got_adx - round(expected_adx, 2)) <= 0.01

    # Also verify tr[14] / minus_dm[14] actually altered ADX vs baseline bar 15
    lows_base = list(lows)
    closes_base = list(closes)
    lows_base[15] += 15.0
    closes_base[15] += 10.0
    _, adx_base, _ = screener_engine.compute_wilder_oscillators(highs, lows_base, closes_base, period=14)
    assert got_adx != adx_base


def test_compute_rs_ratings_distinct_nifty50_and_smallmid():
    n = 260
    # Nifty 50 rises strongly (+30% over 6M)
    n50_closes = np.linspace(100.0, 130.0, n)
    n50_df = pd.DataFrame({"close": n50_closes})

    # Flat stock: top/middle cross-sectional? Give 3 stocks with different returns
    stock_dfs = {
        "LEADER": pd.DataFrame({"close": np.linspace(100.0, 180.0, n)}),
        "MIDDLE": pd.DataFrame({"close": np.linspace(100.0, 110.0, n)}),
        "LAGGARD": pd.DataFrame({"close": np.linspace(100.0, 90.0, n)}),
    }
    ratings = screener_engine.compute_rs_ratings(stock_dfs, smallmid_bench_df=None, nifty50_bench_df=n50_df)

    # MIDDLE rises +10% while Nifty50 rises +30% -> underperforms Nifty (<50), whereas cross-sectional percentile is 50
    sm_mid, n50_mid = ratings["MIDDLE"]
    assert sm_mid == 50
    assert n50_mid < 50
    assert ratings["LEADER"][0] == 99
    assert ratings["LAGGARD"][0] == 1
    assert ratings["LEADER"][1] > ratings["MIDDLE"][1] > ratings["LAGGARD"][1]


def test_bhavcopy_date_extraction_and_reordered_pd_csv():
    engine = BhavcopyEngine()

    # Reordered pd CSV header columns
    pd_csv = (
        "SYMBOL,NET_TRDQTY,CLOSE_PRICE,HIGH_PRICE,LOW_PRICE,OPEN_PRICE,PREV_CL_PR,NET_TRDVAL,SERIES,SECURITY\n"
        "BEL,500000,310.0,312.0,305.0,306.0,304.0,155000000,EQ,Bharat Electronics Limited\n"
        "NIFTYBEES,10000,250.0,251.0,249.0,250.0,249.5,2500000,MF,ETF\n"
    )
    stocks_pd, dt_pd = engine.parse_pd_csv(pd_csv, default_date="2026-11-19")
    assert dt_pd == "2026-11-19"
    assert len(stocks_pd) == 1
    assert stocks_pd[0]["symbol"] == "BEL"
    assert stocks_pd[0]["close"] == 310.0
    assert stocks_pd[0]["volume"] == 500000.0
    assert stocks_pd[0]["turnover"] == 155000000.0

    # Date extraction across filename formats
    sec_csv = (
        "SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,TTL_TRD_QNTY,TURNOVER_LACS\n"
        "TRENT,EQ,5000,5100,4980,5080,200000,10160\n"
    ).encode("utf-8")

    # 1. cm19NOV2026bhav.csv.zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("cm19NOV2026bhav.csv", sec_csv)
    _, d1 = engine.parse_bhavcopy_file(buf.getvalue(), "cm19NOV2026bhav.csv.zip")
    assert d1 == "2026-11-19"

    # 2. PR191126.zip
    buf2 = io.BytesIO()
    with zipfile.ZipFile(buf2, "w") as zf:
        zf.writestr("pd191126.csv", pd_csv)
    s2, d2 = engine.parse_bhavcopy_file(buf2.getvalue(), "PR191126.zip")
    assert d2 == "2026-11-19"
    assert len(s2) == 1 and s2[0]["symbol"] == "BEL"

    # 3. sec_bhavdata_full_19112026.csv
    _, d3 = engine.parse_bhavcopy_file(sec_csv, "sec_bhavdata_full_19112026.csv")
    assert d3 == "2026-11-19"

    # 4. bhav_2026-11-19.csv
    _, d4 = engine.parse_bhavcopy_file(sec_csv, "bhav_2026-11-19.csv")
    assert d4 == "2026-11-19"


def test_universe_store_merge_overwrite_false(tmp_path):
    csv_path = str(tmp_path / "uni.csv")
    fno_path = str(tmp_path / "fno.json")
    store = UniverseStore(csv_path=csv_path, fno_json_path=fno_path)

    initial_lines = [
        "SYMBOL,NAME OF COMPANY,SERIES,DATE OF LISTING,FACE VALUE",
        "BEL,Bharat Electronics Limited,EQ,19-JUL-2002,1",
        "TRENT,Trent Limited,EQ,07-JUN-2004,1",
    ]
    count1 = store.save_uploaded_csv(initial_lines, overwrite=True)
    assert count1 == 2
    assert store.total_count() == 2

    # Merge overwrite=False should preserve TRENT and add DIXON while updating BEL
    merge_lines = [
        '"SYMBOL","NAME OF COMPANY","SERIES"',
        "BEL,Bharat Electronics Ltd,EQ",
        "DIXON,Dixon Technologies Ltd,EQ",
    ]
    count2 = store.save_uploaded_csv(merge_lines, overwrite=False)
    assert count2 == 2
    assert store.total_count() == 3
    assert store.get("TRENT") is not None
    assert store.get("DIXON") is not None
    assert store.get("BEL").name == "Bharat Electronics Ltd"
    # Existing listing_date on BEL should be preserved when omitted from merge CSV
    assert store.get("BEL").listing_date == "19-JUL-2002"


def test_get_latest_complete_data_date_ignores_single_symbol_outlier(tmp_path):
    db_path = str(tmp_path / "test_market.db")
    de = DataEngine(db_path=db_path)

    rows = []
    for i in range(520):
        rows.append((f"SYM{i}", "2026-11-18", 100.0, 102.0, 99.0, 101.0, 10000.0))
    # Single symbol backfill on a newer date
    rows.append(("SYM0", "2026-11-19", 101.0, 105.0, 100.0, 104.0, 15000.0))

    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            "INSERT INTO daily_candles (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()

    assert de.get_latest_complete_data_date(min_symbols=500) == "2026-11-18"
    assert de.get_latest_data_date() == "2026-11-18"


def test_check_stage2_trend_young_recent_listing_vs_mature():
    # Recent listing with <200 bars passes Young Stage 2 when Price > MA20 > MA50
    ok_young, reasons_young = screener_engine.check_stage2_trend(
        price=150.0,
        sma20=140.0,
        sma50=130.0,
        sma200=None,
        sma200_21d_ago=None,
        sma200_slope_60d_pct=None,
        trading_days=80,
        passes_liquidity=True,
        is_recently_listed=True,
    )
    assert ok_young is True
    assert reasons_young == []

    # Mature stock with <200 bars or missing SMA200 must fail
    ok_mature, _ = screener_engine.check_stage2_trend(
        price=150.0,
        sma20=140.0,
        sma50=130.0,
        sma200=None,
        sma200_21d_ago=None,
        sma200_slope_60d_pct=None,
        trading_days=80,
        passes_liquidity=True,
        is_recently_listed=False,
    )
    assert ok_mature is False


def test_live_cache_invariants_and_split_adjusted_aths():
    assert os.path.exists(CACHE_JSON_PATH)
    with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
        results = json.load(f).get("results", [])
    by_sym = {x["symbol"]: x for x in results}

    # Verify BANSALWIRE, HEG, CGCL no longer carry corrupted pre-split ATH / 52W / SMA200
    bw = by_sym["BANSALWIRE"]
    assert bw["high_ath"] < 150.0
    assert bw["high_52w"] < 120.0

    heg = by_sym["HEG"]
    assert heg["high_52w"] < 400.0
    assert heg["sma200"] < 300.0
    assert heg["roc126"] > 0

    cgcl = by_sym["CGCL"]
    assert cgcl["high_ath"] < 400.0

    # Verify zero <200-bar symbols appear in Near 52W High
    items = [StockScreenerItem(**x) for x in results]
    short_near_52w = [x for x in items if _is_near_52w(x) and (x.trading_days or 0) < 200]
    assert len(short_near_52w) == 0


def test_api_endpoints_smoke():
    h = health_check()
    assert h["status"] == "healthy"

    stats = get_universe_stats()
    assert stats.total_stocks > 2000
    assert stats.filtered_near_ath_count is not None

    for tab in ["ath", "near_52w", "recent_listings", "top10", "all"]:
        rows = get_screened_stocks(tab=tab)
        assert isinstance(rows, list)
        if rows:
            assert isinstance(rows[0].spark, list)
            assert len(rows[0].spark) > 0

    chart_trent = get_stock_chart("TRENT", timeframe="1D")
    assert chart_trent.symbol == "TRENT"
    assert len(chart_trent.candles) >= 200
    assert chart_trent.is_synthetic is False

    chart_bw = get_stock_chart("BANSALWIRE", timeframe="1W")
    assert chart_bw.symbol == "BANSALWIRE"
    assert chart_bw.high_ath < 150.0


def test_get_sparklines_sanitizes_and_caches(tmp_path):
    db_path = str(tmp_path / "spark_test.db")
    de = DataEngine(db_path=db_path)
    # 35 bars with a 2:1 unadjusted bonus discontinuity on day 20 (close drops from 400 to 200)
    rows = []
    for i in range(35):
        dt = f"2026-10-{i + 1:02d}" if i < 31 else f"2026-11-{i - 30:02d}"
        price = 400.0 + i if i < 20 else 200.0 + (i - 20)
        rows.append((dt, price, price + 2.0, price - 2.0, price, 10000.0))

    df_in = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume"])
    de._save_candles_to_db("TESTSYM", df_in)

    sp = de.get_sparklines(["TESTSYM"], days=30)
    assert "TESTSYM" in sp
    pts = sp["TESTSYM"]
    assert len(pts) == 30
    # Earliest returned bars should be adjusted smoothly (~200 zone instead of 400 zone)
    assert max(pts) < 230.0
    assert pts[-1] == 214.0

    # Cache hit & invalidation on save
    assert ("TESTSYM", 30) in de._sparkline_cache
    de._save_candles_to_db("TESTSYM", df_in.tail(1))
    assert ("TESTSYM", 30) not in de._sparkline_cache
