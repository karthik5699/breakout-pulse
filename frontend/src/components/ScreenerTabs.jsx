import React from 'react'
import { Flame, ShieldCheck, LayoutGrid, List } from 'lucide-react'

export default function ScreenerTabs({
  activeTab,
  setActiveTab,
  volumeConfirmedOnly,
  setVolumeConfirmedOnly,
  trendOnly,
  setTrendOnly,
  viewMode,
  setViewMode,
  totalResults
}) {
  const tabs = [
    { id: 'ath', label: 'All-Time High (ATH)', emoji: '👑' },
    { id: 'near_52w', label: 'Near 52W High (-10%)', emoji: '🎯' },
    { id: 'recent_listings', label: 'Recent Listings (<2Y)', emoji: '✨' },
    { id: 'all', label: 'All Tracked Stocks', emoji: '📋' }
  ]

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800 font-sans">
      
      {/* Primary Tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
        {tabs.map((t) => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#1E3A8A] text-white shadow-sm font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1d2229]'
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filter Controls & Toggles */}
      <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-between md:justify-end">
        
        {/* Volume Confirmed Default Toggle */}
        <button
          onClick={() => setVolumeConfirmedOnly(!volumeConfirmedOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
            volumeConfirmedOnly
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-white dark:bg-[#161a20] border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          title="Toggle Volume Confirmation (>= 1.4x 50-day average volume)"
        >
          <Flame className={`w-3.5 h-3.5 ${volumeConfirmedOnly ? 'text-amber-600 fill-amber-600 dark:text-amber-400 dark:fill-amber-400' : ''}`} />
          <span>{volumeConfirmedOnly ? 'Volume Confirmed (🔥)' : 'All Volumes (🔥 & ⚠️)'}</span>
        </button>

        {/* Trend Filter Toggle */}
        <button
          onClick={() => setTrendOnly(!trendOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
            trendOnly
              ? 'bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-[#15803D] dark:text-[#22C55E]'
              : 'bg-white dark:bg-[#161a20] border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          title="Filter only stocks with Price > 50 > 200 SMA and Rising 200 SMA"
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${trendOnly ? 'text-[#15803D] dark:text-[#22C55E]' : ''}`} />
          <span>Stage 2 Trend</span>
        </button>

        {/* View Switcher (Table vs Grid) */}
        <div className="flex items-center bg-slate-100 dark:bg-[#1d2229] p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'table' ? 'bg-white dark:bg-[#2a303c] text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
            aria-label="Table View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-white dark:bg-[#2a303c] text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
            aria-label="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

    </div>
  )
}
