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
    { id: 'ath', label: 'All-Time High (ATH)' },
    { id: 'near_52w', label: 'Near 52W High (-10%)' },
    { id: 'recent_listings', label: 'Recent Listings (<2Y)' },
    { id: 'all', label: 'All Tracked Stocks' }
  ]

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 pb-3 border-b border-[#E5E7EB] dark:border-[#1F2937] font-sans">
      
      {/* Primary Tab Navigation - Quartr Style Ghosting */}
      <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
        {tabs.map((t) => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs rounded-xl whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#111827] dark:text-[#F9FAFB] font-bold shadow-none'
                  : 'text-[#6B7280] dark:text-[#9CA3AF] font-medium hover:text-[#111827] dark:hover:text-[#F9FAFB] hover:bg-gray-50 dark:hover:bg-[#161D27]'
              }`}
            >
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
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-all border ${
            volumeConfirmedOnly
              ? 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#111827] dark:text-[#F9FAFB] font-bold border-transparent'
              : 'bg-transparent text-[#6B7280] dark:text-[#9CA3AF] border-[#E5E7EB] dark:border-[#374151] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
          }`}
          title="Toggle Volume Confirmation (>= 1.4x 50-day average volume)"
        >
          <Flame className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <span>Volume Confirmed</span>
        </button>

        {/* Trend Filter Toggle */}
        <button
          onClick={() => setTrendOnly(!trendOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-all border ${
            trendOnly
              ? 'bg-[#F3F4F6] dark:bg-[#1F2937] text-[#111827] dark:text-[#F9FAFB] font-bold border-transparent'
              : 'bg-transparent text-[#6B7280] dark:text-[#9CA3AF] border-[#E5E7EB] dark:border-[#374151] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
          }`}
          title="Filter only stocks with Price > 50 > 200 SMA and Rising 200 SMA"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <span>Stage 2 Trend</span>
        </button>

        {/* View Switcher (Table vs Grid) */}
        <div className="flex items-center bg-[#F3F4F6] dark:bg-[#1F2937] p-0.5 rounded-xl">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'table' ? 'bg-white dark:bg-[#111827] text-[#111827] dark:text-[#F9FAFB] shadow-xs font-bold' : 'text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
            }`}
            aria-label="Table View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-white dark:bg-[#111827] text-[#111827] dark:text-[#F9FAFB] shadow-xs font-bold' : 'text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
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
