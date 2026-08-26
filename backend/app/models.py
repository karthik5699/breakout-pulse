# -*- coding: utf-8 -*-
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class StockMeta(BaseModel):
    symbol: str
    name: str
    series: Optional[str] = "EQ"
    industry: Optional[str] = ""
    market_cap: Optional[str] = ""

class Candle(BaseModel):
    time: str          # YYYY-MM-DD
    open: float
    high: float
    low: float
    close: float
    volume: float

class HighLowAnalysis(BaseModel):
    current_price: float
    change_pct: float
    high_52w: float
    low_52w: float
    high_ath: float
    dist_to_52w_high_pct: float     # (current - high_52w) / high_52w * 100
    dist_to_ath_pct: float          # (current - high_ath) / high_ath * 100
    status: str                     # "NEAR_52W_HIGH", "AT_52W_HIGH", "NEAR_ATH", "RECENT_LISTING", "NOT_IN_SETUP"
    status_label: str
    trading_days: int
    is_recently_listed: bool
    # Trend & Momentum
    passes_trend_check: bool
    trend_reasons: List[str] = []
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    sma200_slope_60d_pct: Optional[float] = None # % rise in 200 SMA over 60 trading days
    # Liquidity & Consistency
    active_days_20d: int            # count of non-zero trading days in last 20 days (require >= 18)
    turnover_cr: float              # 20-day avg daily turnover in Crores (Price * Vol)
    passes_liquidity: bool
    # Volume Confirmation
    vol_sma50: float
    volume_multiple: float          # today_volume / vol_sma50
    is_volume_confirmed: bool       # volume_multiple >= 1.4x
    # Relative Strength
    rs_rating_smallmid: int         # 1-99 percentile rank vs small/midcap universe
    rs_rating_nifty50: int          # 1-99 percentile rank vs Nifty 50

class StockScreenerItem(BaseModel):
    symbol: str
    name: str
    current_price: float
    change_pct: float
    volume: float
    vol_multiple: float
    is_volume_confirmed: bool       # True = 🔥, False = ⚠️
    status: str                     # NEAR_52W_HIGH, AT_52W_HIGH, NEAR_ATH, RECENT_LISTING, OTHER
    status_label: str
    high_52w: float
    low_52w: float
    high_ath: float
    dist_to_52w_high_pct: float
    dist_to_ath_pct: float
    rs_rating_smallmid: int
    rs_rating_nifty50: int
    turnover_cr: float
    active_days_20d: int
    trading_days: int
    is_recently_listed: bool
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    sma200_slope_60d_pct: Optional[float] = None
    passes_trend_check: bool
    passes_liquidity: bool

class ChartPayload(BaseModel):
    symbol: str
    name: str
    candles: List[Candle]
    high_52w: float
    low_52w: float
    high_ath: float
    dist_to_52w_high_pct: float
    dist_to_ath_pct: float
    status: str
    status_label: str
    volume_multiple: float
    is_volume_confirmed: bool
    rs_rating_smallmid: int
    rs_rating_nifty50: int
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    sma200_slope_60d_pct: Optional[float] = None
    turnover_cr: float

class UniverseStats(BaseModel):
    total_stocks: int
    cached_stocks: int
    near_52w_count: int
    at_52w_count: int
    near_ath_count: int
    recent_listing_count: int
    confirmed_volume_count: int
    last_scanned: Optional[str] = None
    latest_data_date: Optional[str] = None
    smallmid_trend: str
    nifty50_trend: str
