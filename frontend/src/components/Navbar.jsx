import React from 'react'
import { Sun, Moon, RefreshCw, Upload, Search } from 'lucide-react'

export default function Navbar({
  theme,
  setTheme,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onOpenUpload,
  onTriggerScan,
  scanStatus
}) {
  const isDark = theme === 'dark'

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111827]/95 backdrop-blur border-b border-[#E5E7EB] dark:border-[#1F2937] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand: Institutional Geometric Logomark & Wordmark */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('near_52w')}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
          >
            {/* VCP Geometric Logomark */}
            <div className="w-8 h-8 rounded-lg bg-[#8069BF] text-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5">
                <path 
                  d="M3 17L7 8L11 15L15 10L18 13L21 5" 
                  stroke="currentColor" 
                  strokeWidth="2.2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              {/* Wordmark: Breakout (#8069BF, SemiBold 600) + Pulse (Regular 400, Muted Gray) */}
              <div className="flex items-baseline text-lg tracking-tight leading-none">
                <span className="font-semibold text-[#8069BF]">Breakout</span>
                <span className="font-normal text-[#6B7280] dark:text-[#9CA3AF]">Pulse</span>
              </div>
              <div className="text-[11px] font-normal text-[#6B7280] dark:text-[#9CA3AF] tracking-tight mt-0.5">
                52W High & ATH Momentum Screener (NSE)
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search NSE ticker or company (e.g. TRENT, DIXON, BEL)..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-[#F9FAFB] dark:bg-[#1F2937] border border-transparent focus:border-[#8069BF] dark:focus:border-[#8069BF] rounded-xl focus:outline-none text-[#111827] dark:text-[#F9FAFB] placeholder:text-[#6B7280] dark:placeholder:text-[#9CA3AF] transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          
          {/* Action Button: #8069BF */}
          <button
            onClick={onTriggerScan}
            disabled={scanStatus?.is_scanning}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              scanStatus?.is_scanning
                ? 'bg-[#E5E7EB] dark:bg-[#1F2937] text-[#9CA3AF] cursor-not-allowed'
                : 'bg-[#8069BF] hover:bg-[#7259B4] text-white shadow-xs active:scale-95'
            }`}
            title="Scan universe with latest daily close"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanStatus?.is_scanning ? 'animate-spin text-[#9CA3AF]' : 'text-white'}`} />
            <span className="hidden sm:inline">
              {scanStatus?.is_scanning 
                ? `Scanning (${scanStatus.progress}/${scanStatus.total})` 
                : 'Scan Market'}
            </span>
          </button>

          {/* Upload CSV */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111827] dark:text-[#F9FAFB] bg-[#F9FAFB] dark:bg-[#1F2937] hover:bg-[#E5E7EB] dark:hover:bg-[#374151] rounded-xl transition-colors border border-[#E5E7EB] dark:border-[#374151]"
            title="Manage NSE Stock Universe CSV"
          >
            <Upload className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span className="hidden sm:inline">NSE Universe</span>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB] hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] rounded-xl transition-colors"
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-[#9CA3AF]" /> : <Moon className="w-4 h-4 text-[#6B7280]" />}
          </button>
        </div>
      </div>
    </header>
  )
}
