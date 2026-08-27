import React from 'react'
import { ShieldCheck } from 'lucide-react'

export default function StockGrid({ stocks, onSelectStock, loading }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#111827] dark:border-[#F9FAFB] border-t-transparent mb-3" />
        <p className="text-sm text-[#6B7280] dark:text-[#9CA3AF] font-normal">Scanning universe for momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return null
  }

  const formatNum2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00'
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatPct2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00%'
    const num = Number(val)
    return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      {stocks.map((s) => {
        return (
          <div
            key={s.symbol}
            onClick={() => onSelectStock(s.symbol)}
            className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] hover:border-[#9CA3AF] dark:hover:border-[#4B5563] rounded-2xl p-4 cursor-pointer transition-all hover:shadow-xs group flex flex-col justify-between gap-3"
          >
            {/* Card Header: Ticker Semi-Bold 600, Name Regular 400 */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base text-[#111827] dark:text-[#F9FAFB]">
                    {s.symbol}
                  </span>
                  {s.is_volume_confirmed && (
                    <span className="font-semibold text-xs text-[#16A34A] dark:text-[#22C55E] tabular-nums">
                      {Number(s.vol_multiple).toFixed(2)}x
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-[200px] font-normal">
                  {s.name}
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-base text-[#111827] dark:text-[#F9FAFB] tabular-nums">
                  {formatNum2(s.current_price)}
                </div>
                <div className="text-xs tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatPct2(s.change_pct)}
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-2 bg-[#F9FAFB] dark:bg-[#161D27] p-3 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF] uppercase font-medium">52W High (₹)</div>
                <div className="font-semibold text-[#111827] dark:text-[#F9FAFB] tabular-nums">
                  {formatNum2(s.high_52w)}
                </div>
                <div className="text-[11px] tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatPct2(s.dist_to_52w_high_pct)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF] uppercase font-medium">ATH (₹)</div>
                <div className="font-semibold text-[#111827] dark:text-[#F9FAFB] tabular-nums">
                  {formatNum2(s.high_ath)}
                </div>
                <div className="text-[11px] tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatPct2(s.dist_to_ath_pct)}
                </div>
              </div>
            </div>

            {/* Footer Strip */}
            <div className="flex items-center justify-between pt-1 border-t border-[#E5E7EB] dark:border-[#1F2937] text-xs">
              <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] flex items-center gap-1 font-normal">
                {s.passes_trend_check && <ShieldCheck className="w-3.5 h-3.5 text-[#9CA3AF]" />}
                <span>{s.passes_trend_check ? 'Stage 2 Trend' : 'Consolidating'}</span>
              </div>
              <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] tabular-nums font-normal">
                {formatNum2(s.turnover_cr)} Cr
              </div>
            </div>

          </div>
        )
      })}
    </div>
  )
}
