import React, { useState, useEffect, useRef, useMemo } from 'react'
import Navbar from './components/Navbar'
import MarketBanner from './components/MarketBanner'
import ScreenerTabs from './components/ScreenerTabs'
import StockTable from './components/StockTable'
import StockGrid from './components/StockGrid'
import ChartModal from './components/ChartModal'
import CsvUploader from './components/CsvUploader'
import WhatsAppModal from './components/WhatsAppModal'
import { CheckCircle2, Info } from 'lucide-react'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [activeTab, setActiveTab] = useState('ath')
  const [volumeConfirmedOnly, setVolumeConfirmedOnly] = useState(true)
  const [trendOnly, setTrendOnly] = useState(true)
  const [fnoOnly, setFnoOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table')

  const [sortField, setSortField] = useState('vol_multiple')
  const [sortAsc, setSortAsc] = useState(false)

  const [stocks, setStocks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [toast, setToast] = useState(null)

  const wasScanningRef = useRef(false)
  const stocksAbortRef = useRef(null)
  const toastTimerRef = useRef(null)

  // Debounce search input so we don't fire a request on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Manage Dark Mode class on document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Show a toast, optionally auto-dismissing it (clears any previous pending dismissal)
  const showToast = (nextToast, autoHideMs) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToast(nextToast)
    if (autoHideMs) {
      toastTimerRef.current = setTimeout(() => {
        setToast(null)
        toastTimerRef.current = null
      }, autoHideMs)
    }
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    if (stocksAbortRef.current) stocksAbortRef.current.abort()
  }, [])

  // Fetch universe statistics
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/universe-stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to fetch universe stats:', err)
    }
  }

  // Fetch stocks according to current filters
  const fetchStocks = async () => {
    if (stocksAbortRef.current) stocksAbortRef.current.abort()
    const controller = new AbortController()
    stocksAbortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        tab: activeTab,
        volume_confirmed_only: volumeConfirmedOnly,
        trend_only: trendOnly,
        fno_only: fnoOnly,
      })
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim())
      }

      const res = await fetch(`/api/stocks?${params.toString()}`, { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        if (!controller.signal.aborted) setStocks(data)
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Failed to fetch stocks:', err)
    } finally {
      if (stocksAbortRef.current === controller) setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchStocks()
  }, [activeTab, volumeConfirmedOnly, trendOnly, fnoOnly, debouncedSearch])

  const handleSortChange = (field) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  // Unified sorted stock list shared between Table, Grid, and ChartModal keyboard navigation
  const sortedStocks = useMemo(() => {
    if (!stocks || stocks.length === 0) return []
    return [...stocks].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]
      if (valA === undefined || valA === null) valA = -999999
      if (valB === undefined || valB === null) valB = -999999
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? valA - valB : valB - valA
    })
  }, [stocks, sortField, sortAsc])

  // Scan trigger and notification handling
  const handleTriggerScan = async () => {
    if (wasScanningRef.current) return
    wasScanningRef.current = true
    setScanStatus({ is_scanning: true })
    try {
      showToast({
        type: 'info',
        message: 'Checking official NSE servers for latest market data...',
      })
      const res = await fetch('/api/scan', { method: 'POST' })
      const data = await res.json()

      await fetchStats()
      await fetchStocks()

      if (data.status === 'success' || data.is_today_available || (data.stocks_updated && data.stocks_updated > 0)) {
        showToast(
          {
            type: 'success',
            message: data.message || 'Official NSE Bhavcopy successfully downloaded and loaded!',
          },
          8000
        )
      } else {
        showToast(
          {
            type: 'info',
            message: data.message || 'Displaying latest available session data.',
          },
          8000
        )
      }
    } catch (err) {
      console.error('Failed to trigger scan:', err)
      showToast(
        {
          type: 'info',
          message: 'Could not complete Bhavcopy check.',
        },
        5000
      )
    } finally {
      wasScanningRef.current = false
      setScanStatus({ is_scanning: false })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0B0F17] text-[#111827] dark:text-[#F9FAFB] selection:bg-gray-200 selection:text-black dark:selection:bg-gray-800 dark:selection:text-white">
      {/* Top Navbar */}
      <Navbar
        theme={theme}
        setTheme={setTheme}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
        onTriggerScan={handleTriggerScan}
        scanStatus={scanStatus}
      />

      {/* Real-time Notification Banner / Toast */}
      {toast && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 w-full animate-fade-in">
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-medium ${
              toast.type === 'info'
                ? 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#111827] dark:text-[#F9FAFB]'
                : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900/40 text-[#16A34A] dark:text-[#22C55E]'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'info' ? (
                <Info className="w-4 h-4 text-[#8069BF] shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] dark:text-[#22C55E] shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {/* Market Overview & Distribution Cards */}
        <MarketBanner stats={stats} activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Screener Tabs & Controls */}
        <ScreenerTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          volumeConfirmedOnly={volumeConfirmedOnly}
          setVolumeConfirmedOnly={setVolumeConfirmedOnly}
          trendOnly={trendOnly}
          setTrendOnly={setTrendOnly}
          fnoOnly={fnoOnly}
          setFnoOnly={setFnoOnly}
          viewMode={viewMode}
          setViewMode={setViewMode}
          totalResults={sortedStocks.length}
        />

        {/* Results List (Table or Grid) */}
        {viewMode === 'table' ? (
          <StockTable
            stocks={sortedStocks}
            onSelectStock={(sym) => setSelectedStock(sym)}
            selectedSymbol={selectedStock}
            loading={loading}
            sortField={sortField}
            sortAsc={sortAsc}
            onSortChange={handleSortChange}
          />
        ) : (
          <StockGrid
            stocks={sortedStocks}
            onSelectStock={(sym) => setSelectedStock(sym)}
            selectedSymbol={selectedStock}
            loading={loading}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] dark:border-[#1F2937] py-6 px-4 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF]">
        <p className="font-normal">
          <span className="font-semibold text-[#8069BF]">Breakout</span>
          <span className="text-[#6B7280] dark:text-[#9CA3AF]">Pulse</span> • 52-Week High & All-Time High Momentum Screener
        </p>
        <p className="mt-1 text-[11px]">Continuously adjusted NSE equities data for quantitative trading research.</p>
      </footer>

      {/* Interactive Chart Modal with Keyboard Navigation */}
      {selectedStock && (
        <ChartModal
          symbol={selectedStock}
          stocks={sortedStocks}
          onSelectStock={(sym) => setSelectedStock(sym)}
          onClose={() => setSelectedStock(null)}
          theme={theme}
        />
      )}

      {/* Persistent Universe CSV Uploader Modal */}
      {isUploadOpen && (
        <CsvUploader
          isOpen={isUploadOpen}
          onClose={() => {
            setIsUploadOpen(false)
            fetchStats()
            fetchStocks()
          }}
          stats={stats}
        />
      )}

      {/* WhatsApp Breakout Digest & Alerts Modal */}
      {isWhatsAppOpen && (
        <WhatsAppModal
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          onShowToast={showToast}
        />
      )}
    </div>
  )
}
