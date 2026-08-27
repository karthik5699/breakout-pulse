import React, { useState } from 'react'
import { ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function StockTable({ stocks, onSelectStock, loading }) {
  const [sortField, setSortField] = useState('vol_multiple')
  const [sortAsc, setSortAsc] = useState(false) // Default descending for highest volume first

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#1E3A8A] dark:border-blue-500 border-t-transparent mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">Scanning NSE universe for 52W High & ATH momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return (
      <div className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
        <span className="text-3xl mb-3 block">🔍</span>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1 font-sans">No Stocks Matching Current Filter</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-sans">
          Try toggling off "Volume Confirmed Only" to view setups building volume, or switch tabs to view Near 52W High / ATH stocks.
        </p>
      </div>
    )
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false) // Default descending on new column click
    }
  }

  const sortedStocks = [...stocks].sort((a, b) => {
    let valA = a[sortField]
    let valB = b[sortField]

    if (valA === undefined || valA === null) valA = -999999
    if (valB === undefined || valB === null) valB = -999999

    if (typeof valA === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
    }
    return sortAsc ? (valA - valB) : (valB - valA)
  })

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 inline ml-1" />
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-[#1E3A8A] dark:text-blue-400 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#1E3A8A] dark:text-blue-400 inline ml-1" />
    )
  }

  return (
    <div className="bg-white dark:bg-[#161a20] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-[#13171d] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px] font-sans">
            <tr>
              <th 
                onClick={() => handleSort('symbol')}
                className="py-3.5 px-4 cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Ticker / Company {renderSortIcon('symbol')}
              </th>
              <th 
                onClick={() => handleSort('current_price')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Price (₹) {renderSortIcon('current_price')}
              </th>
              <th 
                onClick={() => handleSort('change_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Change % {renderSortIcon('change_pct')}
              </th>
              <th 
                onClick={() => handleSort('vol_multiple')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group text-[#1E3A8A] dark:text-blue-400 font-bold"
              >
                Volume Signal {renderSortIcon('vol_multiple')}
              </th>
              <th 
                onClick={() => handleSort('high_52w')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                52W High {renderSortIcon('high_52w')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_52w_high_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Dist to 52W {renderSortIcon('dist_to_52w_high_pct')}
              </th>
              <th 
                onClick={() => handleSort('high_ath')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                All-Time High {renderSortIcon('high_ath')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_ath_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Dist to ATH {renderSortIcon('dist_to_ath_pct')}
              </th>
              <th 
                onClick={() => handleSort('turnover_cr')}
                className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-slate-900 dark:hover:text-white group"
              >
                Turnover {renderSortIcon('turnover_cr')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {sortedStocks.map((s) => {
              const isPos = s.change_pct >= 0
              return (
                <tr
                  key={s.symbol}
                  onClick={() => onSelectStock(s.symbol)}
                  className="hover:bg-slate-50/80 dark:hover:bg-[#1c222b] cursor-pointer transition-colors group"
                >
                  {/* Ticker & Name */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-mono font-bold text-sm tracking-tight text-slate-900 dark:text-white group-hover:text-[#1E3A8A] dark:group-hover:text-[#60A5FA] transition-colors flex items-center gap-1.5">
                          {s.symbol}
                          {s.passes_trend_check && (
                            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] inline" title="Passes Stage 2 Trend Check" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px] font-sans">
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                    ₹{s.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Change % - Crisp Accessible Text Color (No pill background) */}
                  <td className={`py-3.5 px-3 text-right font-mono font-semibold ${
                    isPos ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#DC2626] dark:text-[#EF4444]'
                  }`}>
                    {isPos ? `+${s.change_pct}%` : `${s.change_pct}%`}
                  </td>

                  {/* Volume Signal - Clean Font Weight & Slate/Green Text (No pill background) */}
                  <td className="py-3.5 px-3 text-right font-mono">
                    {s.is_volume_confirmed ? (
                      <span className="font-bold text-xs text-[#16A34A] dark:text-[#22C55E]">
                        {s.vol_multiple.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="font-normal text-xs text-slate-400 dark:text-slate-500">
                        {s.vol_multiple.toFixed(2)}x
                      </span>
                    )}
                  </td>

                  {/* 52W High */}
                  <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                    ₹{s.high_52w.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Dist to 52W - Clean Typography (No pill background) */}
                  <td className="py-3.5 px-3 text-right font-mono">
                    <span className={`font-semibold ${
                      s.dist_to_52w_high_pct >= -2.0 
                        ? 'text-[#16A34A] dark:text-[#22C55E]' 
                        : 'text-slate-600 dark:text-slate-400 font-normal'
                    }`}>
                      {s.dist_to_52w_high_pct >= 0 ? `+${s.dist_to_52w_high_pct}%` : `${s.dist_to_52w_high_pct}%`}
                    </span>
                  </td>

                  {/* ATH */}
                  <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                    ₹{s.high_ath.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Dist to ATH - Clean Typography (No pill background) */}
                  <td className="py-3.5 px-3 text-right font-mono">
                    <span className={`font-semibold ${
                      Math.abs(s.dist_to_ath_pct) <= 2.0 
                        ? 'text-[#1E3A8A] dark:text-[#60A5FA]' 
                        : 'text-slate-600 dark:text-slate-400 font-normal'
                    }`}>
                      {s.dist_to_ath_pct >= 0 ? `+${s.dist_to_ath_pct}%` : `${s.dist_to_ath_pct}%`}
                    </span>
                  </td>

                  {/* Turnover */}
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                    ₹{s.turnover_cr} Cr
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
