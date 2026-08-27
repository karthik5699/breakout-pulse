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
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/30'
    },
    {
      id: 'near_52w',
      label: 'Near 52W High',
      sub: 'Within -10% of 52W High',
      count: stats.near_52w_count || 0,
      icon: Target,
      color: 'text-[#1E3A8A] dark:text-blue-400',
      bgColor: 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500/30'
    },
    {
      id: 'recent_listings',
      label: 'Recent Listings',
      sub: 'Near Highs (< 2Y History)',
      count: stats.recent_listing_count || 0,
      icon: Sparkles,
      color: 'text-indigo-700 dark:text-indigo-400',
      bgColor: 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-500/30'
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
                  ? `${c.bgColor} ring-2 ring-[#1E3A8A] dark:ring-blue-500 shadow-sm scale-[1.01]`
                  : 'bg-white dark:bg-[#161a20] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${c.color} flex items-center gap-1.5 font-sans`}>
                  <Icon className="w-4 h-4" />
                  {c.label}
                </span>
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {c.count}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-sans">
                {c.sub}
              </div>
            </button>
          )
        })}
      </div>

      {/* Market Health & Volume Stats Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 dark:bg-[#161a20] rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Latest Data Date Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#1E3A8A] dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 font-medium">
            <Calendar className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />
            <span className="font-sans">Latest Market Data:</span>
            <span className="font-mono font-bold text-[#1E3A8A] dark:text-blue-300">
              {formatDataDate(stats.latest_data_date, stats.last_scanned)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium font-sans">
            <Flame className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span><strong className="font-mono">{stats.confirmed_volume_count || 0}</strong> Volume Confirmed Setups (🔥)</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-sans">
            <Clock className="w-3.5 h-3.5 text-[#16A34A] dark:text-[#22C55E]" />
            <span>Last Scanned:</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {stats.last_scanned || 'Ready for Scan'}
            </span>
          </div>
        </div>

        <div className="font-sans text-slate-600 dark:text-slate-400">
          Universe: <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{stats.cached_stocks}</span> / <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{stats.total_stocks}</span> NSE stocks tracked
        </div>
      </div>
    </div>
  )
}
