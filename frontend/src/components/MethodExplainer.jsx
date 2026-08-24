import React from 'react'
import { Target, Crown, Rocket, Flame, ShieldCheck, TrendingUp, Sparkles } from 'lucide-react'

export default function MethodExplainer() {
  return (
    <div className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-6 sm:p-8 mt-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <span>🚀</span>
          <span>Small & Midcap 52-Week High & ATH Momentum Methodology</span>
        </h2>
        <p className="text-sm text-muted max-w-3xl">
          Stocks reaching 52-week highs and All-Time Highs represent the strongest momentum leaders in the market. In small and mid caps, combining exact price boundaries with volume confirmation and trend health eliminates false breakouts and uncovers genuine institutional accumulation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border space-y-2">
          <div className="text-amber-500 font-bold text-sm flex items-center gap-1.5">
            <Crown className="w-4 h-4" />
            1. All-Time High (ATH)
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Trading within <strong className="text-gray-800 dark:text-gray-200">±5% of All-Time High</strong> with at least 500 trading days (~2 years) of history. No overhead supply/trapped buyers left above price.
          </p>
        </div>

        {/* Card 2 */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border space-y-2">
          <div className="text-emerald-500 font-bold text-sm flex items-center gap-1.5">
            <Rocket className="w-4 h-4" />
            2. 52W High Breakout
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Trading at or above <strong className="text-gray-800 dark:text-gray-200">52-week high (&ge; 99.5%)</strong> while still distinctly below historical ATH. Captures multi-month turnaround momentum.
          </p>
        </div>

        {/* Card 3 */}
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border space-y-2">
          <div className="text-blue-500 font-bold text-sm flex items-center gap-1.5">
            <Target className="w-4 h-4" />
            3. Near 52W High (-10%)
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Consolidating within <strong className="text-gray-800 dark:text-gray-200">-10% of 52W high</strong>. Ideal watch-list setups preparing for explosive breakout thrusts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-surface-border dark:border-surface-dark-border text-xs text-muted">
        <div className="flex items-start gap-2.5">
          <Flame className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <strong className="text-gray-800 dark:text-gray-200 block mb-0.5">Volume Confirmation (🔥 &ge; 1.4x)</strong>
            Filters for days where volume is at least 1.4x the 50-day average. In small caps, low-volume breakouts frequently fail; high volume confirms institutional backing.
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <TrendingUp className="w-4 h-4 text-trade-green shrink-0 mt-0.5" />
          <div>
            <strong className="text-gray-800 dark:text-gray-200 block mb-0.5">Small/Midcap Specific Relative Strength</strong>
            Ranked (1–99) against the Nifty Smallcap 250 & Midcap 150 universe over 3M and 6M trailing windows rather than large-cap Nifty 50.
          </div>
        </div>
      </div>
    </div>
  )
}
