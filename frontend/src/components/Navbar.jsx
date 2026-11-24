import React from 'react'
import { Sun, Moon, RefreshCw, Search } from 'lucide-react'

export default function Navbar({
  theme,
  setTheme,
  onSelectHome,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  onOpenUpload,
  onTriggerScan,
  scanStatus,
  totalStocks = 0,
}) {
  const isDark = theme === 'dark'
  const totalDisplay = totalStocks > 0 ? totalStocks.toLocaleString('en-IN') : '2,553'

  return (
    <header className="sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(220px,380px)_auto] items-center gap-x-2 sm:gap-x-5 gap-y-2.5 py-2.5 md:py-0 md:h-[56px]">
        {/* Brand Wordmark */}
        <button
          type="button"
          onClick={onSelectHome}
          className="col-start-1 row-start-1 inline-flex items-center gap-2 sm:gap-2.5 text-left text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-[6px] cursor-pointer whitespace-nowrap justify-self-start"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 block"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" />
            <path
              d="M6.5 14.5L10.2 10.8L13.1 13.4L17.5 8.5"
              stroke="#FFFFFF"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14.5 8.5H17.5V11.5"
              stroke="#FFFFFF"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-[20px] font-extrabold tracking-[-0.03em] leading-none">
            BreakoutPulse
          </span>
        </button>

        {/* Global Search Input */}
        <div className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1 relative flex items-center w-full justify-self-center">
          <Search
            className="w-[15px] h-[15px] text-[var(--ink-muted)] absolute left-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${totalDisplay} NSE equities...`}
            aria-label="Search NSE equities"
            className="w-full h-[36px] pl-9 pr-12 text-[14px] text-[var(--ink)] bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[6px] outline-none placeholder:text-[var(--ink-muted)] bp-transition"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer bp-transition"
            >
              Clear
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="absolute right-3 text-[13px] text-[var(--ink-muted)] pointer-events-none"
            >
              /
            </span>
          )}
        </div>

        {/* Right Utility Links & Primary CTA */}
        <div className="col-start-2 row-start-1 md:col-start-3 inline-flex items-center gap-2 sm:gap-3.5 justify-self-end whitespace-nowrap">
          <button
            type="button"
            onClick={onOpenUpload}
            className="hidden sm:inline-flex items-center px-2 py-1.5 rounded-[5px] text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] bp-transition cursor-pointer"
            title="Import NSE Bhavcopy archive or stock universe CSV"
          >
            Import data
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to Daylight Broadsheet light theme' : 'Switch to Marine-Ink dark theme'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[6px] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] bp-transition cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onTriggerScan}
            disabled={scanStatus?.is_scanning}
            title={scanStatus?.current_symbol || 'Scan official NSE Bhavcopy for latest session'}
            className={`inline-flex items-center gap-2 h-[34px] sm:h-[36px] px-3 sm:px-4 rounded-[6px] text-[13px] sm:text-[14px] font-semibold bp-transition ${
              scanStatus?.is_scanning
                ? 'bg-[var(--surface-subtle)] text-[var(--ink-muted)] border border-[var(--border)] cursor-not-allowed'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white active:translate-y-[1px] cursor-pointer'
            }`}
          >
            {scanStatus?.is_scanning && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            )}
            <span>
              {scanStatus?.is_scanning
                ? scanStatus.total > 1
                  ? `Scanning (${scanStatus.progress}/${scanStatus.total})`
                  : 'Scanning...'
                : 'Scan market'}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
