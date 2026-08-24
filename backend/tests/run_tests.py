# -*- coding: utf-8 -*-
import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from backend.app.screener_engine import ScreenerEngine
from backend.app.universe_store import universe_store

def create_synthetic_stock(
    total_bars=600,
    current_price=100.0,
    high_52w_val=100.0,
    high_ath_val=100.0,
    vol_multiple=1.5,
    sma200_slope_pct=5.0,
    active_days_count=20
):
    dates = [(datetime(2023, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(total_bars)]
    
    # Generate prices with specified current price
    prices = np.linspace(current_price * 0.7, current_price, total_bars)
    prices[-1] = current_price

    # Highs / Lows
    highs = list(prices * 1.01)
    lows = list(prices * 0.99)
    
    # Inject 52W High and ATH
    if high_ath_val > high_52w_val:
        highs[50] = high_ath_val  # ATH occurred 550 bars ago
    highs[-10] = high_52w_val     # 52W high occurred 10 bars ago
    highs[-1] = max(highs[-1], current_price)

    # Volume
    base_vol = 50000
    volumes = [base_vol] * total_bars
    volumes[-1] = int(base_vol * vol_multiple)

    # Thin trading simulation
    if active_days_count < 20:
        for idx in range(total_bars - 20, total_bars - active_days_count):
            volumes[idx] = 0

    df = pd.DataFrame({
        "date": dates,
        "open": prices * 0.995,
        "high": highs,
        "low": lows,
        "close": prices,
        "volume": volumes
    })
    return df

def test_suite():
    t0 = time.time()
    print("=== STARTING 52W HIGH / ATH SCREENER TEST SUITE ===")
    engine = ScreenerEngine(
        ath_min_trading_days=500,
        min_active_days_20d=18,
        min_daily_turnover_lakhs=25.0,
        min_sma200_slope_60d_pct=2.0,
        min_vol_multiple_confirmed=1.4
    )
    passed = 0
    total = 0

    # Test 1: Universe Store
    total += 1
    u_count = universe_store.total_count()
    assert u_count > 0, "Universe store should have stocks"
    print(f"[+] Test 1: UniverseStore loaded {u_count} NSE stocks.")
    passed += 1

    # Test 2: Categorization — Near All-Time High (ATH)
    total += 1
    # Stock trading at 98, with ATH = 100 and 52W High = 100, history = 600 days
    df_ath = create_synthetic_stock(total_bars=600, current_price=98.0, high_52w_val=100.0, high_ath_val=100.0)
    df_calc = engine.compute_indicators(df_ath)
    res_ath = engine.analyze_stock(df_calc, rs_sm=85, rs_n50=80)
    assert res_ath.status == "NEAR_ATH", f"Expected NEAR_ATH, got {res_ath.status}"
    assert res_ath.is_recently_listed is False
    print(f"[+] Test 2: Near All-Time High (ATH) categorization passed ({res_ath.status_label}, dist to ATH: {res_ath.dist_to_ath_pct}%).")
    passed += 1

    # Test 3: Categorization — At 52-Week High (Not ATH)
    total += 1
    # Stock at 100, 52W High = 100, but historical ATH = 150 (distinctly below ATH: 100 < 150*0.95 = 142.5)
    df_52w_breakout = create_synthetic_stock(total_bars=600, current_price=100.0, high_52w_val=100.0, high_ath_val=150.0)
    df_calc_52w = engine.compute_indicators(df_52w_breakout)
    res_52w = engine.analyze_stock(df_calc_52w, rs_sm=82, rs_n50=78)
    assert res_52w.status == "AT_52W_HIGH", f"Expected AT_52W_HIGH, got {res_52w.status}"
    print(f"[+] Test 3: At 52-Week High (Not ATH) categorization passed ({res_52w.status_label}, 52W High: {res_52w.high_52w}, ATH: {res_52w.high_ath}).")
    passed += 1

    # Test 4: Categorization — Near 52-Week High (-10%)
    total += 1
    # Stock at 94, 52W High = 100, ATH = 150 (Price is 6% below 52W high: 90 <= 94 < 99.5)
    df_near_52w = create_synthetic_stock(total_bars=600, current_price=94.0, high_52w_val=100.0, high_ath_val=150.0)
    df_calc_near = engine.compute_indicators(df_near_52w)
    res_near = engine.analyze_stock(df_calc_near, rs_sm=75, rs_n50=70)
    assert res_near.status == "NEAR_52W_HIGH", f"Expected NEAR_52W_HIGH, got {res_near.status}"
    print(f"[+] Test 4: Near 52-Week High (-10%) categorization passed ({res_near.status_label}, dist to 52W: {res_near.dist_to_52w_high_pct}%).")
    passed += 1

    # Test 5: Recent Listing Isolation (< 500 trading days)
    total += 1
    # Stock with 250 bars (1 year) trading at 100
    df_recent = create_synthetic_stock(total_bars=250, current_price=100.0, high_52w_val=100.0, high_ath_val=100.0)
    df_calc_recent = engine.compute_indicators(df_recent)
    res_recent = engine.analyze_stock(df_calc_recent, rs_sm=90, rs_n50=85)
    assert res_recent.status == "RECENT_LISTING", f"Expected RECENT_LISTING, got {res_recent.status}"
    assert res_recent.is_recently_listed is True
    print(f"[+] Test 5: Recent Listing Isolation (<500d) passed ({res_recent.status_label}, bars: {res_recent.trading_days}).")
    passed += 1

    # Test 6: Volume Confirmation (🔥 vs ⚠️)
    total += 1
    # High volume 2.2x
    df_high_vol = create_synthetic_stock(total_bars=600, current_price=100.0, vol_multiple=2.2)
    res_high_vol = engine.analyze_stock(engine.compute_indicators(df_high_vol), 80, 80)
    assert res_high_vol.is_volume_confirmed is True
    assert res_high_vol.volume_multiple >= 2.0

    # Low volume 0.7x
    df_low_vol = create_synthetic_stock(total_bars=600, current_price=100.0, vol_multiple=0.7)
    res_low_vol = engine.analyze_stock(engine.compute_indicators(df_low_vol), 80, 80)
    assert res_low_vol.is_volume_confirmed is False
    print(f"[+] Test 6: Volume Confirmation passed (High Vol = {res_high_vol.volume_multiple}x [🔥], Low Vol = {res_low_vol.volume_multiple}x [⚠️]).")
    passed += 1

    # Test 7: Thin Trading Consistency Check (< 18 active days rejected)
    total += 1
    df_thin = create_synthetic_stock(total_bars=600, active_days_count=12) # only 12 active days
    res_thin = engine.analyze_stock(engine.compute_indicators(df_thin), 80, 80)
    assert res_thin.passes_liquidity is False
    assert res_thin.active_days_20d == 12
    print(f"[+] Test 7: Thin Trading consistency check passed (Rejected illiquid stock with only {res_thin.active_days_20d}/20 active days).")
    passed += 1

    # Test 8: Relative Strength Ranking (Small/Midcap primary + Nifty 50 secondary)
    total += 1
    df_lead = create_synthetic_stock(total_bars=260, current_price=200.0)
    df_lag = create_synthetic_stock(total_bars=260, current_price=50.0)
    rs_map = engine.compute_rs_ratings({"LEAD": df_lead, "LAG": df_lag})
    assert rs_map["LEAD"][0] >= 70
    assert rs_map["LAG"][0] <= 35
    print(f"[+] Test 8: Small/Midcap RS Ranking passed (Leader RS = {rs_map['LEAD'][0]}, Laggard RS = {rs_map['LAG'][0]}).")
    passed += 1

    elapsed = round(time.time() - t0, 3)
    print(f"\n==========================================")
    print(f"ALL {passed}/{total} TESTS PASSED in {elapsed}s! 🚀")
    print(f"==========================================")

if __name__ == "__main__":
    test_suite()
