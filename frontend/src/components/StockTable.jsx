import React, { useState } from 'react'
import { Flame, ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function StockTable({ stocks, onSelectStock, loading }) {
  const [sortField, setSortField] = useState('vol_multiple')
  const [sortAsc, setSortAsc] = useState(false) // Default descending for highest volume first

  if (loading) {
    return (
      <div className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-banana border-t-transparent mb-3" />
        <p className="text-sm text-muted">Scanning NSE universe for 52W High & ATH momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return (
      <div className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-12 text-center">
        <span className="text-3xl mb-3 block">🔍</span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No Stocks Matching Current Filter</h3>
        <p className="text-xs text-muted max-w-md mx-auto">
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
      <ArrowUp className="w-3 h-3 text-banana inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-banana inline ml-1" />
    )
  }

  return (
    <div className="bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-[#161a20] border-b border-surface-border dark:border-surface-dark-border text-muted font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th 
                onClick={() => handleSort('symbol')}
                className="py-3 px-4 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Ticker / Company {renderSortIcon('symbol')}
              </th>
              <th 
                onClick={() => handleSort('current_price')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Price (₹) {renderSortIcon('current_price')}
              </th>
              <th 
                onClick={() => handleSort('change_pct')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Change % {renderSortIcon('change_pct')}
              </th>
              <th 
                onClick={() => handleSort('vol_multiple')}
                className="py-3 px-3 text-center cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group text-amber-500 font-bold"
              >
                Volume Signal {renderSortIcon('vol_multiple')}
              </th>
              <th 
                onClick={() => handleSort('high_52w')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                52W High {renderSortIcon('high_52w')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_52w_high_pct')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Dist to 52W {renderSortIcon('dist_to_52w_high_pct')}
              </th>
              <th 
                onClick={() => handleSort('high_ath')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                All-Time High {renderSortIcon('high_ath')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_ath_pct')}
                className="py-3 px-3 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Dist to ATH {renderSortIcon('dist_to_ath_pct')}
              </th>
              <th 
                onClick={() => handleSort('turnover_cr')}
                className="py-3 px-4 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white group"
              >
                Turnover {renderSortIcon('turnover_cr')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border dark:divide-surface-dark-border">
            {sortedStocks.map((s) => {
              const isPos = s.change_pct >= 0
              return (
                <tr
                  key={s.symbol}
                  onClick={() => onSelectStock(s.symbol)}
                  className="hover:bg-gray-50 dark:hover:bg-[#1c222b] cursor-pointer transition-colors group"
                >
                  {/* Ticker & Name */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white group-hover:text-banana transition-colors flex items-center gap-1.5">
                          {s.symbol}
                          {s.passes_trend_check && (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 inline" title="Passes Stage 2 Trend Check" />
                          )}
                        </div>
                        <div className="text-[11px] text-muted truncate max-w-[150px]">
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-3.5 px-3 text-right font-mono font-semibold text-gray-900 dark:text-white">
                    ₹{s.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Change % */}
                  <td className={`py-3.5 px-3 text-right font-mono font-medium ${
                    isPos ? 'text-trade-green' : 'text-trade-red'
                  }`}>
                    {isPos ? `+${s.change_pct}%` : `${s.change_pct}%`}
                  </td>

                  {/* Volume Signal */}
                  <td className="py-3.5 px-3 text-center">
                    {s.is_volume_confirmed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                        {s.vol_multiple}x
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800">
                        {s.vol_multiple}x
                      </span>
                    )}
                  </td>

                  {/* 52W High */}
                  <td className="py-3.5 px-3 text-right font-mono text-gray-700 dark:text-gray-300">
                    ₹{s.high_52w.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Dist to 52W */}
                  <td className="py-3.5 px-3 text-right font-mono">
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${
                      s.dist_to_52w_high_pct >= -2.0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-500'
                    }`}>
                      {s.dist_to_52w_high_pct >= 0 ? `+${s.dist_to_52w_high_pct}%` : `${s.dist_to_52w_high_pct}%`}
                    </span>
                  </td>

                  {/* ATH */}
                  <td className="py-3.5 px-3 text-right font-mono text-gray-700 dark:text-gray-300">
                    ₹{s.high_ath.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Dist to ATH */}
                  <td className="py-3.5 px-3 text-right font-mono">
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${
                      Math.abs(s.dist_to_ath_pct) <= 2.0 ? 'text-amber-500 bg-amber-500/10' : 'text-gray-500'
                    }`}>
                      {s.dist_to_ath_pct >= 0 ? `+${s.dist_to_ath_pct}%` : `${s.dist_to_ath_pct}%`}
                    </span>
                  </td>

                  {/* Turnover */}
                  <td className="py-3.5 px-4 text-right font-mono text-gray-500">
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
