import React from 'react'
import { Crown, Target, Flame, Sparkles, Clock, Calendar } from 'lucide-react'

export default function MarketBanner({ stats, activeTab, setActiveTab }) {
  if (!stats) return null

  const cards = [
    {
      id: 'ath',
      label: 'All-Time High (ATH)',
      sub: 'Within ±5% of ATH',
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

  const formatDataDate = (dateStr, lastScanned) => {
    if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthName = months[parseInt(m, 10) - 1] || m
        return `${parseInt(d, 10)} ${monthName} ${y}`
      }
    }
    if (lastScanned && typeof lastScanned === 'string' && lastScanned.includes('-')) {
      const datePart = lastScanned.split(' ')[0]
      const parts = datePart.split('-')
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
    <div className="mb-6 space-y-3 font-sans">
      {/* Cards Row - Minimalist Neutral Architecture */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          const isActive = activeTab === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`text-left p-4 rounded-2xl transition-all border ${
                isActive
                  ? 'bg-[#F3F4F6] dark:bg-[#1F2937] border-transparent shadow-none'
                  : 'bg-white dark:bg-[#111827] border-[#E5E7EB] dark:border-[#1F2937] hover:border-[#D1D5DB] dark:hover:border-[#374151]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                  isActive ? 'text-[#111827] dark:text-[#F9FAFB]' : 'text-[#6B7280] dark:text-[#9CA3AF]'
                }`}>
                  <Icon className="w-4 h-4 text-[#9CA3AF]" />
                  {c.label}
                </span>
                <span className="text-xl font-bold font-mono text-[#111827] dark:text-[#F9FAFB]">
                  {c.count}
                </span>
              </div>
              <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] truncate font-normal">
                {c.sub}
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
            <span className="font-mono font-bold text-[#111827] dark:text-[#F9FAFB]">
              {formatDataDate(stats.latest_data_date, stats.last_scanned)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-normal">
            <Flame className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span><strong className="font-mono font-bold text-[#111827] dark:text-[#F9FAFB]">{stats.confirmed_volume_count || 0}</strong> Volume Confirmed Setups</span>
          </div>

          <div className="flex items-center gap-1.5 font-normal">
            <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Last Scanned:</span>
            <span className="font-mono font-semibold text-[#111827] dark:text-[#F9FAFB]">
              {stats.last_scanned || 'Ready for Scan'}
            </span>
          </div>
        </div>

        <div className="text-[#6B7280] dark:text-[#9CA3AF]">
          Universe: <span className="font-mono font-semibold text-[#111827] dark:text-[#F9FAFB]">{stats.cached_stocks}</span> / <span className="font-mono font-semibold text-[#111827] dark:text-[#F9FAFB]">{stats.total_stocks}</span> NSE stocks tracked
        </div>
      </div>
    </div>
  )
}
