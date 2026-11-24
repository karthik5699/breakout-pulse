# -*- coding: utf-8 -*-
import json
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.data_engine import sanitize_and_adjust_candles
from backend.app.screener_engine import screener_engine
from backend.app.main import CACHE_JSON_PATH, get_screened_stocks


def test_ccavenue_excluded_from_top10_and_below_mas():
    assert os.path.exists(CACHE_JSON_PATH), f"Missing {CACHE_JSON_PATH}"
    with open(CACHE_JSON_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)

    results = payload.get("results", [])
    cc = next((x for x in results if x.get("symbol") == "CCAVENUE"), None)
    assert cc is not None, "CCAVENUE not found in screener_cache.json"

    assert cc["passes_top10_step1"] is False
    assert cc["top10_rank"] is None
    assert cc["current_price"] < cc["sma20"]
    assert cc["current_price"] < cc["sma50"]
    assert cc["current_price"] < cc["sma200"]

    top10 = get_screened_stocks(
        tab="top10",
        volume_confirmed_only=False,
        trend_only=True,
        fno_only=False,
        search=None,
        min_rs=0,
        limit=10,
    )
    assert all(x.symbol != "CCAVENUE" for x in top10), "CCAVENUE must not appear in Top 10 Momentum"


def test_all_top10_stocks_satisfy_stacked_moving_averages():
    top10 = get_screened_stocks(
        tab="top10",
        volume_confirmed_only=False,
        trend_only=True,
        fno_only=False,
        search=None,
        min_rs=0,
        limit=10,
    )
    assert len(top10) > 0, "Expected at least one Top 10 momentum stock"

    for stock in top10:
        assert stock.sma20 is not None
        assert stock.sma50 is not None
        assert stock.sma100 is not None
        assert stock.current_price > stock.sma20 > stock.sma50 > stock.sma100, (
            f"{stock.symbol} violates stacked MAs: P={stock.current_price}, "
            f"MA20={stock.sma20}, MA50={stock.sma50}, MA100={stock.sma100}"
        )
        if stock.sma200 is not None and (stock.trading_days or 0) >= 200:
            assert stock.sma100 > stock.sma200, (
                f"{stock.symbol} violates MA100 > MA200: MA100={stock.sma100}, MA200={stock.sma200}"
            )
            if stock.sma200_21d_ago is not None:
                assert stock.sma200 > stock.sma200_21d_ago, (
                    f"{stock.symbol} violates rising 200 SMA: MA200={stock.sma200}, "
                    f"MA200[21]={stock.sma200_21d_ago}"
                )


def test_sanitize_and_adjust_candles_reverse_and_forward_splits():
    # 1. Synthetic 1:10 reverse split (e.g., 13.83 -> 135.65, then downtrending to 121.20)
    n_pre = 220
    n_post = 20
    dates = [f"2026-01-{i+1:02d}" for i in range(n_pre + n_post)]
    opens = [14.0] * n_pre + [135.65 - i * 0.7 for i in range(n_post)]
    highs = [14.5] * n_pre + [136.0 - i * 0.7 for i in range(n_post)]
    lows = [13.5] * n_pre + [134.0 - i * 0.7 for i in range(n_post)]
    closes = [13.83] * n_pre + [135.0 - i * 0.72 for i in range(n_post)]
    closes[-1] = 121.20
    volumes = [10_000_000.0] * n_pre + [1_000_000.0] * n_post

    _, _, _, _, c_adj, v_adj, factor, action_date = sanitize_and_adjust_candles(
        dates, opens, highs, lows, closes, volumes
    )
    assert abs(factor - (135.65 / 13.83)) < 0.01
    assert action_date == dates[n_pre]
    assert round(c_adj[0], 2) == 135.65
    assert round(v_adj[0], 0) < 1_100_000

    sma20 = sum(c_adj[-20:]) / 20.0
    sma50 = sum(c_adj[-50:]) / 50.0
    sma100 = sum(c_adj[-100:]) / 100.0
    sma200 = sum(c_adj[-200:]) / 200.0
    sma200_21 = sum(c_adj[-221:-21]) / 200.0
    assert c_adj[-1] < sma20 and c_adj[-1] < sma50 and c_adj[-1] < sma200

    item = {
        "current_price": c_adj[-1],
        "high_52w": max(c_adj),
        "high_ath": max(c_adj),
        "sma20": sma20,
        "sma50": sma50,
        "sma100": sma100,
        "sma200": sma200,
        "sma200_21d_ago": sma200_21,
        "days_above_ma50_20d": sum(1 for c in c_adj[-20:] if c > sma50),
        "r2_63d": 0.0,
        "change_pct": -1.0,
        "is_recently_listed": False,
        "trading_days": len(c_adj),
        "rsi14": 37.0,
        "adx14": 30.0,
        "turnover_cr": 20.0,
        "passes_liquidity": True,
        "is_volume_confirmed": True,
        "roc21": -10.0,
        "roc63": -12.0,
        "roc126": -12.0,
    }
    assert screener_engine.check_top10_step1(item, require_vol_confirm=False) is False

    # 2. Synthetic 1:5 forward split (3143 -> 652) along an uptrend
    n_pre2 = 60
    n_post2 = 10
    dates2 = [f"2026-02-{i+1:02d}" for i in range(n_pre2 + n_post2)]
    closes2 = [2500.0 + i * 10.0 for i in range(n_pre2)] + [652.0 + i * 8.0 for i in range(n_post2)]
    opens2 = list(closes2)
    highs2 = [c * 1.01 for c in closes2]
    lows2 = [c * 0.99 for c in closes2]
    vols2 = [100_000.0] * n_pre2 + [500_000.0] * n_post2

    _, _, _, _, c2_adj, _, factor2, _ = sanitize_and_adjust_candles(
        dates2, opens2, highs2, lows2, closes2, vols2
    )
    assert factor2 < 0.25
    ma20_2 = sum(c2_adj[-20:]) / 20.0
    ma50_2 = sum(c2_adj[-50:]) / 50.0
    assert c2_adj[-1] > ma20_2 > ma50_2


def test_check_top10_step1_rejects_recent_listing_below_formed_sma200():
    base_item = {
        "current_price": 150.0,
        "high_52w": 160.0,
        "high_ath": 160.0,
        "sma20": 145.0,
        "sma50": 140.0,
        "sma100": 135.0,
        "sma200": 155.0,  # Price and shorter MAs below formed SMA200
        "sma200_21d_ago": 150.0,
        "days_above_ma50_20d": 18,
        "r2_63d": 0.80,
        "change_pct": 1.0,
        "is_recently_listed": True,
        "trading_days": 250,
        "rsi14": 64.0,
        "adx14": 30.0,
        "turnover_cr": 25.0,
        "passes_liquidity": True,
        "is_volume_confirmed": True,
        "roc21": 10.0,
        "roc63": 20.0,
        "roc126": 30.0,
    }
    assert screener_engine.check_top10_step1(base_item, require_vol_confirm=False) is False

    # Also reject if SMA200 is falling when 221+ bars exist for a recent listing
    falling_200 = dict(base_item, current_price=165.0, high_52w=166.0, high_ath=166.0, sma200=130.0, sma200_21d_ago=132.0)
    assert screener_engine.check_top10_step1(falling_200, require_vol_confirm=False) is False
