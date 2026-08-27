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
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#161a20]/95 backdrop-blur border-b border-surface-border dark:border-surface-dark-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('near_52w')}
            className="flex items-center gap-3 text-left focus:outline-none group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] dark:from-[#1E3A8A] dark:to-[#3B82F6] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <div className="font-sans font-bold text-lg tracking-tight flex items-center gap-1 text-slate-900 dark:text-slate-100">
                Breakout<span className="text-[#1E3A8A] dark:text-[#60A5FA]">Pulse</span>
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tracking-tight">
                52W High & ATH Momentum Screener (NSE)
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search NSE ticker or company (e.g. TRENT, DIXON, BEL)..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-[#1d2229] border border-transparent focus:border-[#1E3A8A] dark:focus:border-blue-500 rounded-xl focus:outline-none text-slate-900 dark:text-white transition-all font-sans"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
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
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : 'bg-[#1E3A8A] hover:bg-[#1E40AF] dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-sm active:scale-95'
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
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1d2229] hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Manage NSE Stock Universe CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">NSE Universe</span>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1d2229] rounded-xl transition-colors"
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      </div>
    </header>
  )
}
