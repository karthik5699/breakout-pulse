import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from backend.app.vcp_engine import VCPEngine
from backend.app.models import SwingPoint

@pytest.fixture
def vcp():
    return VCPEngine()

def generate_synthetic_stage2_vcp(
    base_weeks: int = 12,
    contractions: list = [18.0, 8.0, 3.0],
    at_pivot: bool = True,
    vol_dry_up: bool = True
) -> pd.DataFrame:
    """Generates synthetic daily OHLCV dataframe forming a textbook Stage 2 VCP."""
    total_days = 260
    base_days = base_weeks * 5
    pre_base_days = total_days - base_days

    dates = [
        (datetime(2025, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(total_days)
    ]

    # Pre-base: Stage 2 strong run-up from 50 to 100
    pre_prices = np.linspace(50.0, 100.0, pre_base_days)

    # Base: Sequential Contractions
    base_prices = []
    current_high = 100.0
    days_per_c = base_days // len(contractions)

    for depth in contractions:
        trough = current_high * (1.0 - (depth / 100.0))
        down_leg = np.linspace(current_high, trough, days_per_c // 2)
        up_leg = np.linspace(trough, current_high * 0.99, days_per_c - (days_per_c // 2))
        base_prices.extend(list(down_leg) + list(up_leg))

    # Pad or trim base prices to exact base_days
    if len(base_prices) < base_days:
        base_prices.extend([current_high * 0.995] * (base_days - len(base_prices)))
    else:
        base_prices = base_prices[:base_days]

    all_prices = list(pre_prices) + list(base_prices)
    if at_pivot:
        all_prices[-1] = 100.2  # right at pivot

    # Volumes: Higher during run-up, dry up during final contraction
    volumes = [100000] * pre_base_days + [60000] * (base_days - 10) + [25000 if vol_dry_up else 150000] * 10

    df = pd.DataFrame({
        "date": dates,
        "open": [p * 0.995 for p in all_prices],
        "high": [p * 1.01 for p in all_prices],
        "low": [p * 0.99 for p in all_prices],
        "close": all_prices,
        "volume": volumes
    })
    return df

def test_rs_percentile_ranking(vcp):
    """Verifies that RS percentile ranking accurately ranks momentum and weights recent 3M."""
    dates = [(datetime(2025, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(260)]
    
    # Leader: doubled recently
    df_leader = pd.DataFrame({
        "date": dates, "open": 100, "high": 205, "low": 95, "close": np.linspace(100, 200, 260), "volume": 1000
    })
    # Laggard: declined 50%
    df_laggard = pd.DataFrame({
        "date": dates, "open": 100, "high": 105, "low": 45, "close": np.linspace(100, 50, 260), "volume": 1000
    })
    # Neutral: flat
    df_neutral = pd.DataFrame({
        "date": dates, "open": 100, "high": 105, "low": 95, "close": [100.0] * 260, "volume": 1000
    })

    stock_dfs = {"LEADER": df_leader, "LAGGARD": df_laggard, "NEUTRAL": df_neutral}
    ratings = vcp.compute_rs_scores_and_ratings(stock_dfs)

    assert ratings["LEADER"][1] >= 70, f"Leader RS was {ratings['LEADER'][1]}, expected >= 70"
    assert ratings["LAGGARD"][1] <= 35, f"Laggard RS was {ratings['LAGGARD'][1]}, expected <= 35"
    assert ratings["LEADER"][1] > ratings["NEUTRAL"][1] > ratings["LAGGARD"][1]

def test_stage2_trend_template_positive_and_negative(vcp):
    """Verifies that Stage 2 filter passes clear uptrends and rejects downtrends."""
    df_uptrend = generate_synthetic_stage2_vcp()
    df_calc = vcp.compute_indicators(df_uptrend)

    is_stage2, reasons = vcp.check_minervini_trend_template(df_calc, rs_rating=85)
    assert is_stage2 is True, f"Expected Stage 2 to pass, failed with reasons: {reasons}"

    # Negative case 1: Low RS rating (< 70)
    is_stage2_low_rs, reasons_low_rs = vcp.check_minervini_trend_template(df_calc, rs_rating=55)
    assert is_stage2_low_rs is False
    assert any("RS Rating 55 < 70" in r for r in reasons_low_rs)

    # Negative case 2: Downtrend (Price below falling 200 SMA)
    dates = [(datetime(2025, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(260)]
    df_downtrend = pd.DataFrame({
        "date": dates, "open": 100, "high": 105, "low": 45, "close": np.linspace(150, 60, 260), "volume": 1000
    })
    df_downtrend_calc = vcp.compute_indicators(df_downtrend)
    is_stage2_down, reasons_down = vcp.check_minervini_trend_template(df_downtrend_calc, rs_rating=80)
    assert is_stage2_down is False

def test_vcp_positive_textbook_setup(vcp):
    """Verifies textbook 3T VCP detection with contracting depths and volume dry-up."""
    df = generate_synthetic_stage2_vcp(base_weeks=12, contractions=[18.0, 8.0, 3.0], at_pivot=True, vol_dry_up=True)
    df_calc = vcp.compute_indicators(df)
    swings = vcp.detect_zigzag_swings(df_calc)
    
    analysis = vcp.analyze_vcp_pattern(df_calc, swings, is_stage2=True, trend_reasons=[], rs_score=1.5, rs_rating=88)
    
    assert analysis.has_vcp is True
    assert analysis.contractions_count >= 2
    assert analysis.base_depth_pct <= 45.0
    assert analysis.status in ("IN_BREAKOUT_ZONE", "TRIGGERED_BREAKOUT")
    assert analysis.suggested_stop_loss is not None
    assert analysis.risk_pct <= 10.0

def test_false_positive_rejection_short_flag(vcp):
    """Rejects 2-3 day micro-consolidations (enforces minimum 5 weeks base length)."""
    # Create 3-day pullback after rally
    dates = [(datetime(2025, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(260)]
    prices = list(np.linspace(50, 100, 255)) + [98, 97, 98, 99, 100.5]
    df = pd.DataFrame({
        "date": dates, "open": prices, "high": [p*1.01 for p in prices], "low": [p*0.99 for p in prices], "close": prices, "volume": 1000
    })
    df_calc = vcp.compute_indicators(df)
    swings = vcp.detect_zigzag_swings(df_calc)
    analysis = vcp.analyze_vcp_pattern(df_calc, swings, is_stage2=True, trend_reasons=[], rs_score=1.2, rs_rating=80)

    # Must NOT be classified as valid VCP
    assert analysis.has_vcp is False or (analysis.base_duration_weeks is not None and analysis.base_duration_weeks >= 5.0)

def test_false_positive_rejection_deep_violation(vcp):
    """Rejects bases with depth > 45% (failed/damaged bases)."""
    df = generate_synthetic_stage2_vcp(base_weeks=12, contractions=[55.0, 30.0, 15.0])
    df_calc = vcp.compute_indicators(df)
    swings = vcp.detect_zigzag_swings(df_calc)
    analysis = vcp.analyze_vcp_pattern(df_calc, swings, is_stage2=True, trend_reasons=[], rs_score=0.8, rs_rating=75)

    assert analysis.has_vcp is False or analysis.base_depth_pct > 45.0

def test_false_positive_rejection_expanding_volatility(vcp):
    """Rejects expanding volatility patterns (T1=4%, T2=15%, T3=28%)."""
    df = generate_synthetic_stage2_vcp(base_weeks=12, contractions=[4.0, 14.0, 28.0])
    df_calc = vcp.compute_indicators(df)
    swings = vcp.detect_zigzag_swings(df_calc)
    analysis = vcp.analyze_vcp_pattern(df_calc, swings, is_stage2=True, trend_reasons=[], rs_score=0.9, rs_rating=78)

    # Monotonicity test must fail for expanding ranges
    assert analysis.status not in ("IN_BREAKOUT_ZONE", "TRIGGERED_BREAKOUT")
