import React from 'react'
import { Flame, ShieldCheck } from 'lucide-react'

export default function StockGrid({ stocks, onSelectStock, loading }) {
  if (loading) {
    return (
      <div className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-banana border-t-transparent mb-3" />
        <p className="text-sm text-muted">Scanning universe for momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stocks.map((s) => {
        const isPos = s.change_pct >= 0
        return (
          <div
            key={s.symbol}
            onClick={() => onSelectStock(s.symbol)}
            className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border hover:border-banana/60 dark:hover:border-banana/60 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md group flex flex-col justify-between gap-3"
          >
            {/* Card Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-gray-900 dark:text-white group-hover:text-banana transition-colors">
                    {s.symbol}
                  </span>
                  {s.is_volume_confirmed && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                      {s.vol_multiple}x
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted truncate max-w-[200px]">
                  {s.name}
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono font-bold text-base text-gray-900 dark:text-white">
                  ₹{s.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-xs font-mono font-medium ${isPos ? 'text-trade-green' : 'text-trade-red'}`}>
                  {isPos ? `+${s.change_pct}%` : `${s.change_pct}%`}
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-[#161a20] p-3 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-muted uppercase">52W High</div>
                <div className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                  ₹{s.high_52w.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                </div>
                <div className="text-[11px] font-mono text-blue-500 font-medium">
                  {s.dist_to_52w_high_pct >= 0 ? `+${s.dist_to_52w_high_pct}%` : `${s.dist_to_52w_high_pct}%`}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted uppercase">All-Time High</div>
                <div className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                  ₹{s.high_ath.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                </div>
                <div className="text-[11px] font-mono text-amber-500 font-medium">
                  {s.dist_to_ath_pct >= 0 ? `+${s.dist_to_ath_pct}%` : `${s.dist_to_ath_pct}%`}
                </div>
              </div>
            </div>

            {/* Footer Strip */}
            <div className="flex items-center justify-between pt-1 border-t border-surface-border dark:border-surface-dark-border text-xs">
              <div className="text-[11px] text-muted flex items-center gap-1">
                {s.passes_trend_check && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                <span>{s.passes_trend_check ? 'Stage 2 Trend' : 'Consolidating'}</span>
              </div>
              <div className="text-[11px] text-muted font-mono">
                Vol ₹{s.turnover_cr} Cr
              </div>
            </div>

          </div>
        )
      })}
    </div>
  )
}
