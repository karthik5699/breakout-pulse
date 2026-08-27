import React, { useState, useEffect, useRef } from 'react'
import Navbar from './components/Navbar'
import MarketBanner from './components/MarketBanner'
import ScreenerTabs from './components/ScreenerTabs'
import StockTable from './components/StockTable'
import StockGrid from './components/StockGrid'
import ChartModal from './components/ChartModal'
import CsvUploader from './components/CsvUploader'
import { RefreshCw, CheckCircle2 } from 'lucide-react'

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('breakout_theme') || 'dark'
  })
  const [activeTab, setActiveTab] = useState('ath') // ath, near_52w, recent_listings, all
  const [volumeConfirmedOnly, setVolumeConfirmedOnly] = useState(true) // Default ON
  const [trendOnly, setTrendOnly] = useState(false)
  const [viewMode, setViewMode] = useState('table') // table, grid
  const [searchQuery, setSearchQuery] = useState('')
  
  const [stocks, setStocks] = useState([])
  const [stats, setStats] = useState(null)
  const [scanStatus, setScanStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  
  const [selectedStock, setSelectedStock] = useState(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const wasScanningRef = useRef(false)

  // Sync theme
  useEffect(() => {
    localStorage.setItem('breakout_theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // Fetch universe stats
  const fetchStats = () => {
    fetch('/api/universe-stats')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error('Stats error:', err))
  }

  // Fetch stocks based on active filters
  const fetchStocks = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (activeTab) params.set('tab', activeTab)
    params.set('volume_confirmed_only', volumeConfirmedOnly ? 'true' : 'false')
    params.set('trend_only', trendOnly ? 'true' : 'false')
    if (searchQuery) params.set('search', searchQuery)
    params.set('limit', '250')

    fetch(`/api/stocks?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setStocks(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Stocks fetch error:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchStocks()
  }, [activeTab, volumeConfirmedOnly, trendOnly, searchQuery])

  // Scan status polling and notification triggers
  useEffect(() => {
    const checkStatus = () => {
      fetch('/api/scan-status')
        .then((res) => res.json())
        .then((data) => {
          setScanStatus(data)

          // If scan just started
          if (data.is_scanning && !wasScanningRef.current) {
            wasScanningRef.current = true
            setToast({
              type: 'info',
              message: '🚀 Daily market scan started for NSE universe...'
            })
          }

          // If scan just completed
          if (!data.is_scanning && wasScanningRef.current) {
            wasScanningRef.current = false
            setToast({
              type: 'success',
              message: '✅ Scan complete! Dashboard updated with latest data.'
            })
            setTimeout(() => setToast(null), 6000)
            fetchStats()
            fetchStocks()
          }

          if (data.is_scanning) {
            setTimeout(checkStatus, 1500)
          }
        })
        .catch(() => {})
    }

    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleTriggerScan = async () => {
    try {
      await fetch('/api/scan', { method: 'POST' })
      setScanStatus((prev) => ({ ...prev, is_scanning: true }))
      wasScanningRef.current = true
      setToast({
        type: 'info',
        message: '🚀 Daily market scan started for NSE universe...'
      })
    } catch (err) {
      console.error('Failed to trigger scan:', err)
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900 dark:selection:bg-blue-950 dark:selection:text-blue-200">
      
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
          <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold ${
            toast.type === 'info'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          }`}>
            <div className="flex items-center gap-2">
              {toast.type === 'info' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              <span>{toast.message}</span>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
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
      <footer className="border-t border-surface-border dark:border-surface-dark-border py-6 px-4 text-center text-xs text-muted">
        <p>BreakoutPulse • 52-Week High & All-Time High Momentum Screener</p>
        <p className="mt-1 text-[11px]">Real-time adjusted data via continuous NSE feeds. For educational & trading research purposes.</p>
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
          onClose={() => {
            setIsUploadOpen(false)
            fetchStats()
            fetchStocks()
          }}
        />
      )}

    </div>
  )
}
