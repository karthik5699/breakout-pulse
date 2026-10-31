import React from 'react'
import { Crown, Target, Flame, Sparkles, Calendar, Trophy, ShieldCheck, Layers, LayoutGrid, List } from 'lucide-react'

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
  viewMode,
  setViewMode
}) {
  if (!stats) return null

  const cards = [
    {
      id: 'ath',
      label: 'All-Time High (ATH)',
      sub: 'Within ±10% of ATH',
      count: stats.near_ath_count || 0,
      icon: Crown
    },
    {
      id: 'near_52w',
      label: 'Near 52W High',
      sub: 'Within -10% of 52W High',
      count: stats.near_52w_count || 0,
      icon: Target
    },
    {
      id: 'recent_listings',
      label: 'Recent Listings',
      sub: 'Near Highs (< 2Y History)',
      count: stats.recent_listing_count || 0,
      icon: Sparkles
    },
    {
      id: 'top10',
      label: 'Top 10 Momentum',
      sub: 'Stacked MA • ADX > 25 • RSI 55–75',
      count: stats.top10_count || 0,
      icon: Trophy
    }
  ]

  const formatDataDate = (dateStr) => {
    if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthName = months[parseInt(m, 10) - 1] || m
        return `${parseInt(d, 10)} ${monthName} ${y}`
      }
    }
    const today = new Date()
    return today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="mb-5 space-y-4">
      {/* Compact 4-Column Primary View Switcher Row */}
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {cards.map((c) => {
          const Icon = c.icon
          const isActive = activeTab === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`px-4 py-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 ${
                isActive
                  ? 'bg-white dark:bg-[#161D27] border-[#8069BF] shadow-xs ring-1 ring-[#8069BF]/30'
                  : 'bg-white dark:bg-[#111827] border-[#E5E7EB] dark:border-[#1F2937] hover:border-[#8069BF]/40'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight tabular-nums text-[#111827] dark:text-[#F9FAFB] leading-none">
                    {c.count}
                  </span>
                  <span className={`text-xs font-semibold truncate ${
                    isActive ? 'text-[#111827] dark:text-[#F9FAFB]' : 'text-[#6B7280] dark:text-[#9CA3AF]'
                  }`}>
                    {c.label}
                  </span>
                </div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] mt-1 font-normal truncate">
                  {c.sub}
                </div>
              </div>

              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isActive
                  ? 'bg-[#8069BF]/15 text-[#8069BF]'
                  : 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
              }`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </button>
          )
        })}
      </div>

      {/* Unified Market Metadata & Filter Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-[#111827] rounded-xl border border-[#E5E7EB] dark:border-[#1F2937] text-xs text-[#6B7280] dark:text-[#9CA3AF]">
        <div className="flex items-center gap-3.5 flex-wrap">
          {/* Latest Data Date */}
          <div className="flex items-center gap-1.5 font-normal">
            <Calendar className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Latest Data:</span>
            <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">
              {formatDataDate(stats.latest_data_date)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-normal">
            <Flame className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>
              <strong className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">
                {stats.confirmed_volume_count || 0}
              </strong>{' '}
              Vol Confirmed
            </span>
          </div>

          {newlyAddedCount > 0 && (
            <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md text-[11px]">
              <Sparkles className="w-3 h-3 fill-amber-500/20" />
              <span>
                <strong className="font-semibold tabular-nums">{newlyAddedCount}</strong> New Joined
              </span>
            </div>
          )}

          <button
            onClick={() => setActiveTab(activeTab === 'all' ? 'ath' : 'all')}
            className={`px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#8069BF]/15 text-[#8069BF] dark:text-[#A78BFA] font-semibold ring-1 ring-[#8069BF]/30'
                : 'hover:text-[#111827] dark:hover:text-[#F9FAFB]'
            }`}
            title="Click to view all tracked NSE stocks"
          >
            Universe:{' '}
            <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">
              {stats.total_stocks}
            </span>{' '}
            tracked
          </button>
        </div>

        {/* Filter Controls & View Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Volume Confirmed Toggle */}
          <button
            onClick={() => setVolumeConfirmedOnly(!volumeConfirmedOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all border cursor-pointer ${
              volumeConfirmedOnly
                ? 'bg-[#16A34A]/10 dark:bg-[#22C55E]/15 text-[#16A34A] dark:text-[#22C55E] font-semibold border-[#16A34A]/30'
                : 'bg-transparent text-[#6B7280] dark:text-[#9CA3AF] border-[#E5E7EB] dark:border-[#374151] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
            }`}
            title="Toggle Volume Confirmation (>= 1.4x 50-day average volume)"
          >
            <Flame className={`w-3.5 h-3.5 ${volumeConfirmedOnly ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#9CA3AF]'}`} />
            <span>Volume Confirmed</span>
          </button>

          {/* Stage 2 Trend Filter Toggle */}
          <button
            onClick={() => setTrendOnly(!trendOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all border cursor-pointer ${
              trendOnly
                ? 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#111827] dark:text-[#F9FAFB] font-semibold border-[#D1D5DB] dark:border-[#374151]'
                : 'bg-transparent text-[#6B7280] dark:text-[#9CA3AF] border-[#E5E7EB] dark:border-[#374151] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
            }`}
            title="Filter only stocks with Price > 50 > 200 SMA and Rising 200 SMA"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Stage 2 Trend</span>
          </button>

          {/* F&O Filter Toggle */}
          <button
            onClick={() => setFnoOnly(!fnoOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all border cursor-pointer ${
              fnoOnly
                ? 'bg-[#8069BF]/15 text-[#8069BF] dark:text-[#A78BFA] font-semibold border-[#8069BF]/40'
                : 'bg-transparent text-[#6B7280] dark:text-[#9CA3AF] border-[#E5E7EB] dark:border-[#374151] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
            }`}
            title="Filter only official NSE Futures & Options (F&O) stocks"
          >
            <Layers className={`w-3.5 h-3.5 ${fnoOnly ? 'text-[#8069BF] dark:text-[#A78BFA]' : 'text-[#9CA3AF]'}`} />
            <span>F&O Only</span>
          </button>

          {/* View Switcher (Table vs Grid) */}
          <div className="flex items-center bg-[#F3F4F6] dark:bg-[#1F2937] p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-[#111827] text-[#111827] dark:text-[#F9FAFB] shadow-xs font-bold'
                  : 'text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
              }`}
              aria-label="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-[#111827] text-[#111827] dark:text-[#F9FAFB] shadow-xs font-bold'
                  : 'text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
              }`}
              aria-label="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
