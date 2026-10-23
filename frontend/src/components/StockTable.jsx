import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function StockTable({
  stocks,
  onSelectStock,
  selectedSymbol,
  loading,
  sortField = 'vol_multiple',
  sortAsc = false,
  onSortChange,
}) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const rowRefs = useRef([])

  useEffect(() => {
    if (!stocks || stocks.length === 0) return
    if (selectedSymbol) {
      const idx = stocks.findIndex((s) => s.symbol === selectedSymbol)
      if (idx !== -1) {
        setFocusedIndex(idx)
        const el = rowRefs.current[idx]
        if (el) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }
    } else if (focusedIndex >= stocks.length) {
      setFocusedIndex(0)
    }
  }, [selectedSymbol, stocks])

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
          Try toggling off "Volume Confirmed" or "F&O Only" to view more setups, or switch tabs to view Near 52W High / ATH stocks.
        </p>
      </div>
    )
  }

  const handleSort = (field) => {
    if (onSortChange) {
      onSortChange(field)
    }
  }

  const handleTableKeyDown = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.composedPath ? e.composedPath()[0] : e.target
    if (
      target instanceof Element &&
      target.matches(':read-write, select, input[type="range"], [role="slider"]')
    ) {
      return
    }

    if (e.key === 'ArrowDown') {
      const nextIdx = focusedIndex + 1
      if (nextIdx < stocks.length) {
        e.preventDefault()
        setFocusedIndex(nextIdx)
        const nextRow = rowRefs.current[nextIdx]
        if (nextRow) {
          nextRow.focus()
          nextRow.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }
    } else if (e.key === 'ArrowUp') {
      const prevIdx = focusedIndex - 1
      if (prevIdx >= 0) {
        e.preventDefault()
        setFocusedIndex(prevIdx)
        const prevRow = rowRefs.current[prevIdx]
        if (prevRow) {
          prevRow.focus()
          prevRow.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const activeStock = stocks[focusedIndex]
      if (activeStock) {
        e.preventDefault()
        onSelectStock(activeStock.symbol)
      }
    }
  }

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 inline ml-1 text-[#9CA3AF]" />
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-[#8069BF] dark:text-[#A78BFA] inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#8069BF] dark:text-[#A78BFA] inline ml-1" />
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

  const renderChangePill = (val) => {
    const num = Number(val || 0)
    if (num > 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums bg-emerald-500/10 text-[#16A34A] dark:text-[#22C55E]">
          +{num.toFixed(2)}%
        </span>
      )
    }
    if (num < 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums bg-rose-500/10 text-[#DC2626] dark:text-[#F87171]">
          {num.toFixed(2)}%
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium tabular-nums text-[#6B7280] dark:text-[#9CA3AF]">
        0.00%
      </span>
    )
  }

  const renderProximityMetric = (distPct) => {
    const num = Number(distPct || 0)
    // Proximity bar from -10% (0% fill) to 0%+ (100% fill)
    const fillPct = Math.max(8, Math.min(100, ((10 + num) / 10) * 100))
    const isAtPivot = num >= -2.0

    return (
      <div className="inline-flex flex-col items-end gap-1 min-w-[64px]">
        <span
          className={`tabular-nums text-xs font-semibold ${
            isAtPivot
              ? 'text-[#16A34A] dark:text-[#22C55E]'
              : num >= -5.0
              ? 'text-[#111827] dark:text-[#F9FAFB]'
              : 'text-[#6B7280] dark:text-[#9CA3AF]'
          }`}
        >
          {formatPct2(num)}
        </span>
        <div className="w-14 h-1 rounded-full bg-[#E5E7EB] dark:bg-[#1F2937] overflow-hidden">
          <div
            className={`h-full rounded-full ${
              isAtPivot ? 'bg-[#16A34A] dark:bg-[#22C55E]' : 'bg-[#8069BF]'
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table
          onKeyDown={handleTableKeyDown}
          className="w-full text-left text-xs"
          aria-label="Screened NSE Momentum Stocks"
        >
          {/* Column Headers */}
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
            {stocks.map((s, idx) => {
              const isSelected = selectedSymbol === s.symbol
              const isFocused = focusedIndex === idx
              return (
                <tr
                  key={s.symbol}
                  ref={(el) => {
                    rowRefs.current[idx] = el
                  }}
                  tabIndex={isFocused ? 0 : -1}
                  onFocus={() => setFocusedIndex(idx)}
                  onClick={() => {
                    setFocusedIndex(idx)
                    onSelectStock(s.symbol)
                  }}
                  className={`cursor-pointer transition-colors group focus:outline-none ${
                    isSelected
                      ? 'bg-[#8069BF]/10 dark:bg-[#8069BF]/15'
                      : 'hover:bg-[#F9FAFB] dark:hover:bg-[#161D27] focus:bg-[#8069BF]/5 dark:focus:bg-[#8069BF]/10'
                  }`}
                >
                  {/* Ticker & Company Name */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-sm tracking-tight text-[#111827] dark:text-[#F9FAFB] flex items-center gap-1.5">
                          <span>{s.symbol}</span>
                          {s.is_fno && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded bg-[#8069BF]/12 text-[#8069BF] dark:bg-[#8069BF]/25 dark:text-[#C4B5FD] border border-[#8069BF]/30 leading-none"
                              title={s.fno_lot_size ? `NSE F&O Stock • Lot Size: ${s.fno_lot_size}` : 'NSE F&O Stock'}
                            >
                              F&O
                            </span>
                          )}
                          {s.passes_trend_check && (
                            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E] inline" title="Passes Stage 2 Trend Check" />
                          )}
                        </div>
                        <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-[180px] font-normal mt-0.5">
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    ₹{formatNum2(s.current_price)}
                  </td>

                  {/* Change %: Semantic Emerald / Rose Pill */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {renderChangePill(s.change_pct)}
                  </td>

                  {/* Volume Signal: Highlighted Pill for Confirmed (>= 1.4x) */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {s.is_volume_confirmed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-xs bg-emerald-500/10 text-[#16A34A] dark:text-[#22C55E] border border-emerald-500/20 tabular-nums">
                        {Number(s.vol_multiple).toFixed(2)}x
                      </span>
                    ) : (
                      <span className="font-normal text-xs text-[#6B7280] dark:text-[#9CA3AF] tabular-nums">
                        {Number(s.vol_multiple).toFixed(2)}x
                      </span>
                    )}
                  </td>

                  {/* 52W High */}
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-[#374151] dark:text-[#D1D5DB]">
                    {formatNum2(s.high_52w)}
                  </td>

                  {/* Dist to 52W with Proximity Bar */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {renderProximityMetric(s.dist_to_52w_high_pct)}
                  </td>

                  {/* ATH */}
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-[#374151] dark:text-[#D1D5DB]">
                    {formatNum2(s.high_ath)}
                  </td>

                  {/* Dist to ATH with Proximity Bar */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {renderProximityMetric(s.dist_to_ath_pct)}
                  </td>

                  {/* Turnover */}
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
