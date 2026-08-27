import React from 'react'
import { ShieldCheck } from 'lucide-react'

export default function StockGrid({ stocks, onSelectStock, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#1E3A8A] dark:border-blue-500 border-t-transparent mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">Scanning universe for momentum setups...</p>
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
            className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 hover:border-[#1E3A8A] dark:hover:border-blue-500 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md group flex flex-col justify-between gap-3"
          >
            {/* Card Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-slate-900 dark:text-white group-hover:text-[#1E3A8A] dark:group-hover:text-[#60A5FA] transition-colors">
                    {s.symbol}
                  </span>
                  {s.is_volume_confirmed && (
                    <span className="font-mono font-bold text-xs text-[#16A34A] dark:text-[#22C55E]">
                      {s.vol_multiple.toFixed(2)}x
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] font-sans">
                  {s.name}
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono font-bold text-base text-slate-900 dark:text-white">
                  ₹{s.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-xs font-mono font-semibold ${isPos ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#DC2626] dark:text-[#EF4444]'}`}>
                  {isPos ? `+${s.change_pct}%` : `${s.change_pct}%`}
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-[#13171d] p-3 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-sans font-semibold">52W High</div>
                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ₹{s.high_52w.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                </div>
                <div className={`text-[11px] font-mono font-semibold ${s.dist_to_52w_high_pct >= -2.0 ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-slate-600 dark:text-slate-400'}`}>
                  {s.dist_to_52w_high_pct >= 0 ? `+${s.dist_to_52w_high_pct}%` : `${s.dist_to_52w_high_pct}%`}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-sans font-semibold">All-Time High</div>
                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ₹{s.high_ath.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                </div>
                <div className={`text-[11px] font-mono font-semibold ${Math.abs(s.dist_to_ath_pct) <= 2.0 ? 'text-[#1E3A8A] dark:text-[#60A5FA]' : 'text-slate-600 dark:text-slate-400'}`}>
                  {s.dist_to_ath_pct >= 0 ? `+${s.dist_to_ath_pct}%` : `${s.dist_to_ath_pct}%`}
                </div>
              </div>
            </div>

            {/* Footer Strip */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-sans">
                {s.passes_trend_check && <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />}
                <span>{s.passes_trend_check ? 'Stage 2 Trend' : 'Consolidating'}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Vol ₹{s.turnover_cr} Cr
              </div>
            </div>

          </div>
        )
      })}
    </div>
  )
}
