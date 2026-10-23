import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck } from 'lucide-react'

export default function StockGrid({ stocks, onSelectStock, selectedSymbol, loading }) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const gridRef = useRef(null)
  const cardRefs = useRef([])

  useEffect(() => {
    if (!stocks || stocks.length === 0) return
    if (selectedSymbol) {
      const idx = stocks.findIndex((s) => s.symbol === selectedSymbol)
      if (idx !== -1) {
        setFocusedIndex(idx)
        const el = cardRefs.current[idx]
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
        <p className="text-sm text-[#6B7280] dark:text-[#9CA3AF] font-normal">Scanning universe for momentum setups...</p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return null
  }

  // 2D Spatial Navigation across responsive grid cards using live bounding rects
  const handleGridKeyDown = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.composedPath ? e.composedPath()[0] : e.target
    if (
      target instanceof Element &&
      target.matches(':read-write, select, input[type="range"], [role="slider"]')
    ) {
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      const activeStock = stocks[focusedIndex]
      if (activeStock) {
        e.preventDefault()
        onSelectStock(activeStock.symbol)
      }
      return
    }

    const dirMap = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowDown: 'down',
      ArrowUp: 'up',
    }
    const dir = dirMap[e.key]
    if (!dir) return

    const currentEl = cardRefs.current[focusedIndex]
    if (!currentEl || !(target instanceof Element) || currentEl !== target) return

    const currentRect = currentEl.getBoundingClientRect()
    const currentCenterX = (currentRect.left + currentRect.right) / 2
    const currentCenterY = (currentRect.top + currentRect.bottom) / 2
    const tolerance = 2

    const candidates = []
    cardRefs.current.forEach((el, idx) => {
      if (!el || idx === focusedIndex) return
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      // Edge-based direction filter
      let inDirection = false
      let gap = 0
      let overlapsPerp = false
      let perpCenterOffset = 0

      if (dir === 'right' && rect.left >= currentRect.right - tolerance) {
        inDirection = true
        gap = Math.max(0, rect.left - currentRect.right)
        overlapsPerp = rect.bottom > currentRect.top + tolerance && rect.top < currentRect.bottom - tolerance
        perpCenterOffset = Math.abs((rect.top + rect.bottom) / 2 - currentCenterY)
      } else if (dir === 'left' && rect.right <= currentRect.left + tolerance) {
        inDirection = true
        gap = Math.max(0, currentRect.left - rect.right)
        overlapsPerp = rect.bottom > currentRect.top + tolerance && rect.top < currentRect.bottom - tolerance
        perpCenterOffset = Math.abs((rect.top + rect.bottom) / 2 - currentCenterY)
      } else if (dir === 'down' && rect.top >= currentRect.bottom - tolerance) {
        inDirection = true
        gap = Math.max(0, rect.top - currentRect.bottom)
        overlapsPerp = rect.right > currentRect.left + tolerance && rect.left < currentRect.right - tolerance
        perpCenterOffset = Math.abs((rect.left + rect.right) / 2 - currentCenterX)
      } else if (dir === 'up' && rect.bottom <= currentRect.top + tolerance) {
        inDirection = true
        gap = Math.max(0, currentRect.top - rect.bottom)
        overlapsPerp = rect.right > currentRect.left + tolerance && rect.left < currentRect.right - tolerance
        perpCenterOffset = Math.abs((rect.left + rect.right) / 2 - currentCenterX)
      }

      if (inDirection) {
        candidates.push({ idx, el, gap, overlapsPerp, perpCenterOffset })
      }
    })

    if (candidates.length === 0) {
      // Do not preventDefault when no candidate exists so native boundary scrolling works
      return
    }

    const aligned = candidates.filter((c) => c.overlapsPerp)
    let winner = null
    if (aligned.length > 0) {
      aligned.sort((a, b) => a.gap - b.gap || a.perpCenterOffset - b.perpCenterOffset)
      winner = aligned[0]
    } else {
      const w = 2.5
      candidates.sort((a, b) => a.gap + w * a.perpCenterOffset - (b.gap + w * b.perpCenterOffset))
      winner = candidates[0]
    }

    if (winner) {
      e.preventDefault()
      setFocusedIndex(winner.idx)
      winner.el.focus()
      winner.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
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
    <div
      ref={gridRef}
      onKeyDown={handleGridKeyDown}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
    >
      {stocks.map((s, idx) => {
        const isSelected = selectedSymbol === s.symbol
        const isFocused = focusedIndex === idx
        const chg = Number(s.change_pct || 0)

        return (
          <div
            key={s.symbol}
            ref={(el) => {
              cardRefs.current[idx] = el
            }}
            tabIndex={isFocused ? 0 : -1}
            onFocus={() => setFocusedIndex(idx)}
            onClick={() => {
              setFocusedIndex(idx)
              onSelectStock(s.symbol)
            }}
            className={`bg-white dark:bg-[#111827] border rounded-2xl p-4 cursor-pointer transition-all hover:shadow-xs group flex flex-col justify-between gap-3 focus:outline-none ${
              isSelected
                ? 'border-[#8069BF] ring-2 ring-[#8069BF]/30'
                : 'border-[#E5E7EB] dark:border-[#1F2937] hover:border-[#9CA3AF] dark:hover:border-[#4B5563] focus:border-[#8069BF]'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-base text-[#111827] dark:text-[#F9FAFB]">
                    {s.symbol}
                  </span>
                  {s.is_fno && (
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded bg-[#8069BF]/12 text-[#8069BF] dark:bg-[#8069BF]/25 dark:text-[#C4B5FD] border border-[#8069BF]/30 leading-none"
                      title={s.fno_lot_size ? `NSE F&O Stock • Lot Size: ${s.fno_lot_size}` : 'NSE F&O Stock'}
                    >
                      F&O
                    </span>
                  )}
                  {s.is_volume_confirmed && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 font-semibold text-xs text-[#16A34A] dark:text-[#22C55E] tabular-nums">
                      {Number(s.vol_multiple).toFixed(2)}x
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-[200px] font-normal mt-0.5">
                  {s.name}
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-base text-[#111827] dark:text-[#F9FAFB] tabular-nums">
                  ₹{formatNum2(s.current_price)}
                </div>
                <div
                  className={`text-xs tabular-nums font-semibold ${
                    chg > 0
                      ? 'text-[#16A34A] dark:text-[#22C55E]'
                      : chg < 0
                      ? 'text-[#DC2626] dark:text-[#F87171]'
                      : 'text-[#6B7280] dark:text-[#9CA3AF]'
                  }`}
                >
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
                <div
                  className={`text-[11px] tabular-nums font-semibold ${
                    Number(s.dist_to_52w_high_pct) >= -2.0
                      ? 'text-[#16A34A] dark:text-[#22C55E]'
                      : 'text-[#6B7280] dark:text-[#9CA3AF]'
                  }`}
                >
                  {formatPct2(s.dist_to_52w_high_pct)}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF] uppercase font-medium">ATH (₹)</div>
                <div className="font-semibold text-[#111827] dark:text-[#F9FAFB] tabular-nums">
                  {formatNum2(s.high_ath)}
                </div>
                <div
                  className={`text-[11px] tabular-nums font-semibold ${
                    Number(s.dist_to_ath_pct) >= -2.0
                      ? 'text-[#16A34A] dark:text-[#22C55E]'
                      : 'text-[#6B7280] dark:text-[#9CA3AF]'
                  }`}
                >
                  {formatPct2(s.dist_to_ath_pct)}
                </div>
              </div>
            </div>

            {/* Footer Strip */}
            <div className="flex items-center justify-between pt-1 border-t border-[#E5E7EB] dark:border-[#1F2937] text-xs">
              <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] flex items-center gap-1 font-normal">
                {s.passes_trend_check && <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />}
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
