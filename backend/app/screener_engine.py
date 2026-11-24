# -*- coding: utf-8 -*-
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd
from backend.app.models import (
    Candle, HighLowAnalysis, StockScreenerItem
)

IST = ZoneInfo("Asia/Kolkata")


class ScreenerEngine:
    def __init__(
        self,
        ath_min_trading_days: int = 500,       # Tunable ATH history cutoff (~2 years)
        min_active_days_20d: int = 15,         # Thin trading check: >=15 of last 20 days non-zero volume
        min_daily_turnover_lakhs: float = 25.0,# Liquidity floor: >= ₹25 Lakhs/day avg turnover
        min_sma200_slope_60d_pct: float = 2.0, # Momentum check: 200 SMA slope reference
        min_vol_multiple_confirmed: float = 1.4# Volume confirmation threshold (>= 1.4x 50-day avg volume)
    ):
        self.ath_min_trading_days = ath_min_trading_days
        self.min_active_days_20d = min_active_days_20d
        self.min_daily_turnover_lakhs = min_daily_turnover_lakhs
        self.min_sma200_slope_60d_pct = min_sma200_slope_60d_pct
        self.min_vol_multiple_confirmed = min_vol_multiple_confirmed

    def compute_indicators(self, df: pd.DataFrame, lifetime_ath: Optional[float] = None) -> pd.DataFrame:
        """Computes 50 SMA, 200 SMA, 52W High/Low, ATH, Volume MA, and daily turnover."""
        df = df.copy().reset_index(drop=True)
        df["date_str"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

        c = df["close"]
        h = df["high"]
        l = df["low"]
        v = df["volume"]

        # Moving Averages (require full window so short-history stocks don't get fake MAs)
        df["sma20"] = c.rolling(window=20, min_periods=20).mean()
        df["sma50"] = c.rolling(window=50, min_periods=50).mean()
        df["sma100"] = c.rolling(window=100, min_periods=100).mean()
        df["sma200"] = c.rolling(window=200, min_periods=200).mean()
        df["vol_sma50"] = v.rolling(window=50, min_periods=1).mean().fillna(v)
        df["vol_sma20"] = v.rolling(window=20, min_periods=1).mean().fillna(v)

        # 52-Week (252 trading days) High & Low
        df["high_52w"] = h.rolling(window=252, min_periods=1).max().fillna(h)
        df["low_52w"] = l.rolling(window=252, min_periods=1).min().fillna(l)

        # All-Time High (Expanding max incorporating verified lifetime ATH if provided)
        expanding_ath = h.expanding(min_periods=1).max().fillna(h)
        if lifetime_ath is not None and float(lifetime_ath) > 0:
            df["high_ath"] = np.maximum(expanding_ath, float(lifetime_ath))
        else:
            df["high_ath"] = expanding_ath

        # Daily Turnover in Rupees = Close * Volume
        df["turnover"] = c * v
        df["turnover_sma20"] = df["turnover"].rolling(window=20, min_periods=1).mean().fillna(df["turnover"])

        return df

    def compute_rs_ratings(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        smallmid_bench_df: Optional[pd.DataFrame] = None,
        nifty50_bench_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Tuple[int, int]]:
        """
        Computes:
        1. rs_rating_smallmid (1-99): Cross-sectional IBD-style percentile rank across the
           universe using weighted 3M/6M/12M returns (0.40 * R_3M + 0.30 * R_6M + 0.30 * R_12M).
        2. rs_rating_nifty50 (1-99): Benchmark-relative outperformance vs Nifty 50 using the
           compounded relative return ratio centered at 50.
        """
        def safe_return(arr: np.ndarray, lookback: int) -> Optional[float]:
            n_arr = len(arr)
            if n_arr < 2:
                return None
            idx0 = max(0, n_arr - 1 - lookback)
            base = float(arr[idx0])
            last = float(arr[-1])
            if base <= 0.0 or not math.isfinite(base) or not math.isfinite(last):
                return None
            return (last - base) / base

        def get_bench_returns(bench_df: Optional[pd.DataFrame]) -> Tuple[float, float]:
            if bench_df is not None and len(bench_df) >= 30:
                bc = np.asarray(bench_df["close"].values, dtype=np.float64)
                nb = len(bc)
                r3 = safe_return(bc, 63) if nb > 63 else safe_return(bc, nb - 1)
                r6 = safe_return(bc, 126) if nb > 126 else r3
                return (r3 if r3 is not None else 0.0), (r6 if r6 is not None else 0.0)
            return 0.0, 0.0

        n50_ret_3m, n50_ret_6m = get_bench_returns(nifty50_bench_df)

        scores_sm: Dict[str, float] = {}
        scores_n50: Dict[str, int] = {}

        for sym, df in stock_dfs.items():
            if df is None or len(df) < 20:
                scores_sm[sym] = -999.0
                scores_n50[sym] = 1
                continue

            c = np.asarray(df["close"].values, dtype=np.float64)
            n = len(c)
            stk_3m = safe_return(c, 63) if n > 63 else safe_return(c, n - 1)
            if stk_3m is None:
                scores_sm[sym] = -999.0
                scores_n50[sym] = 1
                continue

            stk_6m = safe_return(c, 126) if n > 126 else stk_3m
            if stk_6m is None:
                stk_6m = stk_3m

            stk_12m = safe_return(c, 252) if n > 252 else stk_6m
            if stk_12m is None:
                stk_12m = stk_6m

            # 1. Cross-sectional IBD-style weighted return for Small/Midcap percentile RS (1-99)
            scores_sm[sym] = 0.40 * stk_3m + 0.30 * stk_6m + 0.30 * stk_12m

            # 2. True Nifty 50 relative outperformance ratio centered at 50
            denom_3m = 1.0 + n50_ret_3m
            denom_6m = 1.0 + n50_ret_6m
            rel_3m = ((1.0 + stk_3m) / denom_3m - 1.0) if denom_3m > 0.0 else (stk_3m - n50_ret_3m)
            rel_6m = ((1.0 + stk_6m) / denom_6m - 1.0) if denom_6m > 0.0 else (stk_6m - n50_ret_6m)
            rel_score = 0.60 * rel_3m + 0.40 * rel_6m
            n50_rating = int(round(max(1.0, min(99.0, 50.0 + rel_score * 100.0))))
            scores_n50[sym] = n50_rating

        def calc_percentiles(raw_map: Dict[str, float]) -> Dict[str, int]:
            valid = [v for v in raw_map.values() if v > -900.0 and math.isfinite(v)]
            if not valid:
                return {k: 50 for k in raw_map}
            s_sorted = np.sort(valid)
            n_valid = len(s_sorted)
            res: Dict[str, int] = {}
            for k, val in raw_map.items():
                if val <= -900.0 or not math.isfinite(val):
                    res[k] = 1
                elif n_valid == 1:
                    res[k] = 50
                else:
                    left = np.searchsorted(s_sorted, val, side="left")
                    right = np.searchsorted(s_sorted, val, side="right")
                    avg_pos = (left + right - 1) / 2.0
                    pct = int(round(1.0 + (avg_pos / (n_valid - 1)) * 98.0))
                    res[k] = max(1, min(99, pct))
            return res

        pct_sm = calc_percentiles(scores_sm)

        ratings: Dict[str, Tuple[int, int]] = {}
        for sym in stock_dfs:
            ratings[sym] = (pct_sm.get(sym, 50), scores_n50.get(sym, 50))
        return ratings

    @staticmethod
    def compute_wilder_oscillators(
        highs: Any,
        lows: Any,
        closes: Any,
        period: int = 14
    ) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """
        Computes Wilder's RSI(14), Wilder's ADX(14), and ATR(14)% = (ATR14 / Close * 100)
        using up to the last 260 daily bars.
        """
        n = len(closes)
        if n < period + 1:
            return None, None, None

        # Slice to recent 260 bars for fast Wilder smoothing convergence
        h = np.asarray(highs[-260:], dtype=np.float64)
        l = np.asarray(lows[-260:], dtype=np.float64)
        c = np.asarray(closes[-260:], dtype=np.float64)

        # 1. RSI(14) via Wilder smoothing
        delta = np.diff(c)
        gains = np.where(delta > 0, delta, 0.0)
        losses = np.where(delta < 0, -delta, 0.0)

        avg_gain = float(np.mean(gains[:period]))
        avg_loss = float(np.mean(losses[:period]))
        for i in range(period, len(delta)):
            avg_gain = (avg_gain * (period - 1) + float(gains[i])) / period
            avg_loss = (avg_loss * (period - 1) + float(losses[i])) / period

        if avg_loss == 0.0:
            rsi = 100.0 if avg_gain > 0 else 50.0
        else:
            rs = avg_gain / avg_loss
            rsi = 100.0 - (100.0 / (1.0 + rs))

        # 2. True Range, +DM, -DM for ATR(14) & ADX(14)
        up_move = h[1:] - h[:-1]
        down_move = l[:-1] - l[1:]

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        tr1 = h[1:] - l[1:]
        tr2 = np.abs(h[1:] - c[:-1])
        tr3 = np.abs(l[1:] - c[:-1])
        tr = np.maximum(tr1, np.maximum(tr2, tr3))

        # ATR(14) via Wilder smoothing
        atr = float(np.mean(tr[:period]))
        for i in range(period, len(tr)):
            atr = (atr * (period - 1) + float(tr[i])) / period
        atr_pct = (atr / float(c[-1]) * 100.0) if c[-1] > 0 else 0.0

        # ADX(14)
        if len(tr) < 2 * period:
            return round(rsi, 2), None, round(atr_pct, 4)

        tr_smooth = float(np.sum(tr[:period]))
        plus_dm_smooth = float(np.sum(plus_dm[:period]))
        minus_dm_smooth = float(np.sum(minus_dm[:period]))

        def _calc_di_dx(tr_s: float, p_s: float, m_s: float) -> Tuple[float, float, float]:
            if tr_s > 0.0:
                p_val = 100.0 * (p_s / tr_s)
                m_val = 100.0 * (m_s / tr_s)
            else:
                p_val, m_val = 0.0, 0.0
            denom = p_val + m_val
            dx_val = 100.0 * abs(p_val - m_val) / denom if denom > 0.0 else 0.0
            return p_val, m_val, dx_val

        p_di, m_di, initial_dx = _calc_di_dx(tr_smooth, plus_dm_smooth, minus_dm_smooth)
        dx_list = [initial_dx]
        for i in range(period, len(tr)):
            tr_smooth = tr_smooth - (tr_smooth / period) + float(tr[i])
            plus_dm_smooth = plus_dm_smooth - (plus_dm_smooth / period) + float(plus_dm[i])
            minus_dm_smooth = minus_dm_smooth - (minus_dm_smooth / period) + float(minus_dm[i])

            p_di, m_di, dx = _calc_di_dx(tr_smooth, plus_dm_smooth, minus_dm_smooth)
            dx_list.append(dx)

        if len(dx_list) < period:
            adx = float(np.mean(dx_list)) if dx_list else 0.0
        else:
            adx = float(np.mean(dx_list[:period]))
            for i in range(period, len(dx_list)):
                adx = (adx * (period - 1) + dx_list[i]) / period

        # Ensure directional trend is bullish (+DI > -DI); otherwise ADX reflects bearish trend strength
        if p_di <= m_di:
            adx = 0.0

        return round(rsi, 2), round(adx, 2), round(atr_pct, 4)

    @staticmethod
    def compute_roc_metrics(closes: Any) -> Tuple[float, float, float]:
        """Computes 21-day, 63-day, and 126-day Rate of Change (ROC %)."""
        n = len(closes)
        if n == 0:
            return 0.0, 0.0, 0.0
        c_last = float(closes[-1])
        c_21 = float(closes[max(0, n - 1 - 21)])
        c_63 = float(closes[max(0, n - 1 - 63)])
        c_126 = float(closes[max(0, n - 1 - 126)])
        roc21 = round(((c_last - c_21) / c_21) * 100.0, 2) if c_21 > 0 else 0.0
        roc63 = round(((c_last - c_63) / c_63) * 100.0, 2) if c_63 > 0 else 0.0
        roc126 = round(((c_last - c_126) / c_126) * 100.0, 2) if c_126 > 0 else 0.0
        return roc21, roc63, roc126

    @staticmethod
    def compute_persistence_and_smoothness(
        closes: Any
    ) -> Tuple[Optional[float], int, float]:
        """
        Computes:
        1. sma200_21d_ago (MA200[21], i.e., 200 DMA 21 sessions ago)
        2. days_above_ma50_20d (count of last 20 sessions where Close > MA50)
        3. r2_63d (63-day log-price linear regression R² smoothness in [0, 1])
        """
        n = len(closes)
        if n == 0:
            return None, 0, 0.0

        # 1. MA200[21]: 200-session SMA 21 sessions ago
        if n >= 221:
            sma200_21d_ago = round(float(np.mean(closes[-221:-21])), 2)
        else:
            sma200_21d_ago = None

        # 2. Trend Persistence: Close > MA50 for at least 15 of the last 20 sessions
        c_tail = np.asarray(closes[-70:], dtype=np.float64)
        if len(c_tail) >= 69:
            cs = np.concatenate(([0.0], np.cumsum(c_tail[-69:])))
            ma50_last20 = (cs[50:70] - cs[0:20]) / 50.0
            closes_last20 = c_tail[-20:]
            days_above_ma50_20d = int(np.sum(closes_last20 > ma50_last20))
        elif len(c_tail) >= 50:
            k = min(20, len(c_tail) - 49)
            cs = np.concatenate(([0.0], np.cumsum(c_tail[-(49 + k):])))
            ma50_k = (cs[50:50 + k] - cs[0:k]) / 50.0
            closes_k = c_tail[-k:]
            days_above_ma50_20d = int(np.sum(closes_k > ma50_k))
        else:
            days_above_ma50_20d = 0

        # 3. 63-day log-price linear regression R² (0..1)
        if n >= 63:
            y = np.log(np.maximum(np.asarray(closes[-63:], dtype=np.float64), 1e-9))
            x_c = np.arange(63, dtype=np.float64) - 31.0
            y_c = y - np.mean(y)
            ss_x = 20832.0  # sum((0..62 - 31)^2)
            ss_y = float(np.sum(y_c * y_c))
            cov_xy = float(np.sum(x_c * y_c))
            if cov_xy > 0.0 and ss_y > 0.0:
                r2_63d = round((cov_xy * cov_xy) / (ss_x * ss_y), 4)
            else:
                r2_63d = 0.0
        else:
            r2_63d = 0.0

        return sma200_21d_ago, days_above_ma50_20d, r2_63d

    @staticmethod
    def _get_item_attr(item: Any, key: str, default: Any = None) -> Any:
        if isinstance(item, dict):
            return item.get(key, default)
        return getattr(item, key, default)

    @staticmethod
    def _set_item_attr(item: Any, key: str, value: Any) -> None:
        if isinstance(item, dict):
            item[key] = value
        else:
            setattr(item, key, value)

    @staticmethod
    def is_above_mas(
        price: Optional[float],
        sma50: Optional[float],
        sma200: Optional[float],
        trading_days: Optional[int],
    ) -> bool:
        """A momentum setup must trade at/above its 50 SMA and 200 SMA (if formed for mature stocks)."""
        if price is None or float(price) <= 0.0:
            return False
        p = float(price)
        n_bars = int(trading_days) if trading_days is not None else 500
        if sma50 is not None and p < float(sma50):
            return False
        if sma200 is not None and n_bars >= 200 and p < float(sma200):
            return False
        return True

    def compute_liquidity(self, closes: Any, volumes: Any) -> Tuple[int, float, bool]:
        """
        Computes active trading days, outlier-trimmed 20-day avg turnover (Cr),
        and whether the stock passes the canonical NSE liquidity floor.
        """
        n_bars = len(closes)
        if n_bars == 0:
            return 0, 0.0, False
        n_last = min(20, n_bars)
        last_closes = closes[-n_last:]
        last_vols = volumes[-n_last:]

        active_days = int(sum(1 for v in last_vols if float(v) > 0.0))
        turnovers_20 = [float(c) * float(v) for c, v in zip(last_closes, last_vols)]

        if len(turnovers_20) > 5:
            sorted_t20 = sorted(turnovers_20)
            rest_mean = sum(sorted_t20[:-1]) / (len(sorted_t20) - 1)
            if sorted_t20[-1] > 4.0 * rest_mean:
                turnover_cr = round(rest_mean / 1e7, 2)
            else:
                turnover_cr = round((sum(turnovers_20) / len(turnovers_20)) / 1e7, 2)
        else:
            turnover_cr = round((sum(turnovers_20) / len(turnovers_20)) / 1e7, 2) if turnovers_20 else 0.0

        min_req_days = min(self.min_active_days_20d, n_last)
        min_turnover_cr = self.min_daily_turnover_lakhs / 100.0
        passes_liq = bool(active_days >= min_req_days and turnover_cr >= min_turnover_cr)
        return active_days, turnover_cr, passes_liq

    def compute_volume_confirmation(
        self,
        vol: float,
        vol_sma50: Optional[float],
        passes_liquidity: bool,
    ) -> Tuple[float, bool]:
        """Computes volume multiple vs 50D avg and canonical volume confirmation flag."""
        v_cur = float(vol)
        v_sma = (
            float(vol_sma50)
            if (vol_sma50 is not None and not pd.isna(vol_sma50) and float(vol_sma50) > 0.0)
            else v_cur
        )
        vol_mult = round(v_cur / v_sma, 2) if v_sma > 0.0 else 1.0
        confirmed = bool(
            passes_liquidity
            and vol_mult >= self.min_vol_multiple_confirmed
            and v_cur >= 5000.0
        )
        return vol_mult, confirmed

    def check_stage2_trend(
        self,
        price: Optional[float],
        sma20: Optional[float],
        sma50: Optional[float],
        sma200: Optional[float],
        sma200_21d_ago: Optional[float],
        sma200_slope_60d_pct: Optional[float],
        trading_days: Optional[int],
        passes_liquidity: bool,
        is_recently_listed: bool = False,
    ) -> Tuple[bool, List[str]]:
        """
        Canonical Stage 2 Trend Check:
        - Mature stocks (>=200 bars or not recent listing): Price > 50 SMA > 200 SMA and rising 200 SMA.
        - Young recent listings (<200 bars): Young Stage 2 check (Price > 20 SMA > 50 SMA).
        """
        reasons: List[str] = []
        n_bars = int(trading_days) if trading_days is not None else 500

        if not passes_liquidity:
            reasons.append("Insufficient liquidity or active sessions")
        if price is None or float(price) <= 0.0:
            reasons.append("Invalid price")
            return False, reasons

        p = float(price)
        if is_recently_listed and n_bars < 200:
            if sma20 is None or sma50 is None:
                reasons.append("20/50 SMA not fully formed")
            else:
                s20 = float(sma20)
                s50 = float(sma50)
                if p <= s20:
                    reasons.append(f"Price (₹{p:.2f}) <= 20 SMA (₹{s20:.2f})")
                if s20 <= s50:
                    reasons.append(f"20 SMA (₹{s20:.2f}) <= 50 SMA (₹{s50:.2f})")
        else:
            if n_bars < 200 or sma50 is None or sma200 is None:
                reasons.append("50/200 SMA not fully formed")
            else:
                s50 = float(sma50)
                s200 = float(sma200)
                if p <= s50:
                    reasons.append(f"Price (₹{p:.2f}) <= 50 SMA (₹{s50:.2f})")
                if p <= s200:
                    reasons.append(f"Price (₹{p:.2f}) <= 200 SMA (₹{s200:.2f})")
                if s50 <= s200:
                    reasons.append(f"50 SMA (₹{s50:.2f}) <= 200 SMA (₹{s200:.2f})")
                if sma200_21d_ago is not None:
                    if s200 <= float(sma200_21d_ago):
                        reasons.append(f"200 SMA not rising vs 21d ago (₹{s200:.2f} <= ₹{float(sma200_21d_ago):.2f})")
                elif sma200_slope_60d_pct is None or float(sma200_slope_60d_pct) <= 0.0:
                    reasons.append("200 SMA 60d slope not rising")

        return (len(reasons) == 0), reasons

    def classify_status(
        self,
        dist_52w: float,
        dist_ath: float,
        trading_days: Optional[int],
        is_recent: bool,
        passes_liquidity: bool,
        is_above_mas: bool,
    ) -> Tuple[str, str]:
        """Canonical mutually exclusive breakout category classification."""
        n_bars = int(trading_days) if trading_days is not None else 500
        if not passes_liquidity:
            return "ILLIQUID", "Illiquid / Inactive"
        if not is_above_mas:
            return "CONSOLIDATING", "Consolidating"
        if is_recent and dist_52w >= -10.0:
            return "RECENT_LISTING", "Recent Listing (<2Y)"
        if not is_recent and n_bars >= self.ath_min_trading_days and -10.0 <= dist_ath <= 10.0:
            return "NEAR_ATH", "All-Time High (ATH)"
        if not is_recent and n_bars >= 200 and dist_52w >= -0.5:
            return "AT_52W_HIGH", "52-Week Breakout"
        if not is_recent and n_bars >= 200 and dist_52w >= -10.0:
            return "NEAR_52W_HIGH", "Near 52W High"
        return "CONSOLIDATING", "Consolidating"

    def check_top10_step1(self, item: Any, require_vol_confirm: bool = True) -> bool:
        """
        Step 1: Shortlist Filters (Pass/Fail)
        1. Stacked Trend (Explicit Pairwise):
           Close > MA20, MA20 > MA50, MA50 > MA100, and MA100 > MA200 (ignore MA200 if new listing).
        2. Rising 200 DMA:
           MA200 > MA200[21] (200 DMA must be higher than 21 sessions ago; ignore if new listing).
        3. Trend Persistence:
           Close > MA50 for at least 15 of the last 20 sessions.
        4. Overhead Supply Cap:
           Close >= 0.85 * 52W_High AND Close >= 0.70 * All_Time_High.
        5. Anti-Spike Smoothness:
           1D_Return < 0.40 * ROC21 (or 63-day R² > 0.65).
        6. Trend Strength & RSI Band:
           ADX(14) > 25 (+DI > -DI) and RSI(14) between 55 and 75.
        7. Liquidity & Volume:
           ₹15 Cr liquidity floor (turnover_cr >= 15.0 and passes_liquidity)
           + Daily Volume >= 1.4 * 50D Avg Volume (when require_vol_confirm is True).
        """
        get = self._get_item_attr
        c = get(item, "current_price")
        high_52w = get(item, "high_52w")
        high_ath = get(item, "high_ath")
        sma20 = get(item, "sma20")
        sma50 = get(item, "sma50")
        sma100 = get(item, "sma100")
        sma200 = get(item, "sma200")
        sma200_21d_ago = get(item, "sma200_21d_ago")
        days_above_ma50_20d = get(item, "days_above_ma50_20d")
        r2_63d = float(get(item, "r2_63d") or 0.0)
        change_pct = float(get(item, "change_pct") or 0.0)
        is_recent = bool(get(item, "is_recently_listed", False))
        raw_bars = get(item, "trading_days")
        n_bars = int(raw_bars) if raw_bars is not None else 500
        rsi14 = get(item, "rsi14")
        adx14 = get(item, "adx14")
        turnover_cr = float(get(item, "turnover_cr") or 0.0)
        passes_liq = bool(get(item, "passes_liquidity", True))
        is_vol_conf = bool(get(item, "is_volume_confirmed", False))

        if c is None or high_52w is None or c <= 0 or high_52w <= 0:
            return False

        c_val = float(c)
        h52_val = float(high_52w)
        hath_val = float(high_ath) if (high_ath is not None and float(high_ath) > 0) else h52_val

        # 1. Liquidity & Volume Floor (₹15 Cr + 1.4x Volume Trigger)
        if not passes_liq or turnover_cr < 15.0:
            return False
        if require_vol_confirm and not is_vol_conf:
            return False

        # 2. Overhead Supply Cap: Close >= 0.85 * 52W_High AND Close >= 0.70 * All_Time_High
        if c_val < 0.85 * h52_val or c_val < 0.70 * hath_val:
            return False

        # 3. Stacked Trend (Explicit Pairwise Checks):
        #    Close > MA20, MA20 > MA50, MA50 > MA100, and MA100 > MA200 (ignore MA200 only if genuine new listing with <200 bars / unformed MA200)
        if n_bars < 100 or sma20 is None or sma50 is None or sma100 is None:
            return False

        ma20_val = float(sma20)
        ma50_val = float(sma50)
        ma100_val = float(sma100)

        if not (c_val > ma20_val and ma20_val > ma50_val and ma50_val > ma100_val):
            return False

        if not is_recent:
            if n_bars < 221 or sma200 is None or sma200_21d_ago is None:
                return False
            ma200_val = float(sma200)
            ma200_21_val = float(sma200_21d_ago)
            if not (ma100_val > ma200_val and ma50_val > ma200_val and c_val > ma200_val):
                return False
            # 4. Rising 200 DMA: MA200 > MA200[21] (200 DMA must be higher than 21 sessions ago)
            if not (ma200_val > ma200_21_val):
                return False
        elif n_bars >= 200 and sma200 is not None:
            ma200_val = float(sma200)
            if not (ma100_val > ma200_val and ma50_val > ma200_val and c_val > ma200_val):
                return False
            if n_bars >= 221 and sma200_21d_ago is not None:
                if not (ma200_val > float(sma200_21d_ago)):
                    return False

        # 5. Trend Persistence: Close > MA50 for at least 15 of the last 20 sessions
        if days_above_ma50_20d is None or int(days_above_ma50_20d) < 15:
            return False

        # 6. Anti-Spike Smoothness: 1D_Return < 0.40 * ROC21 (or 63-day R² > 0.65)
        roc21 = float(get(item, "roc21") or 0.0)
        roc63 = float(get(item, "roc63") or 0.0)
        roc126 = float(get(item, "roc126") or 0.0)
        if roc21 <= 0.0 or roc63 <= 0.0 or (n_bars >= 126 and roc126 <= 0.0):
            return False
        if not (change_pct < 0.40 * roc21 or r2_63d > 0.65):
            return False

        # 7. Trend Strength & RSI Band: ADX(14) > 25 and 55 <= RSI(14) <= 75
        if adx14 is None or rsi14 is None:
            return False
        if not (float(adx14) > 25.0 and 55.0 <= float(rsi14) <= 75.0):
            return False

        return True

    def rank_top10_momentum(
        self,
        items: List[Any],
        require_vol_confirm: bool = True,
        volatility_adjust: bool = True,
        limit: int = 10
    ) -> List[Any]:
        """
        Step 2: Normalized Ranking (Top 10)
        Only runs on stocks that pass Step 1:
        - Volatility-Adjust Returns: Divide ROC21, ROC63, and ROC126 by ATR(14)% (ATR14 / Close * 100).
        - Convert to Percentile Ranks (0 to 100): Across shortlisted stocks, calculate P_Rank for
          ROC21, ROC63, ROC126, and ADX14.
        - Composite_Score = 0.40 * P_Rank(ROC21) + 0.20 * P_Rank(ROC63) + 0.20 * P_Rank(ROC126) + 0.20 * P_Rank(ADX14)
        - Sort by Composite_Score descending and take the Top 10.
        """
        get = self._get_item_attr
        set_attr = self._set_item_attr

        shortlisted = [x for x in items if self.check_top10_step1(x, require_vol_confirm=require_vol_confirm)]
        n = len(shortlisted)
        if n == 0:
            return []

        m_roc21 = []
        m_roc63 = []
        m_roc126 = []
        m_adx14 = []

        for x in shortlisted:
            roc21 = float(get(x, "roc21") or 0.0)
            roc63 = float(get(x, "roc63") or 0.0)
            roc126 = float(get(x, "roc126") or 0.0)
            adx14 = float(get(x, "adx14") or 0.0)
            atr_pct = float(get(x, "atr14_pct") or 0.0)

            if volatility_adjust and atr_pct > 0:
                m_roc21.append(roc21 / atr_pct)
                m_roc63.append(roc63 / atr_pct)
                m_roc126.append(roc126 / atr_pct)
            else:
                m_roc21.append(roc21)
                m_roc63.append(roc63)
                m_roc126.append(roc126)
            m_adx14.append(adx14)

        def calc_p_rank(values: List[float]) -> np.ndarray:
            if n == 1:
                return np.array([100.0])
            ranks = pd.Series(values).rank(method="average", ascending=True).values
            return ((ranks - 1.0) / (n - 1.0)) * 100.0

        pr_roc21 = calc_p_rank(m_roc21)
        pr_roc63 = calc_p_rank(m_roc63)
        pr_roc126 = calc_p_rank(m_roc126)
        pr_adx14 = calc_p_rank(m_adx14)

        scored_items = []
        for idx, x in enumerate(shortlisted):
            comp = (
                0.40 * float(pr_roc21[idx])
                + 0.20 * float(pr_roc63[idx])
                + 0.20 * float(pr_roc126[idx])
                + 0.20 * float(pr_adx14[idx])
            )
            comp_rounded = round(comp, 2)
            # Clone or update item
            if isinstance(x, dict):
                item_copy = dict(x)
            else:
                item_copy = x.model_copy() if hasattr(x, "model_copy") else x.copy()
            set_attr(item_copy, "composite_score", comp_rounded)
            set_attr(item_copy, "passes_top10_step1", True)
            scored_items.append(item_copy)

        scored_items.sort(
            key=lambda it: (
                float(get(it, "composite_score") or 0.0),
                float(get(it, "adx14") or 0.0),
                float(get(it, "vol_multiple") or 0.0)
            ),
            reverse=True
        )

        top_items = scored_items[:limit]
        for rank_idx, it in enumerate(top_items, start=1):
            set_attr(it, "top10_rank", rank_idx)

        return top_items

    def analyze_stock(
        self,
        df: pd.DataFrame,
        rs_sm: int,
        rs_n50: int,
        symbol: Optional[str] = None
    ) -> HighLowAnalysis:
        """Executes canonical liquidity, Stage 2 trend, volume confirmation, and breakout categorization."""
        total_bars = len(df)
        row = df.iloc[-1]
        c = float(row["close"])
        prev_c = float(df.iloc[-2]["close"]) if total_bars > 1 else c
        change_pct = round(((c - prev_c) / prev_c) * 100.0, 2) if prev_c > 0 else 0.0

        high_52w = float(row.get("high_52w", c))
        low_52w = float(row.get("low_52w", c))
        high_ath = float(row.get("high_ath", c))

        dist_52w = round(((c - high_52w) / high_52w) * 100.0, 2) if high_52w > 0 else 0.0
        dist_ath = round(((c - high_ath) / high_ath) * 100.0, 2) if high_ath > 0 else 0.0

        # Use latest candle date as reference when evaluating recent listing window (<= 730 days)
        ref_dt = datetime.now(IST).replace(tzinfo=None)
        if "date" in df.columns and pd.notna(row.get("date")):
            try:
                ref_dt = datetime.strptime(str(row["date"])[:10], "%Y-%m-%d")
            except Exception:
                pass

        is_recent_listing = False
        if symbol:
            try:
                from backend.app.universe_store import universe_store
                meta = universe_store.get(symbol)
                if meta and meta.listing_date:
                    dt = datetime.strptime(meta.listing_date.strip(), "%d-%b-%Y")
                    is_recent_listing = (ref_dt - dt).days <= 730
            except Exception:
                is_recent_listing = False

        # 1. Canonical Liquidity & Volume Confirmation
        closes_arr = df["close"].values
        vols_arr = df["volume"].values
        active_days, turnover_cr, passes_liquidity = self.compute_liquidity(closes_arr, vols_arr)

        vol = float(row["volume"])
        vol_sma50_raw = row.get("vol_sma50", vol)
        vol_sma50 = float(vol_sma50_raw) if (vol_sma50_raw is not None and not pd.isna(vol_sma50_raw)) else vol
        vol_multiple, is_vol_confirmed = self.compute_volume_confirmation(vol, vol_sma50, passes_liquidity)

        # 2. Moving Averages & Persistence / Oscillators
        sma20 = float(row["sma20"]) if ("sma20" in df.columns and pd.notna(row.get("sma20"))) else None
        sma50 = float(row["sma50"]) if ("sma50" in df.columns and pd.notna(row.get("sma50"))) else None
        sma100 = float(row["sma100"]) if ("sma100" in df.columns and pd.notna(row.get("sma100"))) else None
        sma200 = float(row["sma200"]) if ("sma200" in df.columns and pd.notna(row.get("sma200"))) else None

        sma200_slope_60d_pct = None
        if sma200 is not None and total_bars >= 260 and "sma200" in df.columns:
            sma200_60d_ago = df.iloc[total_bars - 61].get("sma200")
            if sma200_60d_ago is not None and not pd.isna(sma200_60d_ago) and float(sma200_60d_ago) > 0:
                sma200_slope_60d_pct = round(((sma200 - float(sma200_60d_ago)) / float(sma200_60d_ago)) * 100.0, 2)
        elif sma200 is not None and total_bars > 200 and "sma200" in df.columns:
            sma200_first = df.iloc[199].get("sma200")
            if sma200_first is not None and not pd.isna(sma200_first) and float(sma200_first) > 0:
                sma200_slope_60d_pct = round(((sma200 - float(sma200_first)) / float(sma200_first)) * 100.0, 2)

        rsi14, adx14, atr14_pct = self.compute_wilder_oscillators(
            df["high"].values, df["low"].values, closes_arr, period=14
        )
        roc21, roc63, roc126 = self.compute_roc_metrics(closes_arr)
        sma200_21d_ago, days_above_ma50_20d, r2_63d = self.compute_persistence_and_smoothness(closes_arr)

        passes_trend, trend_reasons = self.check_stage2_trend(
            price=c,
            sma20=sma20,
            sma50=sma50,
            sma200=sma200,
            sma200_21d_ago=sma200_21d_ago,
            sma200_slope_60d_pct=sma200_slope_60d_pct,
            trading_days=total_bars,
            passes_liquidity=passes_liquidity,
            is_recently_listed=is_recent_listing,
        )

        above_mas = self.is_above_mas(c, sma50, sma200, total_bars)
        status, status_label = self.classify_status(
            dist_52w=dist_52w,
            dist_ath=dist_ath,
            trading_days=total_bars,
            is_recent=is_recent_listing,
            passes_liquidity=passes_liquidity,
            is_above_mas=above_mas,
        )

        analysis_obj = HighLowAnalysis(
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
            sma20=round(sma20, 2) if sma20 is not None else None,
            sma50=round(sma50, 2) if sma50 is not None else None,
            sma100=round(sma100, 2) if sma100 is not None else None,
            sma200=round(sma200, 2) if sma200 is not None else None,
            sma200_21d_ago=sma200_21d_ago,
            sma200_slope_60d_pct=sma200_slope_60d_pct,
            days_above_ma50_20d=days_above_ma50_20d,
            r2_63d=r2_63d,
            active_days_20d=active_days,
            turnover_cr=turnover_cr,
            passes_liquidity=passes_liquidity,
            vol_sma50=round(vol_sma50, 0),
            volume_multiple=vol_multiple,
            is_volume_confirmed=is_vol_confirmed,
            rs_rating_smallmid=rs_sm,
            rs_rating_nifty50=rs_n50,
            rsi14=rsi14,
            adx14=adx14,
            atr14_pct=atr14_pct,
            roc21=roc21,
            roc63=roc63,
            roc126=roc126
        )
        analysis_obj.passes_top10_step1 = self.check_top10_step1(analysis_obj, require_vol_confirm=False)
        return analysis_obj

    def run_screener(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        stock_names: Dict[str, str],
        smallmid_bench_df: Optional[pd.DataFrame] = None,
        nifty50_bench_df: Optional[pd.DataFrame] = None,
        ath_dict: Optional[Dict[str, float]] = None
    ) -> List[StockScreenerItem]:
        """Runs the screener across the entire stock universe."""
        ath_dict = ath_dict or {}
        computed_dfs = {}
        for sym, df in stock_dfs.items():
            if df is not None and len(df) >= 20:
                computed_dfs[sym] = self.compute_indicators(df, lifetime_ath=ath_dict.get(sym))

        rs_ratings = self.compute_rs_ratings(computed_dfs, smallmid_bench_df, nifty50_bench_df)

        from backend.app.universe_store import universe_store
        items: List[StockScreenerItem] = []
        for sym, df in computed_dfs.items():
            name = stock_names.get(sym, sym)
            rs_sm, rs_n50 = rs_ratings.get(sym, (50, 50))
            analysis = self.analyze_stock(df, rs_sm, rs_n50, symbol=sym)

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
                is_fno=universe_store.is_fno(sym),
                fno_lot_size=universe_store.get_fno_lot_size(sym),
                rsi14=analysis.rsi14,
                adx14=analysis.adx14,
                atr14_pct=analysis.atr14_pct,
                roc21=analysis.roc21,
                roc63=analysis.roc63,
                roc126=analysis.roc126,
                passes_top10_step1=analysis.passes_top10_step1
            )
            items.append(item)

        # Annotate pre-calculated Top 10 Composite Scores & Ranks on the default shortlist
        top10_ranked = self.rank_top10_momentum(items, require_vol_confirm=False)
        top10_map = {x.symbol: (x.composite_score, x.top10_rank) for x in top10_ranked}
        for it in items:
            if it.symbol in top10_map:
                it.composite_score, it.top10_rank = top10_map[it.symbol]

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
