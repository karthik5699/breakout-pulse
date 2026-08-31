import React from 'react'
import { Crown, Target, Flame, Sparkles, Calendar } from 'lucide-react'

export default function MarketBanner({ stats, activeTab, setActiveTab }) {
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
    <div className="mb-6 space-y-3">
      {/* Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          const isActive = activeTab === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                isActive
                  ? 'bg-white dark:bg-[#161D27] border-[#8069BF] shadow-sm ring-1 ring-[#8069BF]/30'
                  : 'bg-white dark:bg-[#111827] border-[#E5E7EB] dark:border-[#1F2937] hover:border-[#8069BF]/40'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                  {c.label}
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isActive
                    ? 'bg-[#8069BF]/10 text-[#8069BF]'
                    : 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#6B7280] dark:text-[#9CA3AF]'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div>
                <div className="text-2xl font-bold tracking-tight tabular-nums text-[#111827] dark:text-[#F9FAFB]">
                  {c.count}
                </div>
                <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 font-normal">
                  {c.sub}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Market Health & Volume Stats Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-[#111827] rounded-xl border border-[#E5E7EB] dark:border-[#1F2937] text-xs text-[#6B7280] dark:text-[#9CA3AF]">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Latest Data Date */}
          <div className="flex items-center gap-1.5 font-normal">
            <Calendar className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Latest Market Data:</span>
            <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">
              {formatDataDate(stats.latest_data_date)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-normal">
            <Flame className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span><strong className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">{stats.confirmed_volume_count || 0}</strong> Volume Confirmed Setups</span>
          </div>
        </div>

        <div className="text-[#6B7280] dark:text-[#9CA3AF] font-normal">
          Universe: <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">{stats.cached_stocks}</span> / <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB]">{stats.total_stocks}</span> NSE stocks tracked
        </div>
      </div>
    </div>
  )
}
