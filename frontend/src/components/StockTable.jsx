import React, { useState } from 'react'
import { ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function StockTable({ stocks, onSelectStock, loading }) {
  const [sortField, setSortField] = useState('vol_multiple')
  const [sortAsc, setSortAsc] = useState(false) // Default descending for highest volume first

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#111827] dark:border-[#F9FAFB] border-t-transparent mb-3" />
        <p className="text-sm text-[#6B7280] dark:text-[#9CA3AF] font-normal">Scanning NSE universe for 52W High & ATH momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl p-12 text-center">
        <span className="text-3xl mb-3 block">🔍</span>
        <h3 className="text-base font-semibold text-[#111827] dark:text-[#F9FAFB] mb-1">No Stocks Matching Current Filter</h3>
        <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] max-w-md mx-auto font-normal">
          Try toggling off "Volume Confirmed" to view setups building volume, or switch tabs to view Near 52W High / ATH stocks.
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
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 inline ml-1 text-[#9CA3AF]" />
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-[#111827] dark:text-[#F9FAFB] inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#111827] dark:text-[#F9FAFB] inline ml-1" />
    )
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
    <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          {/* Column Headers: Inter Medium (500 weight) in muted gray */}
          <thead className="bg-[#F9FAFB] dark:bg-[#161D27] border-b border-[#E5E7EB] dark:border-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF] font-medium uppercase tracking-wider text-[10px]">
            <tr>
              <th 
                onClick={() => handleSort('symbol')}
                className="py-3.5 px-4 cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium"
              >
                Ticker / Company {renderSortIcon('symbol')}
              </th>
              <th 
                onClick={() => handleSort('current_price')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Price (₹) {renderSortIcon('current_price')}
              </th>
              <th 
                onClick={() => handleSort('change_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Change % {renderSortIcon('change_pct')}
              </th>
              <th 
                onClick={() => handleSort('vol_multiple')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Volume Signal {renderSortIcon('vol_multiple')}
              </th>
              <th 
                onClick={() => handleSort('high_52w')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                52W High (₹) {renderSortIcon('high_52w')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_52w_high_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Dist to 52W {renderSortIcon('dist_to_52w_high_pct')}
              </th>
              <th 
                onClick={() => handleSort('high_ath')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                ATH (₹) {renderSortIcon('high_ath')}
              </th>
              <th 
                onClick={() => handleSort('dist_to_ath_pct')}
                className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Dist to ATH {renderSortIcon('dist_to_ath_pct')}
              </th>
              <th 
                onClick={() => handleSort('turnover_cr')}
                className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-[#111827] dark:hover:text-[#F9FAFB] group font-medium tabular-nums"
              >
                Turnover (₹ Cr) {renderSortIcon('turnover_cr')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#1F2937]">
            {sortedStocks.map((s) => {
              return (
                <tr
                  key={s.symbol}
                  onClick={() => onSelectStock(s.symbol)}
                  className="hover:bg-[#F9FAFB] dark:hover:bg-[#161D27] cursor-pointer transition-colors group"
                >
                  {/* Ticker (Semi-Bold 600) & Company Name (Regular 400) */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-sm tracking-tight text-[#111827] dark:text-[#F9FAFB] flex items-center gap-1.5">
                          {s.symbol}
                          {s.passes_trend_check && (
                            <ShieldCheck className="w-3.5 h-3.5 text-[#9CA3AF] inline" title="Passes Stage 2 Trend Check" />
                          )}
                        </div>
                        <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-[170px] font-normal">
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price: Strip ₹, Tabular Nums with Fixed 2 Decimals */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatNum2(s.current_price)}
                  </td>

                  {/* Change %: Bold Neutral (No Green/Red color), Tabular Nums */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatPct2(s.change_pct)}
                  </td>

                  {/* Volume Signal: Green only for Confirmed (>= 1.4x), Tabular Nums */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {s.is_volume_confirmed ? (
                      <span className="font-semibold text-xs text-[#16A34A] dark:text-[#22C55E] tabular-nums">
                        {Number(s.vol_multiple).toFixed(2)}x
                      </span>
                    ) : (
                      <span className="font-normal text-xs text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
                        {Number(s.vol_multiple).toFixed(2)}x
                      </span>
                    )}
                  </td>

                  {/* 52W High: Strip ₹, Tabular Nums with Fixed 2 Decimals */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatNum2(s.high_52w)}
                  </td>

                  {/* Dist to 52W: Bold Neutral (No Green color), Tabular Nums */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatPct2(s.dist_to_52w_high_pct)}
                  </td>

                  {/* ATH: Strip ₹, Tabular Nums with Fixed 2 Decimals */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatNum2(s.high_ath)}
                  </td>

                  {/* Dist to ATH: Bold Neutral, Tabular Nums */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatPct2(s.dist_to_ath_pct)}
                  </td>

                  {/* Turnover: Strip ₹, format as 0.81 Cr */}
                  <td className="py-3 px-4 text-right tabular-nums font-normal text-[#6B7280] dark:text-[#9CA3AF]">
                    {formatNum2(s.turnover_cr)} Cr
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
