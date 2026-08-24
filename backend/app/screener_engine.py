# -*- coding: utf-8 -*-
import math
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd
from backend.app.models import (
    Candle, HighLowAnalysis, StockScreenerItem
)

class ScreenerEngine:
    def __init__(
        self,
        ath_min_trading_days: int = 500,       # Tunable ATH history cutoff (~2 years)
        min_active_days_20d: int = 18,         # Thin trading check: >=18 of last 20 days non-zero volume
        min_daily_turnover_lakhs: float = 25.0,# Liquidity floor: >= ₹25 Lakhs/day avg turnover
        min_sma200_slope_60d_pct: float = 2.0, # Momentum check: 200 SMA must have risen >= 2% over 60 trading days
        min_vol_multiple_confirmed: float = 1.4# Volume confirmation threshold (>= 1.4x 50-day avg volume)
    ):
        self.ath_min_trading_days = ath_min_trading_days
        self.min_active_days_20d = min_active_days_20d
        self.min_daily_turnover_lakhs = min_daily_turnover_lakhs
        self.min_sma200_slope_60d_pct = min_sma200_slope_60d_pct
        self.min_vol_multiple_confirmed = min_vol_multiple_confirmed

    def compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Computes 50 SMA, 200 SMA, 52W High/Low, ATH, Volume MA, and daily turnover."""
        df = df.copy().reset_index(drop=True)
        df["date_str"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

        c = df["close"]
        h = df["high"]
        l = df["low"]
        v = df["volume"]

        # Moving Averages
        df["sma50"] = c.rolling(window=50, min_periods=15).mean()
        df["sma200"] = c.rolling(window=200, min_periods=40).mean()
        df["vol_sma50"] = v.rolling(window=50, min_periods=10).mean().fillna(v)
        df["vol_sma20"] = v.rolling(window=20, min_periods=5).mean().fillna(v)

        # 52-Week (252 trading days) High & Low
        df["high_52w"] = h.rolling(window=252, min_periods=20).max()
        df["low_52w"] = l.rolling(window=252, min_periods=20).min()

        # All-Time High (Expanding max across full history)
        df["high_ath"] = h.expanding(min_periods=1).max()

        # Daily Turnover in Rupees = Close * Volume
        df["turnover"] = c * v
        df["turnover_sma20"] = df["turnover"].rolling(window=20, min_periods=5).mean().fillna(df["turnover"])

        return df

    def compute_rs_ratings(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        smallmid_bench_df: Optional[pd.DataFrame] = None,
        nifty50_bench_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Tuple[int, int]]:
        """
        Computes Relative Strength vs Small/Midcap benchmark (Primary)
        and vs Nifty 50 (Secondary context), percentile-ranked 1-99:
        RS Score = 0.6 * (R_stock,3M - R_bench,3M) + 0.4 * (R_stock,6M - R_bench,6M)
        """
        def get_bench_returns(bench_df):
            if bench_df is not None and len(bench_df) >= 30:
                bc = bench_df["close"].values
                nb = len(bc)
                ret_3m = (bc[-1] - bc[max(0, nb - 63)]) / bc[max(0, nb - 63)] if nb > 63 else 0.0
                ret_6m = (bc[-1] - bc[max(0, nb - 126)]) / bc[max(0, nb - 126)] if nb > 126 else 0.0
                return ret_3m, ret_6m
            return 0.0, 0.0

        sm_ret_3m, sm_ret_6m = get_bench_returns(smallmid_bench_df)
        n50_ret_3m, n50_ret_6m = get_bench_returns(nifty50_bench_df)

        scores_sm = {}
        scores_n50 = {}

        for sym, df in stock_dfs.items():
            if df is None or len(df) < 20:
                scores_sm[sym] = -999.0
                scores_n50[sym] = -999.0
                continue

            c = df["close"].values
            n = len(c)
            stk_3m = (c[-1] - c[max(0, n - 63)]) / c[max(0, n - 63)] if n >= 63 else (c[-1] - c[0]) / c[0]
            stk_6m = (c[-1] - c[max(0, n - 126)]) / c[max(0, n - 126)] if n >= 126 else stk_3m

            score_sm = 0.60 * (stk_3m - sm_ret_3m) + 0.40 * (stk_6m - sm_ret_6m)
            score_n50 = 0.60 * (stk_3m - n50_ret_3m) + 0.40 * (stk_6m - n50_ret_6m)

            scores_sm[sym] = score_sm
            scores_n50[sym] = score_n50

        def calc_percentiles(raw_map):
            valid = [v for v in raw_map.values() if v > -900]
            if not valid:
                return {k: 50 for k in raw_map}
            s = pd.Series(valid)
            res = {}
            for k, val in raw_map.items():
                if val <= -900:
                    res[k] = 1
                else:
                    pct = int(math.ceil((s < val).mean() * 99))
                    res[k] = max(1, min(99, pct))
            return res

        pct_sm = calc_percentiles(scores_sm)
        pct_n50 = calc_percentiles(scores_n50)

        ratings = {}
        for sym in stock_dfs:
            ratings[sym] = (pct_sm.get(sym, 50), pct_n50.get(sym, 50))
        return ratings

    def analyze_stock(
        self,
        df: pd.DataFrame,
        rs_sm: int,
        rs_n50: int
    ) -> HighLowAnalysis:
        """
        Executes:
        1. Thin Trading & Liquidity Check (>=18/20 active days, >= ₹25 Lakhs turnover)
        2. Trend & 200 SMA 60-day Momentum Slope Check (Price > 50 SMA > 200 SMA, 200 SMA rising >= 2%)
        3. History check (>= 500 trading days for ATH eligibility)
        4. Volume Confirmation (Volume Multiple >= 1.4x 50-day average)
        5. Exact Non-Overlapping Categorization:
           - Near 52W High (-10%): price >= 52W_High * 0.90 AND price < 52W_High * 0.995
           - At 52W High (Not ATH): price >= 52W_High * 0.995 AND 52W_High < ATH * 0.95
           - Near ATH (±5%): price >= ATH * 0.95 AND price <= ATH * 1.05 (requires trading_days >= ath_min_trading_days)
           - Recent Listing (< 2Y): trading_days < ath_min_trading_days AND price >= 52W_High * 0.90
        """
        total_bars = len(df)
        row = df.iloc[-1]
        c = float(row["close"])
        prev_c = float(df.iloc[-2]["close"]) if total_bars > 1 else c
        change_pct = round(((c - prev_c) / prev_c) * 100.0, 2)

        vol = float(row["volume"])
        vol_sma50 = float(row.get("vol_sma50", vol)) if not pd.isna(row.get("vol_sma50")) else vol
        vol_multiple = round(vol / vol_sma50, 2) if vol_sma50 > 0 else 1.0
        is_vol_confirmed = bool(vol_multiple >= self.min_vol_multiple_confirmed)

        high_52w = float(row.get("high_52w", c))
        low_52w = float(row.get("low_52w", c))
        high_ath = float(row.get("high_ath", c))

        dist_52w = round(((c - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
        dist_ath = round(((c - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

        is_recent_listing = (total_bars < self.ath_min_trading_days)

        # 1. Thin Trading & Liquidity Filter
        last_20 = df.iloc[-min(20, total_bars):]
        active_days = int((last_20["volume"] > 0).sum())
        avg_turnover_rs = float(last_20["turnover"].mean()) if not last_20.empty else 0.0
        turnover_cr = round(avg_turnover_rs / 10000000.0, 2) # in Crores
        turnover_lakhs = avg_turnover_rs / 100000.0

        passes_liquidity = (active_days >= min(self.min_active_days_20d, len(last_20))) and (turnover_lakhs >= self.min_daily_turnover_lakhs)

        # 2. Trend & 200 SMA Momentum Slope Check
        sma50 = float(row["sma50"]) if not pd.isna(row.get("sma50")) else None
        sma200 = float(row["sma200"]) if not pd.isna(row.get("sma200")) else None

        sma200_slope_60d_pct = None
        trend_reasons = []

        if sma50 is not None and sma200 is not None:
            if c < sma50:
                trend_reasons.append(f"Price (₹{c:.2f}) < 50 SMA (₹{sma50:.2f})")
            if c < sma200:
                trend_reasons.append(f"Price (₹{c:.2f}) < 200 SMA (₹{sma200:.2f})")
            if sma50 < sma200:
                trend_reasons.append(f"50 SMA (₹{sma50:.2f}) < 200 SMA (₹{sma200:.2f})")

            # 200 SMA Slope over 60 trading days (~3 months)
            idx_60 = max(0, total_bars - 61)
            sma200_60d_ago = df.iloc[idx_60].get("sma200")
            if not pd.isna(sma200_60d_ago) and float(sma200_60d_ago) > 0:
                slope_pct = ((sma200 - float(sma200_60d_ago)) / float(sma200_60d_ago)) * 100.0
                sma200_slope_60d_pct = round(slope_pct, 2)
                if slope_pct < self.min_sma200_slope_60d_pct:
                    trend_reasons.append(f"200 SMA 60d slope (+{slope_pct:.1f}%) < required +{self.min_sma200_slope_60d_pct}%")
            else:
                trend_reasons.append("Insufficient history for 60d 200 SMA slope")
        else:
            trend_reasons.append("50/200 SMA not fully formed")

        passes_trend = (len(trend_reasons) == 0)

        # 3. Mathematical Categorization Logic
        # Rules:
        # Near 52W High: current_price >= (high_52w * 0.90) and current_price < (high_52w * 0.995)
        # At 52W High (Not ATH): current_price >= (high_52w * 0.995) and high_52w < (high_ath * 0.95)
        # Near / At ATH: current_price >= (high_ath * 0.95) and current_price <= (high_ath * 1.05) [requires history >= 500 days]
        # Recent Listing (<2Y): total_bars < 500 days and current_price >= (high_52w * 0.90)

        status = "OTHER"
        status_label = "Other / Consolidating"

        if is_recent_listing and c >= (high_52w * 0.90):
            status = "RECENT_LISTING"
            status_label = "Recent Listing (<2Y)"
        elif not is_recent_listing and c >= (high_ath * 0.95) and c <= (high_ath * 1.05):
            status = "NEAR_ATH"
            status_label = "All-Time High (ATH)"
        elif c >= (high_52w * 0.995) and high_52w < (high_ath * 0.95):
            status = "AT_52W_HIGH"
            status_label = "52-Week High Breakout"
        elif c >= (high_52w * 0.90) and c < (high_52w * 0.995):
            status = "NEAR_52W_HIGH"
            status_label = "Near 52-Week High (-10%)"

        return HighLowAnalysis(
            current_price=round(c, 2),
            change_pct=change_pct,
            high_52w=round(high_52w, 2),
            low_52w=round(low_52w, 2),
            high_ath=round(high_ath, 2),
            dist_to_52w_high_pct=dist_52w,
            dist_to_ath_pct=dist_ath,
            status=status,
            status_label=status_label,
            trading_days=total_bars,
            is_recently_listed=is_recent_listing,
            passes_trend_check=passes_trend,
            trend_reasons=trend_reasons,
            sma50=round(sma50, 2) if sma50 else None,
            sma200=round(sma200, 2) if sma200 else None,
            sma200_slope_60d_pct=sma200_slope_60d_pct,
            active_days_20d=active_days,
            turnover_cr=turnover_cr,
            passes_liquidity=passes_liquidity,
            vol_sma50=round(vol_sma50, 0),
            volume_multiple=vol_multiple,
            is_volume_confirmed=is_vol_confirmed,
            rs_rating_smallmid=rs_sm,
            rs_rating_nifty50=rs_n50
        )

    def run_screener(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        stock_names: Dict[str, str],
        smallmid_bench_df: Optional[pd.DataFrame] = None,
        nifty50_bench_df: Optional[pd.DataFrame] = None
    ) -> List[StockScreenerItem]:
        """Runs the screener across the entire stock universe."""
        computed_dfs = {}
        for sym, df in stock_dfs.items():
            if df is not None and len(df) >= 20:
                computed_dfs[sym] = self.compute_indicators(df)

        rs_ratings = self.compute_rs_ratings(computed_dfs, smallmid_bench_df, nifty50_bench_df)

        items: List[StockScreenerItem] = []
        for sym, df in computed_dfs.items():
            name = stock_names.get(sym, sym)
            rs_sm, rs_n50 = rs_ratings.get(sym, (50, 50))
            analysis = self.analyze_stock(df, rs_sm, rs_n50)

            item = StockScreenerItem(
                symbol=sym,
                name=name,
                current_price=analysis.current_price,
                change_pct=analysis.change_pct,
                volume=float(df["volume"].iloc[-1]),
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
                sma50=analysis.sma50,
                sma200=analysis.sma200,
                sma200_slope_60d_pct=analysis.sma200_slope_60d_pct,
                passes_trend_check=analysis.passes_trend_check,
                passes_liquidity=analysis.passes_liquidity
            )
            items.append(item)

        # Prioritize: Status priority -> Volume Confirmed (🔥 first) -> RS Rating (Small/Midcap)
        status_priority = {
            "NEAR_ATH": 1,
            "AT_52W_HIGH": 2,
            "NEAR_52W_HIGH": 3,
            "RECENT_LISTING": 4,
            "OTHER": 5
        }
        items.sort(
            key=lambda x: (
                status_priority.get(x.status, 99),
                0 if x.is_volume_confirmed else 1,
                -x.rs_rating_smallmid,
                abs(x.dist_to_52w_high_pct)
            )
        )
        return items

screener_engine = ScreenerEngine()
