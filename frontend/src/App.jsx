import React, { useState, useEffect, useRef } from 'react'
import Navbar from './components/Navbar'
import MarketBanner from './components/MarketBanner'
import ScreenerTabs from './components/ScreenerTabs'
import StockTable from './components/StockTable'
import StockGrid from './components/StockGrid'
import ChartModal from './components/ChartModal'
import CsvUploader from './components/CsvUploader'
import { RefreshCw, CheckCircle2, Info } from 'lucide-react'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [activeTab, setActiveTab] = useState('near_52w')
  const [volumeConfirmedOnly, setVolumeConfirmedOnly] = useState(true)
  const [trendOnly, setTrendOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table')
  
  const [stocks, setStocks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedStock, setSelectedStock] = useState(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [toast, setToast] = useState(null)

  const wasScanningRef = useRef(false)

  // Manage Dark Mode class on document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

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
    setLoading(true)
    try {
      const params = new URLSearchParams({
        tab: activeTab,
        volume_confirmed_only: volumeConfirmedOnly,
        trend_only: trendOnly,
      })
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }

      const res = await fetch(`/api/stocks?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setStocks(data)
      }
    } catch (err) {
      console.error('Failed to fetch stocks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchStocks()
  }, [activeTab, volumeConfirmedOnly, trendOnly, searchQuery])

  // Scan status polling and notification triggers
  const handleTriggerScan = async () => {
    try {
      setToast({
        type: 'info',
        message: "Checking official NSE servers for today's Bhavcopy..."
      })
      const res = await fetch('/api/scan', { method: 'POST' })
      const data = await res.json()
      
      await fetchStats()
      await fetchStocks()

      if (data.is_today_available) {
        setToast({
          type: 'success',
          message: data.message || "Today's official NSE Bhavcopy successfully downloaded and loaded!"
        })
      } else {
        setToast({
          type: 'info',
          message: data.message || "Today's official Bhavcopy is not yet released by NSE (typically published around 3:45 PM – 4:30 PM IST). Displaying latest available session data."
        })
      }
      setTimeout(() => setToast(null), 8000)
    } catch (err) {
      console.error('Failed to trigger scan:', err)
      setToast({
        type: 'info',
        message: 'Could not complete Bhavcopy check.'
      })
      setTimeout(() => setToast(null), 5000)
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
        onTriggerScan={handleTriggerScan}
        scanStatus={scanStatus}
      />

      {/* Real-time Notification Banner / Toast */}
      {toast && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 w-full animate-fade-in">
          <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-medium ${
            toast.type === 'info'
              ? 'bg-[#F9FAFB] dark:bg-[#161D27] border-[#E5E7EB] dark:border-[#1F2937] text-[#111827] dark:text-[#F9FAFB]'
              : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900/40 text-[#16A34A] dark:text-[#22C55E]'
          }`}>
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
        <MarketBanner
          stats={stats}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Screener Tabs & Controls */}
        <ScreenerTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          volumeConfirmedOnly={volumeConfirmedOnly}
          setVolumeConfirmedOnly={setVolumeConfirmedOnly}
          trendOnly={trendOnly}
          setTrendOnly={setTrendOnly}
          viewMode={viewMode}
          setViewMode={setViewMode}
          totalResults={stocks.length}
        />

        {/* Results List (Table or Grid) */}
        {viewMode === 'table' ? (
          <StockTable
            stocks={stocks}
            onSelectStock={(sym) => setSelectedStock(sym)}
            loading={loading}
          />
        ) : (
          <StockGrid
            stocks={stocks}
            onSelectStock={(sym) => setSelectedStock(sym)}
            loading={loading}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] dark:border-[#1F2937] py-6 px-4 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF]">
        <p className="font-normal">
          <span className="font-semibold text-[#8069BF]">Breakout</span><span className="text-[#6B7280] dark:text-[#9CA3AF]">Pulse</span> • 52-Week High & All-Time High Momentum Screener
        </p>
        <p className="mt-1 text-[11px]">Continuously adjusted NSE equities data for quantitative trading research.</p>
      </footer>

      {/* Interactive Chart Modal */}
      {selectedStock && (
        <ChartModal
          symbol={selectedStock}
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

    </div>
  )
}
