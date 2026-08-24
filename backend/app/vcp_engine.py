# -*- coding: utf-8 -*-
import math
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
import pandas as pd
from backend.app.models import (
    Candle, Contraction, SwingPoint, VCPAnalysis, StockScreenerItem
)

class VCPEngine:
    def __init__(
        self,
        min_base_weeks: float = 5.0,        # Minimum 5 weeks (25 trading days)
        max_base_weeks: float = 65.0,       # Maximum 65 weeks (~325 trading days)
        min_contractions: int = 2,          # Minimum 2 contractions (e.g. 2T Cup-with-Handle)
        max_contractions: int = 6,          # Up to 6 contractions
        max_base_depth_pct: float = 45.0,   # Max allowable base depth
        final_contraction_max_depth: float = 12.0, # Final contraction depth <= 12% (tight)
        atr_period: int = 14,
        atr_multiplier: float = 1.0,
        min_swing_pct: float = 0.02,        # 2% threshold for swings
        min_rs_rating: int = 65,            # RS rating threshold for breakout
        max_vdu_ratio: float = 1.10,        # Volume dry up ratio threshold
        min_breakout_vol_ratio: float = 1.25 # Volume expansion on breakout
    ):
        self.min_base_weeks = min_base_weeks
        self.max_base_weeks = max_base_weeks
        self.min_contractions = min_contractions
        self.max_contractions = max_contractions
        self.max_base_depth_pct = max_base_depth_pct
        self.final_contraction_max_depth = final_contraction_max_depth
        self.atr_period = atr_period
        self.atr_multiplier = atr_multiplier
        self.min_swing_pct = min_swing_pct
        self.min_rs_rating = min_rs_rating
        self.max_vdu_ratio = max_vdu_ratio
        self.min_breakout_vol_ratio = min_breakout_vol_ratio

    def compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates moving averages, ATR, volume averages, and 52W high/low."""
        df = df.copy().reset_index(drop=True)
        # Ensure date column is string for consistent formatting
        df["date_str"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

        c = df["close"]
        h = df["high"]
        l = df["low"]
        v = df["volume"]

        df["ema10"] = c.ewm(span=10, adjust=False).mean()
        df["ema20"] = c.ewm(span=20, adjust=False).mean()
        df["sma50"] = c.rolling(window=50, min_periods=15).mean()
        df["sma150"] = c.rolling(window=150, min_periods=30).mean()
        df["sma200"] = c.rolling(window=200, min_periods=40).mean()
        df["vol_sma20"] = v.rolling(window=20, min_periods=5).mean().fillna(v)
        df["vol_sma50"] = v.rolling(window=50, min_periods=10).mean().fillna(v)

        prev_close = c.shift(1).fillna(c)
        tr1 = h - l
        tr2 = (h - prev_close).abs()
        tr3 = (l - prev_close).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        df["atr"] = tr.rolling(window=self.atr_period, min_periods=5).mean().fillna(tr)

        df["high_52w"] = h.rolling(window=252, min_periods=30).max()
        df["low_52w"] = l.rolling(window=252, min_periods=30).min()

        return df

    def compute_rs_scores_and_ratings(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        benchmark_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, Tuple[float, int]]:
        """
        Computes weighted 12-month RS score and percentile rating (1-99)
        across all stocks in the universe:
        RS = 0.4*R_3M + 0.2*R_6M + 0.2*R_9M + 0.2*R_12M
        """
        raw_scores = {}

        bench_ret_3m = bench_ret_6m = bench_ret_9m = bench_ret_12m = 0.0
        if benchmark_df is not None and len(benchmark_df) >= 40:
            bc = benchmark_df["close"].values
            n_b = len(bc)
            bench_ret_3m = (bc[-1] - bc[max(0, n_b - 63)]) / bc[max(0, n_b - 63)] if n_b > 63 else 0.0
            bench_ret_6m = (bc[-1] - bc[max(0, n_b - 126)]) / bc[max(0, n_b - 126)] if n_b > 126 else 0.0
            bench_ret_9m = (bc[-1] - bc[max(0, n_b - 189)]) / bc[max(0, n_b - 189)] if n_b > 189 else 0.0
            bench_ret_12m = (bc[-1] - bc[max(0, n_b - 252)]) / bc[max(0, n_b - 252)] if n_b > 252 else 0.0

        for sym, df in stock_dfs.items():
            if df is None or len(df) < 30:
                raw_scores[sym] = -999.0
                continue

            c = df["close"].values
            n = len(c)

            r_3m = (c[-1] - c[max(0, n - 63)]) / c[max(0, n - 63)] if n >= 63 else (c[-1] - c[0]) / c[0]
            r_6m = (c[-1] - c[max(0, n - 126)]) / c[max(0, n - 126)] if n >= 126 else r_3m
            r_9m = (c[-1] - c[max(0, n - 189)]) / c[max(0, n - 189)] if n >= 189 else r_6m
            r_12m = (c[-1] - c[max(0, n - 252)]) / c[max(0, n - 252)] if n >= 252 else r_9m

            rel_3m = r_3m - bench_ret_3m
            rel_6m = r_6m - bench_ret_6m
            rel_9m = r_9m - bench_ret_9m
            rel_12m = r_12m - bench_ret_12m

            rs_score = (0.40 * rel_3m) + (0.20 * rel_6m) + (0.20 * rel_9m) + (0.20 * rel_12m)
            raw_scores[sym] = rs_score

        valid_scores = [s for s in raw_scores.values() if s > -900]
        if not valid_scores:
            return {sym: (0.0, 50) for sym in stock_dfs}

        series = pd.Series(valid_scores)
        percentiles = {}
        for sym, score in raw_scores.items():
            if score <= -900:
                percentiles[sym] = (score, 1)
            else:
                pct = int(math.ceil((series < score).mean() * 99))
                pct = max(1, min(99, pct))
                percentiles[sym] = (score, pct)

        return percentiles

    def check_minervini_trend_template(self, df: pd.DataFrame, rs_rating: int) -> Tuple[bool, List[str]]:
        """
        Strict Mark Minervini Stage 2 Trend Template (SEPA):
        1. Price > 150-day SMA AND Price > 200-day SMA
        2. 150-day SMA > 200-day SMA
        3. 200-day SMA must be in an UPTREND (trending up for at least 20 trading days)
        4. 50-day SMA > 150-day SMA AND 50-day SMA > 200-day SMA
        5. Price >= 50-day SMA (Price is above the 50 DMA)
        6. Price is at least 25% above its 52-week low
        7. Price is within 25% of its 52-week high
        8. RS Rating >= 70 (Relative strength leader)
        """
        reasons = []
        if len(df) < 40:
            return False, ["Insufficient historical bars (<40)"]

        row = df.iloc[-1]
        c = float(row["close"])
        sma50 = row.get("sma50")
        sma150 = row.get("sma150")
        sma200 = row.get("sma200")
        high_52w = float(row.get("high_52w", c))
        low_52w = float(row.get("low_52w", c))

        # Check for valid moving averages
        if pd.isna(sma50) or pd.isna(sma150) or pd.isna(sma200):
            return False, ["Moving averages (50/150/200) not formed yet"]

        sma50 = float(sma50)
        sma150 = float(sma150)
        sma200 = float(sma200)

        # 1. Price > 150 SMA and Price > 200 SMA
        if c < sma150:
            reasons.append(f"Price (₹{c:.2f}) < 150-day SMA (₹{sma150:.2f})")
        if c < sma200:
            reasons.append(f"Price (₹{c:.2f}) < 200-day SMA (₹{sma200:.2f})")

        # 2. 150 SMA > 200 SMA
        if sma150 < sma200:
            reasons.append(f"150-day SMA (₹{sma150:.2f}) < 200-day SMA (₹{sma200:.2f})")

        # 3. 200 SMA must be trending UP
        lookback_idx = max(0, len(df) - 21)
        prev_sma200 = df.iloc[lookback_idx].get("sma200")
        if not pd.isna(prev_sma200) and sma200 < float(prev_sma200):
            reasons.append("200-day SMA is in a downtrend (falling over last 20 days)")

        # 4. 50 SMA > 150 SMA and 50 SMA > 200 SMA
        if sma50 < sma150:
            reasons.append(f"50-day SMA (₹{sma50:.2f}) < 150-day SMA (₹{sma150:.2f})")
        if sma50 < sma200:
            reasons.append(f"50-day SMA (₹{sma50:.2f}) < 200-day SMA (₹{sma200:.2f})")

        # 5. Price >= 50 SMA (allow max 1.5% intraday shakeout above 50 SMA)
        if c < (sma50 * 0.985):
            reasons.append(f"Price (₹{c:.2f}) is below 50-day SMA (₹{sma50:.2f})")

        # 6. Price >= 25% above 52-week low
        if low_52w > 0:
            pct_above_low = (c - low_52w) / low_52w * 100.0
            if pct_above_low < 25.0:
                reasons.append(f"Only {pct_above_low:.1f}% above 52w low (requires >=25%)")

        # 7. Price within 25% of 52-week high
        if high_52w > 0:
            pct_below_high = (high_52w - c) / high_52w * 100.0
            if pct_below_high > 25.0:
                reasons.append(f"{pct_below_high:.1f}% below 52w high (requires <=25%)")

        # 8. RS Rating >= 70
        if rs_rating < 70:
            reasons.append(f"RS Rating {rs_rating} < 70 (requires >=70)")

        is_stage2 = (len(reasons) == 0)
        return is_stage2, reasons

    def detect_zigzag_swings(self, df: pd.DataFrame) -> List[SwingPoint]:
        """
        ATR-based ZigZag swing detection to isolate key structural peaks and troughs.
        """
        if len(df) < 15:
            return []

        swings: List[SwingPoint] = []
        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        dates = df["date_str"].values
        atrs = df["atr"].values

        trend = 0
        last_pivot_price = closes[0]
        last_pivot_idx = 0
        last_pivot_type = None

        for i in range(1, len(df)):
            atr = atrs[i] if not pd.isna(atrs[i]) else closes[i] * 0.02
            threshold = max(atr * self.atr_multiplier, closes[i] * self.min_swing_pct)

            if trend == 0:
                if highs[i] >= last_pivot_price + threshold:
                    trend = 1
                    last_pivot_price = highs[i]
                    last_pivot_idx = i
                    last_pivot_type = "HIGH"
                elif lows[i] <= last_pivot_price - threshold:
                    trend = -1
                    last_pivot_price = lows[i]
                    last_pivot_idx = i
                    last_pivot_type = "LOW"
            elif trend == 1:
                if highs[i] > last_pivot_price:
                    last_pivot_price = highs[i]
                    last_pivot_idx = i
                elif lows[i] <= last_pivot_price - threshold:
                    swings.append(SwingPoint(
                        time=str(dates[last_pivot_idx]),
                        price=float(last_pivot_price),
                        type="HIGH",
                        atr=float(atrs[last_pivot_idx]) if not pd.isna(atrs[last_pivot_idx]) else 0.0
                    ))
                    trend = -1
                    last_pivot_price = lows[i]
                    last_pivot_idx = i
                    last_pivot_type = "LOW"
            elif trend == -1:
                if lows[i] < last_pivot_price:
                    last_pivot_price = lows[i]
                    last_pivot_idx = i
                elif highs[i] >= last_pivot_price + threshold:
                    swings.append(SwingPoint(
                        time=str(dates[last_pivot_idx]),
                        price=float(last_pivot_price),
                        type="LOW",
                        atr=float(atrs[last_pivot_idx]) if not pd.isna(atrs[last_pivot_idx]) else 0.0
                    ))
                    trend = 1
                    last_pivot_price = highs[i]
                    last_pivot_idx = i
                    last_pivot_type = "HIGH"

        if last_pivot_type and last_pivot_idx < len(dates):
            swings.append(SwingPoint(
                time=str(dates[last_pivot_idx]),
                price=float(last_pivot_price),
                type=last_pivot_type,
                atr=float(atrs[last_pivot_idx]) if not pd.isna(atrs[last_pivot_idx]) else 0.0
            ))

        return swings

    def analyze_vcp_pattern(
        self,
        df: pd.DataFrame,
        swings: List[SwingPoint],
        is_stage2: bool,
        trend_reasons: List[str],
        rs_score: float,
        rs_rating: int
    ) -> VCPAnalysis:
        """
        Robust VCP pattern recognition engine:
        1. Tests candidate base lookback windows (5 to 65 weeks).
        2. Identifies base high ceiling and contraction waves (T1, T2, T3...).
        3. Validates volatility contraction monotonicity (each pullback is shallower).
        4. Calculates pivot resistance, volume dry-up, distance to pivot, and stop loss.
        """
        current_price = float(df["close"].iloc[-1])
        current_vol = float(df["volume"].iloc[-1])
        vol_sma20 = float(df["vol_sma20"].iloc[-1]) if not pd.isna(df["vol_sma20"].iloc[-1]) else current_vol
        df_len = len(df)

        analysis = VCPAnalysis(
            is_stage2=is_stage2,
            trend_reasons=trend_reasons,
            rs_score=rs_score,
            rs_rating=rs_rating,
            has_vcp=False,
            current_price=current_price,
            status="STAGE2_WATCH" if is_stage2 else "NOT_SETTING_UP"
        )

        if df_len < 30:
            return analysis

        # Candidate base durations to evaluate (from 5 weeks to 65 weeks)
        min_bars = int(self.min_base_weeks * 5)  # 25 bars
        max_bars = min(df_len - 5, int(self.max_base_weeks * 5)) # up to 325 bars

        best_vcp_data = None
        best_vcp_score = -999

        # Evaluate candidate lookbacks
        step = max(5, (max_bars - min_bars) // 15)
        for lookback in range(min_bars, max_bars + 1, step):
            base_slice = df.iloc[-lookback:]
            high_val = float(base_slice["high"].max())
            high_idx = int(base_slice["high"].idxmax())
            
            # The base must start at least 20 trading days ago
            base_bars = df_len - high_idx
            if base_bars < 20 or base_bars > int(self.max_base_weeks * 5):
                continue

            base_df = df.iloc[high_idx:]
            base_high_price = high_val
            base_low_price = float(base_df["low"].min())
            base_depth_pct = (base_high_price - base_low_price) / base_high_price * 100.0

            if base_depth_pct > self.max_base_depth_pct or base_depth_pct < 4.0:
                continue

            # Extract swing points inside this base window
            base_start_date = str(df["date_str"].iloc[high_idx])
            swings_in_base = [s for s in swings if s.time >= base_start_date]

            # Build contraction legs from swings + current price
            contractions = self._extract_contractions_from_base(base_df, base_high_price, swings_in_base)
            
            if len(contractions) < self.min_contractions:
                continue

            # Check Monotonicity of Contraction Depths (T1 > T2 > T3...)
            # Each subsequent contraction should be shallower (with 15% noise tolerance)
            is_contracting = True
            for k in range(len(contractions) - 1):
                c_curr = contractions[k].depth_pct
                c_next = contractions[k + 1].depth_pct
                if c_next > (c_curr * 1.15):
                    is_contracting = False
                    break

            if not is_contracting:
                continue

            final_c = contractions[-1]
            if final_c.depth_pct > self.final_contraction_max_depth:
                continue

            # Score this candidate base (favor tight final contraction and clear stages)
            score = len(contractions) * 10 - final_c.depth_pct - (base_depth_pct * 0.1)
            if score > best_vcp_score:
                best_vcp_score = score
                best_vcp_data = {
                    "base_high_price": base_high_price,
                    "base_low_price": base_low_price,
                    "base_depth_pct": base_depth_pct,
                    "base_start_date": base_start_date,
                    "base_bars": base_bars,
                    "contractions": contractions,
                    "final_c": final_c,
                    "base_df": base_df
                }

        if best_vcp_data is None:
            return analysis

        # Found a valid VCP pattern!
        base_high = best_vcp_data["base_high_price"]
        base_low = best_vcp_data["base_low_price"]
        base_depth = best_vcp_data["base_depth_pct"]
        base_start = best_vcp_data["base_start_date"]
        base_bars = best_vcp_data["base_bars"]
        contractions = best_vcp_data["contractions"]
        final_c = best_vcp_data["final_c"]
        base_df = best_vcp_data["base_df"]

        # Pivot price is the resistance of the final contraction or base high
        pivot_price = final_c.high_price if final_c.high_price >= (base_high * 0.90) else base_high
        dist_to_pivot = round(((current_price - pivot_price) / pivot_price) * 100.0, 2)

        # Volume Dry-Up (VDU) on right-side pullback
        final_pullback_df = base_df[base_df["date_str"] >= final_c.low_time]
        final_avg_vol = float(final_pullback_df["volume"].mean()) if not final_pullback_df.empty else current_vol
        vdu_ratio = round(final_avg_vol / vol_sma20, 2) if vol_sma20 > 0 else 1.0
        breakout_vol_ratio = round(current_vol / vol_sma20, 2) if vol_sma20 > 0 else 1.0

        # Suggested Stop Loss
        raw_stop = final_c.low_price * 0.99
        max_stop = pivot_price * 0.93 # max 7% stop
        suggested_stop = max(raw_stop, max_stop)
        risk_pct = round(((pivot_price - suggested_stop) / pivot_price) * 100.0, 2)
        risk_amount = pivot_price - suggested_stop
        target_2r = round(pivot_price + (2.0 * risk_amount), 2)
        target_3r = round(pivot_price + (3.0 * risk_amount), 2)

        depth_strs = [f"-{c.depth_pct}%" for c in contractions]
        summary_str = f"{len(contractions)}T ({', '.join(depth_strs)})"

        # Strict Minervini Stage 2 Gate:
        # A VCP can ONLY exist if the stock passes the Stage 2 Trend Template with RS >= 70
        if not is_stage2 or rs_rating < 70:
            analysis.has_vcp = False
            analysis.status = "NOT_SETTING_UP"
            return analysis

        # Classification Logic for Valid Stage 2 Leaders
        # 1. IN_BREAKOUT_ZONE: Sitting right at pivot (-2.5% to +2.5%) in Stage 2 with tight base
        # 2. TRIGGERED_BREAKOUT: Pushing above pivot (+0.1% to +6.5%) with volume expansion
        # 3. DEVELOPING_VCP: Multi-contraction base forming in Stage 2 working towards pivot (-15% to -2.5%)
        if -2.5 <= dist_to_pivot <= 2.5:
            status = "IN_BREAKOUT_ZONE"
        elif dist_to_pivot > 0.0 and dist_to_pivot <= 6.5 and breakout_vol_ratio >= self.min_breakout_vol_ratio:
            status = "TRIGGERED_BREAKOUT"
        elif dist_to_pivot < -2.5:
            status = "DEVELOPING_VCP"
        else:
            status = "IN_BREAKOUT_ZONE"

        analysis.has_vcp = True
        analysis.base_start_time = base_start
        analysis.base_end_time = str(df["date_str"].iloc[-1])
        analysis.base_high = round(base_high, 2)
        analysis.base_low = round(base_low, 2)
        analysis.base_depth_pct = round(base_depth, 1)
        analysis.base_duration_weeks = round(base_bars / 5.0, 1)
        analysis.base_duration_days = base_bars
        analysis.contractions = contractions
        analysis.contractions_count = len(contractions)
        analysis.contractions_summary = summary_str
        analysis.pivot_price = round(pivot_price, 2)
        analysis.distance_to_pivot_pct = dist_to_pivot
        analysis.volume_dry_up_ratio = vdu_ratio
        analysis.breakout_volume_ratio = breakout_vol_ratio
        analysis.status = status
        analysis.suggested_stop_loss = round(suggested_stop, 2)
        analysis.risk_pct = risk_pct
        analysis.target_2r = target_2r
        analysis.target_3r = target_3r

        return analysis

    def _extract_contractions_from_base(
        self, 
        base_df: pd.DataFrame, 
        base_high: float, 
        swings: List[SwingPoint]
    ) -> List[Contraction]:
        """
        Constructs contraction legs from swing extremes inside the base.
        """
        contractions: List[Contraction] = []
        high_swings = [s for s in swings if s.type == "HIGH"]
        low_swings = [s for s in swings if s.type == "LOW"]

        if not low_swings:
            # Measure direct pullback if no swing lows registered yet
            min_low = float(base_df["low"].min())
            min_idx = base_df["low"].idxmin()
            d = (base_high - min_low) / base_high * 100.0
            if d > 0:
                contractions.append(Contraction(
                    index=1,
                    high_time=str(base_df["date_str"].iloc[0]),
                    high_price=base_high,
                    low_time=str(base_df["date_str"].loc[min_idx]),
                    low_price=min_low,
                    depth_pct=round(d, 1),
                    duration_days=len(base_df)
                ))
            return contractions

        # Contraction 1 (T1): Major pullback from base peak to lowest low in initial half
        lowest_low_point = min(low_swings, key=lambda s: s.price)
        t1_depth = (base_high - lowest_low_point.price) / base_high * 100.0
        
        contractions.append(Contraction(
            index=1,
            high_time=str(base_df["date_str"].iloc[0]),
            high_price=base_high,
            low_time=lowest_low_point.time,
            low_price=lowest_low_point.price,
            depth_pct=round(t1_depth, 1),
            duration_days=15
        ))

        # Subsequent Contractions (T2, T3, T4...): Swings occurring AFTER the lowest low
        after_low_swings = [s for s in swings if s.time > lowest_low_point.time]
        
        curr_high = base_high * 0.98
        curr_high_time = lowest_low_point.time

        for s in after_low_swings:
            if s.type == "HIGH":
                curr_high = s.price
                curr_high_time = s.time
            elif s.type == "LOW" and curr_high > s.price:
                depth = (curr_high - s.price) / curr_high * 100.0
                if depth >= 2.0:
                    contractions.append(Contraction(
                        index=len(contractions) + 1,
                        high_time=curr_high_time,
                        high_price=round(curr_high, 2),
                        low_time=s.time,
                        low_price=round(s.price, 2),
                        depth_pct=round(depth, 1),
                        duration_days=8
                    ))

        # If price consolidated tightly on the right side over the last 10-15 days without registering a ZigZag swing low yet
        if len(contractions) == 1 and len(base_df) >= 30:
            recent_slice = base_df.iloc[-15:]
            recent_h = float(recent_slice["high"].max())
            recent_l = float(recent_slice["low"].min())
            t2_depth = (recent_h - recent_l) / recent_h * 100.0
            if 1.5 <= t2_depth < t1_depth:
                contractions.append(Contraction(
                    index=2,
                    high_time=str(recent_slice["date_str"].iloc[0]),
                    high_price=round(recent_h, 2),
                    low_time=str(recent_slice["date_str"].iloc[-1]),
                    low_price=round(recent_l, 2),
                    depth_pct=round(t2_depth, 1),
                    duration_days=len(recent_slice)
                ))

        return contractions

    def run_screener_on_stocks(
        self,
        stock_dfs: Dict[str, pd.DataFrame],
        stock_names: Dict[str, str],
        benchmark_df: Optional[pd.DataFrame] = None
    ) -> List[StockScreenerItem]:
        """
        Runs full screening pipeline across all stocks.
        """
        computed_dfs = {}
        for sym, df in stock_dfs.items():
            if df is not None and len(df) >= 20:
                computed_dfs[sym] = self.compute_indicators(df)

        rs_ratings = self.compute_rs_scores_and_ratings(computed_dfs, benchmark_df)

        items: List[StockScreenerItem] = []
        for sym, df in computed_dfs.items():
            name = stock_names.get(sym, sym)
            rs_score, rs_rating = rs_ratings.get(sym, (0.0, 50))

            is_stage2, trend_reasons = self.check_minervini_trend_template(df, rs_rating)
            swings = self.detect_zigzag_swings(df)
            vcp = self.analyze_vcp_pattern(df, swings, is_stage2, trend_reasons, rs_score, rs_rating)

            row = df.iloc[-1]
            prev_row = df.iloc[-2] if len(df) > 1 else row
            c = float(row["close"])
            prev_c = float(prev_row["close"])
            change_pct = round(((c - prev_c) / prev_c) * 100.0, 2)
            vol = float(row["volume"])
            vol_sma20 = float(row.get("vol_sma20", vol)) if not pd.isna(row.get("vol_sma20")) else vol
            vol_mult = round(vol / vol_sma20, 2) if vol_sma20 > 0 else 1.0

            lookback_idx = max(0, len(df) - 21)
            prev_sma200 = df.iloc[lookback_idx].get("sma200", 0)
            curr_sma200 = row.get("sma200", 0)
            sma200_slope_pos = bool(curr_sma200 > prev_sma200) if (curr_sma200 and prev_sma200) else False

            status_labels = {
                "IN_BREAKOUT_ZONE": "In Breakout Zone",
                "TRIGGERED_BREAKOUT": "Triggered Breakout",
                "DEVELOPING_VCP": "Developing VCP",
                "STAGE2_WATCH": "Stage 2 Uptrend",
                "NOT_SETTING_UP": "Consolidating / Lagging"
            }

            item = StockScreenerItem(
                symbol=sym,
                name=name,
                current_price=round(c, 2),
                change_pct=change_pct,
                volume=vol,
                vol_multiple=vol_mult,
                rs_rating=rs_rating,
                status=vcp.status,
                status_label=status_labels.get(vcp.status, vcp.status),
                pivot_price=vcp.pivot_price,
                distance_to_pivot_pct=vcp.distance_to_pivot_pct,
                contractions_count=vcp.contractions_count,
                contractions_summary=vcp.contractions_summary,
                base_depth_pct=vcp.base_depth_pct,
                base_weeks=vcp.base_duration_weeks,
                volume_dry_up_ratio=vcp.volume_dry_up_ratio,
                suggested_stop_loss=vcp.suggested_stop_loss,
                risk_pct=vcp.risk_pct,
                sma50=round(float(row.get("sma50", 0)), 2) if not pd.isna(row.get("sma50")) else None,
                sma200=round(float(row.get("sma200", 0)), 2) if not pd.isna(row.get("sma200")) else None,
                sma200_slope_positive=sma200_slope_pos
            )
            items.append(item)

        status_priority = {
            "IN_BREAKOUT_ZONE": 1,
            "TRIGGERED_BREAKOUT": 2,
            "DEVELOPING_VCP": 3,
            "STAGE2_WATCH": 4,
            "NOT_SETTING_UP": 5
        }
        items.sort(key=lambda x: (status_priority.get(x.status, 99), -x.rs_rating, abs(x.distance_to_pivot_pct or 99)))
        return items

vcp_engine = VCPEngine()
