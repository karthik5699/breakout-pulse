import React from 'react'
import { Download } from 'lucide-react'

const TAB_HEADINGS = {
  ath: 'All-time high breakouts',
  near_52w: '52-week high setups',
  recent_listings: 'Recent listing breakouts',
  top10: 'Top 10 momentum leaders',
  all: 'All tracked NSE equities',
}

function formatDataDate(dateStr) {
  if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const [y, m, d] = parts
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const monthName = months[parseInt(m, 10) - 1] || m
      return `${parseInt(d, 10)} ${monthName} ${y}`
    }
  }
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRegimeLabel(label, trendText) {
  if (!trendText) return `${label} tracking`
  const lower = trendText.toLowerCase()
  return lower.includes('bullish') ? `${label} above 50 DMA` : `${label} below 50 DMA`
}

export default function MarketBanner({
  stats,
  activeTab,
  setActiveTab,
  newlyAddedCount = 0,
  volumeConfirmedOnly,
  setVolumeConfirmedOnly,
  trendOnly,
  setTrendOnly,
  fnoOnly,
  setFnoOnly,
  minRs = 0,
  setMinRs,
  watchlistOnly = false,
  setWatchlistOnly,
  watchlistCount = 0,
  displayedCount = 0,
  onExportTradingView,
  viewMode,
  setViewMode,
}) {
  if (!stats) return null

  const isTop10Tab = activeTab === 'top10'
  const pageTitle = TAB_HEADINGS[activeTab] || TAB_HEADINGS.ath
  const breadthUpPct = Math.max(0, Math.min(100, Number(stats.breadth_up_pct ?? 0)))

  const tabs = [
    {
      id: 'ath',
      label: 'All-time high',
      count: stats.filtered_near_ath_count ?? stats.near_ath_count ?? 0,
      total: stats.near_ath_count ?? 0,
    },
    {
      id: 'near_52w',
      label: '52-week high',
      count: stats.filtered_near_52w_count ?? stats.near_52w_count ?? 0,
      total: stats.near_52w_count ?? 0,
    },
    {
      id: 'recent_listings',
      label: 'Recent listings',
      count: stats.filtered_recent_listing_count ?? stats.recent_listing_count ?? 0,
      total: stats.recent_listing_count ?? 0,
    },
    {
      id: 'top10',
      label: 'Top 10 momentum',
      count: stats.filtered_top10_count ?? stats.top10_count ?? 0,
      total: stats.top10_count ?? 0,
    },
    {
      id: 'all',
      label: 'All tracked',
      count: stats.filtered_all_count ?? stats.cached_stocks ?? stats.total_stocks ?? 0,
      total: stats.cached_stocks ?? stats.total_stocks ?? 0,
    },
  ]

  return (
    <div className="mb-1">
      {/* Page Title & Inline Typographic Market Pulse */}
      <section
        aria-label="Screener heading and NSE market breadth"
        className="flex items-baseline justify-between gap-x-5 gap-y-1.5 flex-wrap mb-2.5"
      >
        <h1 className="font-display text-[24px] sm:text-[26px] font-bold tracking-[-0.03em] leading-[1.15] text-[var(--ink)] m-0">
          {pageTitle}
        </h1>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--ink-muted)] max-w-full">
          <span className="font-medium text-[var(--ink)]">
            NSE close {formatDataDate(stats.latest_data_date)}
          </span>
          {stats.nifty50_trend && (
            <>
              <span aria-hidden="true">·</span>
              <span title={`Nifty 50: ${stats.nifty50_trend}`}>
                {formatRegimeLabel('Nifty 50', stats.nifty50_trend)}
              </span>
            </>
          )}
          {stats.smallmid_trend && (
            <>
              <span aria-hidden="true">·</span>
              <span title={`SmallMid 250: ${stats.smallmid_trend}`}>
                {formatRegimeLabel('SmallMid 250', stats.smallmid_trend)}
              </span>
            </>
          )}
          {newlyAddedCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--accent)] font-medium tabular-nums">
                {newlyAddedCount} new qualified
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-2">
            <span>
              Breadth{' '}
              <span className="text-[var(--up)] font-semibold tabular-nums">
                {(stats.advances_count ?? 0).toLocaleString('en-IN')} up
              </span>{' '}
              /{' '}
              <span className="text-[var(--down)] font-semibold tabular-nums">
                {(stats.declines_count ?? 0).toLocaleString('en-IN')} down
              </span>{' '}
              ({breadthUpPct.toFixed(1)}%)
            </span>
            <span
              className="w-16 h-1.5 bg-[var(--down)] rounded-[2px] overflow-hidden shrink-0 inline-block"
              title={`${breadthUpPct.toFixed(1)}% advancing stocks`}
            >
              <span
                className="block h-full bg-[var(--up)]"
                style={{ width: `${breadthUpPct}%` }}
              />
            </span>
          </span>
        </div>
      </section>

      {/* Connected Horizontal Index Tab Rail */}
      <nav
        aria-label="Screener categories"
        className="flex items-stretch gap-5 sm:gap-6 border-b border-[var(--border)] overflow-x-auto no-scrollbar max-w-full"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={
                tab.count !== tab.total
                  ? `${tab.count.toLocaleString('en-IN')} matching filters out of ${tab.total.toLocaleString('en-IN')} in ${tab.label}`
                  : `${tab.count.toLocaleString('en-IN')} stocks in ${tab.label}`
              }
              className={`inline-flex items-baseline gap-2 py-2.5 px-0.5 border-b-2 -mb-px whitespace-nowrap cursor-pointer bp-transition ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <span className={`text-[14px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
              <span
                className={`font-display text-[18px] font-bold tracking-[-0.02em] tabular-nums ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]'
                }`}
              >
                {Number(tab.count).toLocaleString('en-IN')}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Non-Button Filter Switch Bar & Segmented View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-y-2.5 gap-x-4 py-2.5 min-h-[46px] max-w-full">
        <div
          role="group"
          aria-label="Screener filters"
          className="flex items-center gap-4 sm:gap-[18px] min-w-0 max-w-full overflow-x-auto no-scrollbar"
        >
          <label
            className="bp-switch"
            title="Require today's volume to be at least 1.4x the 50-day average"
          >
            <input
              type="checkbox"
              checked={volumeConfirmedOnly}
              onChange={(e) => setVolumeConfirmedOnly(e.target.checked)}
            />
            <span className="bp-switch-track">
              <span className="bp-switch-thumb" />
            </span>
            <span className="bp-switch-text">Volume ≥ 1.4×</span>
          </label>

          <label
            className={`bp-switch ${isTop10Tab ? 'is-disabled' : ''}`}
            title={
              isTop10Tab
                ? 'Stage 2 stacked moving average alignment is always required on Top 10 momentum'
                : 'Require Stage 2 uptrend above 50 and 200 DMA'
            }
          >
            <input
              type="checkbox"
              disabled={isTop10Tab}
              checked={isTop10Tab ? true : trendOnly}
              onChange={(e) => setTrendOnly(e.target.checked)}
            />
            <span className="bp-switch-track">
              <span className="bp-switch-thumb" />
            </span>
            <span className="bp-switch-text">Stage 2 trend</span>
          </label>

          <label
            className="bp-switch"
            title="Filter only official NSE Futures and Options securities"
          >
            <input
              type="checkbox"
              checked={fnoOnly}
              onChange={(e) => setFnoOnly(e.target.checked)}
            />
            <span className="bp-switch-track">
              <span className="bp-switch-thumb" />
            </span>
            <span className="bp-switch-text">F&amp;O only</span>
          </label>

          <label
            className="bp-switch"
            title="Require Relative Strength rating of 80 or higher"
          >
            <input
              type="checkbox"
              checked={minRs >= 80}
              onChange={(e) => setMinRs && setMinRs(e.target.checked ? 80 : 0)}
            />
            <span className="bp-switch-track">
              <span className="bp-switch-thumb" />
            </span>
            <span className="bp-switch-text">RS ≥ 80</span>
          </label>

          <label
            className="bp-switch"
            title="Show only starred watchlist symbols"
          >
            <input
              type="checkbox"
              checked={watchlistOnly}
              onChange={(e) => setWatchlistOnly && setWatchlistOnly(e.target.checked)}
            />
            <span className="bp-switch-track">
              <span className="bp-switch-thumb" />
            </span>
            <span className="bp-switch-text">
              Watchlist ({watchlistCount})
            </span>
          </label>
        </div>

        <div className="inline-flex items-center gap-3.5 shrink-0">
          <div className="bp-segmented" role="group" aria-label="Workspace layout">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
              className={`bp-seg-btn ${viewMode === 'split' ? 'is-active' : ''}`}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`bp-seg-btn ${viewMode === 'table' ? 'is-active' : ''}`}
            >
              Table
            </button>
          </div>

          <button
            type="button"
            disabled={displayedCount === 0}
            onClick={onExportTradingView}
            title="Export displayed symbols for TradingView watchlist import (.txt)"
            className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-[4px] text-[13px] font-medium bp-transition ${
              displayedCount === 0
                ? 'text-[var(--ink-muted)] opacity-40 cursor-not-allowed'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] cursor-pointer'
            }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Export TV</span>
          </button>
        </div>
      </div>
    </div>
  )
}
