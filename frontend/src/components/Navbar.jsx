import React from 'react'
import { Sun, Moon, RefreshCw, Upload, Search, Zap, Layers, BarChart2 } from 'lucide-react'

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
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#161a20]/95 backdrop-blur border-b border-surface-border dark:border-surface-dark-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('near_52w')}
            className="flex items-center gap-3 text-left focus:outline-none group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-banana to-banana-dark flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <div className="font-display font-bold text-lg tracking-tight flex items-center gap-1 text-[#1a1a17] dark:text-[#e8eaed]">
                Breakout<span className="text-trade-green dark:text-[#3ecf7d]">Pulse</span>
              </div>
              <div className="text-[11px] font-medium text-muted tracking-tight">
                52W High & ATH Momentum Screener (NSE)
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search NSE ticker or company (e.g. TRENT, DIXON, BEL)..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-[#1d2229] border border-transparent focus:border-banana rounded-xl focus:outline-none dark:text-white transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          
          {/* Scan Now Button */}
          <button
            onClick={onTriggerScan}
            disabled={scanStatus?.is_scanning}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
              scanStatus?.is_scanning
                ? 'bg-banana-soft text-banana-ink cursor-not-allowed'
                : 'bg-banana hover:bg-banana-dark text-black shadow-sm active:scale-95'
            }`}
            title="Scan universe with latest daily close"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanStatus?.is_scanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {scanStatus?.is_scanning 
                ? `Scanning (${scanStatus.progress}/${scanStatus.total})` 
                : 'Scan Market'}
            </span>
          </button>

          {/* Upload CSV */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#1d2229] hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors"
            title="Manage NSE Stock Universe CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">NSE Universe</span>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1d2229] rounded-xl transition-colors"
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-banana" /> : <Moon className="w-4 h-4 text-gray-700" />}
          </button>
        </div>
      </div>
    </header>
  )
}
