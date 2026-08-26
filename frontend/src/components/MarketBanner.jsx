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
      icon: Crown,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10 border-amber-500/30'
    },
    {
      id: 'near_52w',
      label: 'Near 52W High',
      sub: 'Within -10% of 52W High',
      count: stats.near_52w_count || 0,
      icon: Target,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10 border-blue-500/30'
    },
    {
      id: 'recent_listings',
      label: 'Recent Listings',
      sub: 'Near Highs (< 2Y History)',
      count: stats.recent_listing_count || 0,
      icon: Sparkles,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10 border-purple-500/30'
    }
  ]

  const formatDataDate = (dateStr, lastScanned) => {
    // 1. If explicit date string is provided (e.g. '2026-08-26')
    if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthName = months[parseInt(m, 10) - 1] || m
        return `${parseInt(d, 10)} ${monthName} ${y}`
      }
    }
    // 2. Fallback to date from last_scanned
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
    // 3. Current calendar date fallback
    const today = new Date()
    return today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon
          const isActive = activeTab === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`text-left p-4 rounded-2xl border transition-all ${
                isActive
                  ? `${c.bgColor} ring-2 ring-banana shadow-sm scale-[1.01]`
                  : 'bg-surface dark:bg-surface-dark border-surface-border dark:border-surface-dark-border hover:border-gray-300 dark:hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${c.color} flex items-center gap-1.5`}>
                  <Icon className="w-4 h-4" />
                  {c.label}
                </span>
                <span className="text-xl font-bold font-mono text-gray-900 dark:text-white">
                  {c.count}
                </span>
              </div>
              <div className="text-[11px] text-muted truncate">
                {c.sub}
              </div>
            </button>
          )
        })}
      </div>

      {/* Market Health & Volume Stats Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-[#161a20] rounded-xl border border-surface-border dark:border-surface-dark-border text-xs text-muted">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Latest Data Date Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>Latest Market Data:</span>
            <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
              {formatDataDate(stats.latest_data_date, stats.last_scanned)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <Flame className="w-3.5 h-3.5" />
            <span>{stats.confirmed_volume_count || 0} Volume Confirmed Setups (🔥)</span>
          </div>

          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="w-3.5 h-3.5 text-trade-green" />
            <span>Last Scanned:</span>
            <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
              {stats.last_scanned || 'Ready for Scan'}
            </span>
          </div>
        </div>

        <div>
          Universe: <span className="font-semibold text-gray-800 dark:text-gray-200">{stats.cached_stocks} / {stats.total_stocks}</span> NSE stocks tracked
        </div>
      </div>
    </div>
  )
}
