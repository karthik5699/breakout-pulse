import React, { useState, useEffect, useRef, useId } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Star, ShieldCheck } from 'lucide-react'
import Sparkline from './Sparkline'

function formatNum2(val) {
  if (val === undefined || val === null || isNaN(val)) return '0.00'
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPct2(val) {
  if (val === undefined || val === null || isNaN(val)) return '0.00%'
  const num = Number(val)
  return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
}

const TAB_NOUNS = {
  ath: 'all-time high setups',
  near_52w: '52-week high setups',
  recent_listings: 'recent listing setups',
  top10: 'momentum leaders',
  all: 'tracked stocks',
}

export default function StockTable({
  layout = 'split',
  stocks,
  onSelectStock,
  onOpenChart,
  selectedSymbol,
  loading,
  sortField = 'vol_multiple',
  sortAsc = false,
  onSortChange,
  activeTab = 'ath',
  watchlist = new Set(),
  onToggleWatchlist,
  totalMatchingCount = 0,
  onOpenUpload,
}) {
  const isSplit = layout === 'split'
  const isTop10 = activeTab === 'top10'
  const isNear52w = activeTab === 'near_52w'

  const [focusedIndex, setFocusedIndex] = useState(0)
  const [sortAnnouncement, setSortAnnouncement] = useState('')
  const rowRefs = useRef([])
  const captionId = useId()

  useEffect(() => {
    rowRefs.current.length = stocks ? stocks.length : 0
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
      <div className="p-12 text-center bg-[var(--surface)] flex-1 flex flex-col items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-7 w-7 border-[3px] border-[var(--accent)] border-t-transparent mb-3" />
        <p className="text-[14px] text-[var(--ink-muted)] m-0">
          Loading NSE momentum setups...
        </p>
      </div>
    )
  }

  if (!stocks || stocks.length === 0) {
    return (
      <div className="p-12 text-center bg-[var(--surface)] flex-1 flex flex-col items-center justify-center">
        <h3 className="text-[18px] font-display font-bold text-[var(--ink)] mb-1.5">
          No setups match these filters
        </h3>
        <p className="text-[14px] text-[var(--ink-muted)] max-w-md mx-auto m-0">
          Try switching off Volume ≥ 1.4×, Stage 2 trend, RS ≥ 80, or Watchlist to inspect more NSE equities.
        </p>
      </div>
    )
  }

  const handleSort = (field, label) => {
    const nextAsc = sortField === field ? !sortAsc : false
    if (onSortChange) {
      onSortChange(field)
    }
    setSortAnnouncement(
      `Sorted by ${label}, ${nextAsc ? 'ascending' : 'descending'}, ${stocks.length} rows`
    )
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
    if ((e.key === 'Enter' || e.key === ' ') && target instanceof Element && target.closest('button, a')) {
      return
    }

    if (e.key === 'ArrowDown') {
      const nextIdx = focusedIndex + 1
      if (nextIdx < stocks.length) {
        e.preventDefault()
        setFocusedIndex(nextIdx)
        const nextStock = stocks[nextIdx]
        if (isSplit && onSelectStock && nextStock) {
          onSelectStock(nextStock.symbol)
        }
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
        const prevStock = stocks[prevIdx]
        if (isSplit && onSelectStock && prevStock) {
          onSelectStock(prevStock.symbol)
        }
        const prevRow = rowRefs.current[prevIdx]
        if (prevRow) {
          prevRow.focus()
          prevRow.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }
    } else if ((e.key === 's' || e.key === 'S') && onToggleWatchlist) {
      const activeStock = stocks[focusedIndex]
      if (activeStock) {
        e.preventDefault()
        onToggleWatchlist(activeStock.symbol)
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const activeStock = stocks[focusedIndex]
      if (activeStock) {
        e.preventDefault()
        if (onOpenChart) onOpenChart(activeStock.symbol)
        else if (onSelectStock) onSelectStock(activeStock.symbol)
      }
    }
  }

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown
          aria-hidden="true"
          className="w-3 h-3 opacity-30 group-hover:opacity-90 inline ml-1 text-[var(--ink-muted)] shrink-0"
        />
      )
    }
    return sortAsc ? (
      <ArrowUp aria-hidden="true" className="w-3 h-3 text-[var(--accent)] inline ml-1 shrink-0" />
    ) : (
      <ArrowDown aria-hidden="true" className="w-3 h-3 text-[var(--accent)] inline ml-1 shrink-0" />
    )
  }

  const renderHeader = (field, label, align = 'right', className = '', title = undefined) => {
    const isSorted = sortField === field
    const ariaSort = isSorted ? (sortAsc ? 'ascending' : 'descending') : undefined
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={`p-0 font-medium bg-[var(--surface-subtle)] border-b border-[var(--border)] text-[var(--ink-muted)] ${className}`}
      >
        <button
          type="button"
          onClick={() => handleSort(field, label)}
          title={title}
          className={`w-full py-2.5 px-2.5 flex items-center ${
            align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
          } cursor-pointer select-none text-[13px] font-medium hover:text-[var(--ink)] group focus:outline-none focus-visible:underline tabular-nums whitespace-nowrap bp-transition`}
        >
          <span>{label}</span>
          {renderSortIcon(field)}
        </button>
      </th>
    )
  }

  const footerTotal = totalMatchingCount > stocks.length ? ` of ${totalMatchingCount.toLocaleString('en-IN')}` : ''
  const footerNoun = TAB_NOUNS[activeTab] || 'setups'

  return (
    <div className="flex flex-col min-w-0 bg-[var(--surface)] flex-1">
      <div role="status" className="sr-only">
        {sortAnnouncement}
      </div>

      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className={isSplit ? 'overflow-x-hidden max-h-[420px] lg:max-h-[600px] overflow-y-auto' : 'overflow-x-auto max-h-[72vh]'}
      >
        <table
          onKeyDown={handleTableKeyDown}
          className={`w-full border-collapse text-left ${
            isSplit ? 'bp-ledger-split table-fixed' : 'min-w-[880px]'
          }`}
        >
          <caption id={captionId} className="sr-only">
            Screened NSE Momentum Stocks
          </caption>

          <thead className="sticky top-0 z-10">
            <tr>
              <th
                scope="col"
                aria-label="Watchlist"
                className="col-star w-[38px] pl-3 pr-1 py-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border)]"
              />
              {renderHeader(
                'symbol',
                'Symbol',
                'left',
                `col-symbol ${isSplit ? 'w-[30%]' : 'min-w-[210px]'}`
              )}
              <th
                scope="col"
                className="col-spark w-[92px] py-2.5 px-2.5 text-center text-[13px] font-medium text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-b border-[var(--border)] whitespace-nowrap"
              >
                30d trend
              </th>
              {!isSplit && isTop10 && renderHeader(
                'composite_score',
                'Score',
                'right',
                'col-score w-[88px]',
                'Composite Score across 21/63/126-day ROC and ADX(14)'
              )}
              {renderHeader('current_price', 'Price', 'right', `col-price ${isSplit ? 'w-[14%]' : ''}`)}
              {renderHeader('change_pct', 'Change', 'right', `col-chg ${isSplit ? 'w-[12%]' : ''}`)}
              {renderHeader('vol_multiple', 'Volume', 'right', `col-vol ${isSplit ? 'w-[11%]' : ''}`)}
              {renderHeader(
                'rs_rating_smallmid',
                'RS',
                'right',
                `col-rs ${isSplit ? 'w-[8%]' : ''}`,
                'Relative Strength percentile rating (1 to 99)'
              )}

              {isSplit ? (
                isTop10 ? (
                  renderHeader(
                    'composite_score',
                    'Score',
                    'right',
                    'col-ath w-[12%] pr-2',
                    'Composite Momentum Score'
                  )
                ) : isNear52w ? (
                  renderHeader('dist_to_52w_high_pct', 'To 52W', 'right', 'col-ath w-[12%] pr-2')
                ) : (
                  renderHeader('dist_to_ath_pct', 'To ATH', 'right', 'col-ath w-[12%] pr-2')
                )
              ) : (
                <>
                  {isTop10 ? (
                    <>
                      {renderHeader('rsi14', 'RSI (14)', 'right', 'col-rsi')}
                      {renderHeader('adx14', 'ADX (14)', 'right', 'col-adx')}
                    </>
                  ) : (
                    renderHeader('high_52w', '52W high', 'right', 'col-52w')
                  )}
                  {renderHeader('dist_to_52w_high_pct', 'To 52W', 'right', 'col-52w')}
                  {!isTop10 && (
                    <>
                      {renderHeader('high_ath', 'ATH', 'right', 'col-ath')}
                      {renderHeader('dist_to_ath_pct', 'To ATH', 'right', 'col-ath')}
                    </>
                  )}
                  {renderHeader('turnover_cr', 'Turnover', 'right', 'col-vol pr-2')}
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {stocks.map((s, idx) => {
              const isSelected = selectedSymbol === s.symbol
              const isFocused = focusedIndex === idx
              const isWatchlisted = watchlist.has(s.symbol)
              const chg = Number(s.change_pct || 0)
              const chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`
              const chgCls =
                chg > 0 ? 'text-[var(--up)]' : chg < 0 ? 'text-[var(--down)]' : 'text-[var(--ink-muted)]'
              const volMult = Number(s.vol_multiple || 0)
              const rsVal = s.rs_rating_smallmid ?? 50
              const distAth = Number(s.dist_to_ath_pct || 0)
              const dist52w = Number(s.dist_to_52w_high_pct || 0)
              const sparkUp =
                Array.isArray(s.spark) && s.spark.length >= 2
                  ? s.spark[s.spark.length - 1] >= s.spark[0]
                  : chg >= 0

              const renderProximityCell = (distVal, atLabel) => {
                if (Math.abs(distVal) < 0.05) {
                  return <span className="font-semibold text-[var(--up)]">{atLabel}</span>
                }
                return (
                  <span
                    className={
                      distVal >= -2.0 ? 'font-medium text-[var(--ink)]' : 'font-normal text-[var(--ink-muted)]'
                    }
                  >
                    {distVal.toFixed(2)}%
                  </span>
                )
              }

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
                    if (isSplit) {
                      onSelectStock?.(s.symbol)
                    } else {
                      onOpenChart ? onOpenChart(s.symbol) : onSelectStock?.(s.symbol)
                    }
                  }}
                  onDoubleClick={() => {
                    if (isSplit && onOpenChart) {
                      onOpenChart(s.symbol)
                    }
                  }}
                  className={`cursor-pointer bp-transition group focus:outline-none ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]'
                      : 'hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  {/* Star button */}
                  <td className="col-star pl-3 pr-1 py-2 border-b border-[var(--border)] align-middle">
                    {onToggleWatchlist && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleWatchlist(s.symbol)
                        }}
                        aria-label={isWatchlisted ? `Remove ${s.symbol} from watchlist` : `Add ${s.symbol} to watchlist`}
                        aria-pressed={isWatchlisted}
                        title={isWatchlisted ? 'Remove from watchlist (S)' : 'Add to watchlist (S)'}
                        className={`p-1 -m-1 inline-flex items-center justify-center cursor-pointer bp-transition ${
                          isWatchlisted
                            ? 'text-[var(--star-active)]'
                            : 'text-[var(--border-strong)] hover:text-[var(--ink-muted)]'
                        }`}
                      >
                        <Star
                          className="w-[15px] h-[15px]"
                          fill={isWatchlisted ? 'currentColor' : 'none'}
                          strokeWidth={1.8}
                        />
                      </button>
                    )}
                  </td>

                  {/* Symbol + Company + Plain F&O marker */}
                  <td className="col-symbol px-2.5 py-2 border-b border-[var(--border)] align-middle overflow-hidden">
                    <div className="flex items-center gap-1.5 min-w-0 leading-[1.25]">
                      {isTop10 && (
                        <span className="text-[13px] font-semibold text-[var(--accent)] tabular-nums shrink-0">
                          #{s.top10_rank || idx + 1}
                        </span>
                      )}
                      <span
                        className={`text-[14px] font-semibold truncate ${
                          isSelected ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
                        }`}
                      >
                        {s.symbol}
                      </span>
                      {!isSplit && s.passes_trend_check && (
                        <span title="Passes Stage 2 trend checks" className="inline-flex shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-[var(--up)]" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 text-[13px] text-[var(--ink-muted)] leading-[1.25] mt-0.5 min-w-0">
                      <span className="truncate">{s.name}</span>
                      {s.is_fno && (
                        <span
                          className="text-[var(--accent)] font-semibold shrink-0"
                          title={s.fno_lot_size ? `NSE F&O lot size ${s.fno_lot_size}` : 'NSE F&O equity'}
                        >
                          · F&amp;O
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 30d Sparkline */}
                  <td className="col-spark px-2.5 py-2 border-b border-[var(--border)] text-center align-middle">
                    <Sparkline
                      points={s.spark}
                      isUp={sparkUp}
                      className="w-[58px] h-[20px] sm:w-[76px] sm:h-[24px]"
                    />
                  </td>

                  {/* Composite Score (Table Top 10 view) */}
                  {!isSplit && isTop10 && (
                    <td className="col-score px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] font-semibold text-[var(--accent)] whitespace-nowrap align-middle">
                      {formatNum2(s.composite_score)}
                    </td>
                  )}

                  {/* Price (plus mobile stacked Change %) */}
                  <td className="col-price px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums whitespace-nowrap align-middle">
                    <div className="text-[14px] font-medium text-[var(--ink)]">
                      ₹{formatNum2(s.current_price)}
                    </div>
                    <div className={`mobile-only-chg text-[13px] font-semibold mt-0.5 ${chgCls}`}>
                      {chgStr}
                    </div>
                  </td>

                  {/* Change % */}
                  <td
                    className={`col-chg px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] font-medium whitespace-nowrap align-middle ${chgCls}`}
                  >
                    {chgStr}
                  </td>

                  {/* Volume multiple */}
                  <td
                    className={`col-vol px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] whitespace-nowrap align-middle ${
                      s.is_volume_confirmed
                        ? 'text-[var(--up)] font-semibold'
                        : 'text-[var(--ink-muted)] font-normal'
                    }`}
                  >
                    {volMult.toFixed(2)}×
                  </td>

                  {/* RS Rating */}
                  <td
                    className={`col-rs px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] whitespace-nowrap align-middle ${
                      rsVal >= 90
                        ? 'text-[var(--up)] font-semibold'
                        : rsVal >= 80
                        ? 'text-[var(--ink)] font-medium'
                        : 'text-[var(--ink-muted)] font-normal'
                    }`}
                    title={`RS SmallMid: ${rsVal} | RS Nifty 50: ${s.rs_rating_nifty50 ?? 50}`}
                  >
                    {rsVal}
                  </td>

                  {/* Split vs Table trailing columns */}
                  {isSplit ? (
                    <td className="col-ath px-2.5 pr-4 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] whitespace-nowrap align-middle">
                      {isTop10 ? (
                        <span className="font-semibold text-[var(--accent)]">
                          {formatNum2(s.composite_score)}
                        </span>
                      ) : isNear52w ? (
                        renderProximityCell(dist52w, 'At 52W')
                      ) : (
                        renderProximityCell(distAth, 'At ATH')
                      )}
                    </td>
                  ) : (
                    <>
                      {isTop10 ? (
                        <>
                          <td className="col-rsi px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] font-medium text-[var(--ink)] whitespace-nowrap align-middle">
                            {formatNum2(s.rsi14)}
                          </td>
                          <td className="col-adx px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] font-medium text-[var(--ink)] whitespace-nowrap align-middle">
                            {formatNum2(s.adx14)}
                          </td>
                        </>
                      ) : (
                        <td className="col-52w px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] text-[var(--ink)] whitespace-nowrap align-middle">
                          ₹{formatNum2(s.high_52w)}
                        </td>
                      )}

                      <td className="col-52w px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] whitespace-nowrap align-middle">
                        {renderProximityCell(dist52w, 'At 52W')}
                      </td>

                      {!isTop10 && (
                        <>
                          <td className="col-ath px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] text-[var(--ink)] whitespace-nowrap align-middle">
                            ₹{formatNum2(s.high_ath)}
                          </td>
                          <td className="col-ath px-2.5 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] whitespace-nowrap align-middle">
                            {renderProximityCell(distAth, 'At ATH')}
                          </td>
                        </>
                      )}

                      <td className="col-vol px-2.5 pr-4 py-2 border-b border-[var(--border)] text-right tabular-nums text-[14px] text-[var(--ink-muted)] whitespace-nowrap align-middle">
                        ₹{formatNum2(s.turnover_cr)} Cr
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Ledger Footer */}
      <div className="mt-auto px-4 py-2.5 flex items-center justify-between gap-3 text-[13px] text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-t border-[var(--border)] tabular-nums">
        <span>
          Showing {stocks.length.toLocaleString('en-IN')}
          {footerTotal} {footerNoun}
        </span>
        <span className="hidden sm:inline">
          {isSplit ? 'Keys: ↑ ↓ move, S star, Enter expand, / search' : 'Keys: ↑ ↓ move, S star, Enter chart, / search'}
        </span>
        {onOpenUpload && (
          <button
            type="button"
            onClick={onOpenUpload}
            className="sm:hidden text-[13px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
          >
            Import data
          </button>
        )}
      </div>
    </div>
  )
}
