import React, { useState, useEffect, useRef, useMemo } from 'react'
import Navbar from './components/Navbar'
import MarketBanner from './components/MarketBanner'
import StockTable from './components/StockTable'
import StockInspector from './components/StockInspector'
import ChartModal from './components/ChartModal'
import CsvUploader from './components/CsvUploader'
import { CheckCircle2, Info, AlertCircle, RotateCcw } from 'lucide-react'

const VALID_TABS = new Set(['ath', 'near_52w', 'recent_listings', 'top10', 'all'])
const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function getInitialTheme() {
  try {
    const sp = new URLSearchParams(window.location.search)
    const qt = sp.get('theme')
    if (qt === 'dark' || qt === 'light') return qt
    const saved = localStorage.getItem('bp_theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {}
  return 'light'
}

function parseInitialParams() {
  const sp = new URLSearchParams(window.location.search)
  const rawTab = sp.get('tab') || 'ath'
  const tab = VALID_TABS.has(rawTab) ? rawTab : 'ath'
  const vcParam = sp.get('vc')
  const defaultVc = tab !== 'top10' && tab !== 'all'
  const vc = vcParam === '1' ? true : vcParam === '0' ? false : defaultVc
  const trend = sp.get('trend') === '0' ? false : true
  const fno = sp.get('fno') === '1'
  const rsRaw = parseInt(sp.get('rs') || '0', 10)
  const minRs = Number.isFinite(rsRaw) && rsRaw > 0 ? rsRaw : 0
  const wl = sp.get('wl') === '1'
  const q = sp.get('q') || ''
  const symbol = sp.get('symbol') || null
  const view = sp.get('view') === 'table' ? 'table' : 'split'
  return { tab, vc, trend, fno, minRs, wl, q, symbol, view }
}

export default function App() {
  const initial = useMemo(() => parseInitialParams(), [])

  const [theme, setTheme] = useState(getInitialTheme)
  const [activeTab, setActiveTab] = useState(initial.tab)
  const [volumeConfirmedOnly, setVolumeConfirmedOnly] = useState(initial.vc)
  const [trendOnly, setTrendOnly] = useState(initial.trend)
  const [fnoOnly, setFnoOnly] = useState(initial.fno)
  const [minRs, setMinRs] = useState(initial.minRs)
  const [watchlistOnly, setWatchlistOnly] = useState(initial.wl)
  const [searchQuery, setSearchQuery] = useState(initial.q)
  const [viewMode, setViewMode] = useState(initial.view)

  const [sortField, setSortField] = useState(
    initial.tab === 'top10' ? 'composite_score' : 'vol_multiple'
  )
  const [sortAsc, setSortAsc] = useState(false)

  const [stocks, setStocks] = useState([])
  const [totalMatchingCount, setTotalMatchingCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [activeSymbol, setActiveSymbol] = useState(initial.symbol)
  const [modalSymbol, setModalSymbol] = useState(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  const [toast, setToast] = useState(null)
  const [newlyAddedSymbols, setNewlyAddedSymbols] = useState(new Set())
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bp_watchlist') || '[]')
      return new Set(Array.isArray(saved) ? saved : [])
    } catch {
      return new Set()
    }
  })

  const lastBreakoutVcRef = useRef(
    initial.tab !== 'top10' && initial.tab !== 'all' ? initial.vc : true
  )
  const wasScanningRef = useRef(false)
  const stocksAbortRef = useRef(null)
  const statsAbortRef = useRef(null)
  const toastTimerRef = useRef(null)
  const scanPollTimerRef = useRef(null)
  const searchInputRef = useRef(null)

  const [debouncedSearch, setDebouncedSearch] = useState(initial.q)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem('bp_theme', theme)
    } catch {}
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem('bp_watchlist', JSON.stringify(Array.from(watchlist)))
    } catch {}
  }, [watchlist])

  useEffect(() => {
    const sp = new URLSearchParams()
    if (activeTab && activeTab !== 'ath') sp.set('tab', activeTab)
    sp.set('vc', volumeConfirmedOnly ? '1' : '0')
    if (!trendOnly) sp.set('trend', '0')
    if (fnoOnly) sp.set('fno', '1')
    if (minRs > 0) sp.set('rs', String(minRs))
    if (watchlistOnly) sp.set('wl', '1')
    if (viewMode === 'table') sp.set('view', 'table')
    if (debouncedSearch.trim()) sp.set('q', debouncedSearch.trim())
    if (activeSymbol) sp.set('symbol', activeSymbol)

    const qs = sp.toString()
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', nextUrl)
  }, [activeTab, volumeConfirmedOnly, trendOnly, fnoOnly, minRs, watchlistOnly, viewMode, debouncedSearch, activeSymbol])

  useEffect(() => {
    const onGlobalKeyDown = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (document.querySelector('dialog[open]')) return
      const target = e.composedPath ? e.composedPath()[0] : e.target
      if (
        target instanceof Element &&
        target.matches('input, textarea, select, [contenteditable], :read-write')
      ) {
        return
      }
      e.preventDefault()
      if (searchInputRef.current) {
        searchInputRef.current.focus()
        searchInputRef.current.select()
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [])

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

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (scanPollTimerRef.current) clearTimeout(scanPollTimerRef.current)
      if (stocksAbortRef.current) stocksAbortRef.current.abort()
      if (statsAbortRef.current) statsAbortRef.current.abort()
    },
    []
  )

  const toggleWatchlist = (sym) => {
    setWatchlist((prev) => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      return next
    })
  }

  const fetchStats = async () => {
    if (statsAbortRef.current) statsAbortRef.current.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller

    try {
      const params = new URLSearchParams({
        volume_confirmed_only: String(volumeConfirmedOnly),
        trend_only: String(trendOnly),
        fno_only: String(fnoOnly),
        min_rs: String(minRs),
      })
      const res = await fetch(`/api/universe-stats?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (controller.signal.aborted) return
      setStats(data)

      if (data.vc_stage2_symbols && Array.isArray(data.vc_stage2_symbols)) {
        const currentSymbols = data.vc_stage2_symbols
        const storedStr = localStorage.getItem('bp_watched_vc_stage2_symbols')

        if (storedStr) {
          try {
            const prevList = JSON.parse(storedStr)
            const prevSet = new Set(prevList)
            const newEntries = currentSymbols.filter((sym) => !prevSet.has(sym))
            setNewlyAddedSymbols(new Set(newEntries))
          } catch (e) {
            console.error('Failed to parse stored VC+Stage2 symbols', e)
            localStorage.setItem('bp_watched_vc_stage2_symbols', JSON.stringify(currentSymbols))
          }
        } else {
          localStorage.setItem('bp_watched_vc_stage2_symbols', JSON.stringify(currentSymbols))
          setNewlyAddedSymbols(new Set())
        }
      }
      return data
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch universe stats:', err)
      }
    }
    return null
  }

  const fetchStocks = async () => {
    if (stocksAbortRef.current) stocksAbortRef.current.abort()
    const controller = new AbortController()
    stocksAbortRef.current = controller

    setLoading(true)
    setFetchError(null)
    try {
      const limit = activeTab === 'all' ? 500 : 250
      const params = new URLSearchParams({
        tab: activeTab,
        volume_confirmed_only: String(volumeConfirmedOnly),
        trend_only: String(trendOnly),
        fno_only: String(fnoOnly),
        min_rs: String(minRs),
        limit: String(limit),
      })
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim())
      }

      const res = await fetch(`/api/stocks?${params.toString()}`, { signal: controller.signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch screened stocks (HTTP ${res.status})`)
      }
      const totalHeader = parseInt(res.headers.get('X-Total-Count') || '', 10)
      const data = await res.json()
      if (!controller.signal.aborted) {
        setStocks(data)
        setTotalMatchingCount(Number.isFinite(totalHeader) ? totalHeader : data.length)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch stocks:', err)
        setFetchError(err.message || 'Unable to load screened stocks.')
      }
    } finally {
      if (stocksAbortRef.current === controller) setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [volumeConfirmedOnly, trendOnly, fnoOnly, minRs])

  useEffect(() => {
    fetchStocks()
  }, [activeTab, volumeConfirmedOnly, trendOnly, fnoOnly, minRs, debouncedSearch])

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return
    const wasBreakoutTab = activeTab !== 'top10' && activeTab !== 'all'
    if (wasBreakoutTab) {
      lastBreakoutVcRef.current = volumeConfirmedOnly
    }

    setActiveTab(nextTab)
    if (nextTab === 'top10') {
      setVolumeConfirmedOnly(false)
      setSortField('composite_score')
      setSortAsc(false)
    } else if (nextTab === 'all') {
      setVolumeConfirmedOnly(false)
      if (['composite_score', 'rsi14', 'adx14'].includes(sortField)) {
        setSortField('vol_multiple')
        setSortAsc(false)
      }
    } else {
      if (!wasBreakoutTab) {
        setVolumeConfirmedOnly(lastBreakoutVcRef.current)
      }
      if (['composite_score', 'rsi14', 'adx14'].includes(sortField)) {
        setSortField('vol_multiple')
        setSortAsc(false)
      }
    }
  }

  const handleToggleVolumeConfirmed = (nextVal) => {
    setVolumeConfirmedOnly(nextVal)
    if (activeTab !== 'top10' && activeTab !== 'all') {
      lastBreakoutVcRef.current = nextVal
    }
  }

  const handleSortChange = (field) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const sortedStocks = useMemo(() => {
    if (!stocks || stocks.length === 0) return []
    const base = watchlistOnly ? stocks.filter((s) => watchlist.has(s.symbol)) : stocks
    return [...base].sort((a, b) => {
      const valA = a[sortField]
      const valB = b[sortField]
      const isMissingA = valA === undefined || valA === null || (typeof valA === 'number' && isNaN(valA))
      const isMissingB = valB === undefined || valB === null || (typeof valB === 'number' && isNaN(valB))
      if (isMissingA && isMissingB) return 0
      if (isMissingA) return 1
      if (isMissingB) return -1
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? textCollator.compare(valA, valB) : textCollator.compare(valB, valA)
      }
      const numA = Number(valA)
      const numB = Number(valB)
      return sortAsc ? numA - numB : numB - numA
    })
  }, [stocks, sortField, sortAsc, watchlistOnly, watchlist])

  const displayedStocks = useMemo(
    () =>
      sortedStocks.map((s) => ({
        ...s,
        is_newly_added: newlyAddedSymbols.has(s.symbol),
      })),
    [sortedStocks, newlyAddedSymbols]
  )

  // Keep activeSymbol synced to displayedStocks once loaded
  useEffect(() => {
    if (loading) return
    if (displayedStocks.length === 0) {
      return
    }
    if (!activeSymbol || !displayedStocks.some((s) => s.symbol === activeSymbol)) {
      setActiveSymbol(displayedStocks[0].symbol)
    }
  }, [displayedStocks, activeSymbol, loading])

  const activeStockSummary = useMemo(
    () => displayedStocks.find((s) => s.symbol === activeSymbol) || null,
    [displayedStocks, activeSymbol]
  )

  const finishScanFlow = async (statusPayload, prevSymbolsSnapshot) => {
    try {
      const stocksUpdated = Number(statusPayload?.stocks_updated || 0)
      if (stocksUpdated > 0 && Array.isArray(prevSymbolsSnapshot)) {
        localStorage.setItem('bp_watched_vc_stage2_symbols', JSON.stringify(prevSymbolsSnapshot))
      }

      await Promise.all([fetchStats(), fetchStocks()])

      const resStatus = statusPayload?.scan_result_status || statusPayload?.status
      const resType = statusPayload?.scan_status_type
      if (resStatus === 'error' || resType === 'error') {
        showToast(
          {
            type: 'error',
            message: statusPayload?.scan_message || statusPayload?.message || 'Market scan failed.',
          },
          8000
        )
      } else if (resStatus === 'success' || statusPayload?.is_today_available || stocksUpdated > 0) {
        showToast(
          {
            type: 'success',
            message:
              statusPayload?.scan_message ||
              statusPayload?.message ||
              'Official NSE Bhavcopy successfully downloaded and loaded.',
          },
          8000
        )
      } else {
        showToast(
          {
            type: 'info',
            message:
              statusPayload?.scan_message ||
              statusPayload?.message ||
              'Displaying latest available session data.',
          },
          8000
        )
      }
    } finally {
      wasScanningRef.current = false
      setScanStatus({ is_scanning: false })
    }
  }

  const handleTriggerScan = async () => {
    if (wasScanningRef.current) return
    wasScanningRef.current = true
    setScanStatus({ is_scanning: true, progress: 0, total: 1 })
    const prevSymbolsSnapshot = stats?.vc_stage2_symbols || null

    try {
      showToast({
        type: 'info',
        message: 'Checking official NSE servers for latest market data...',
      })

      const res = await fetch('/api/scan', { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Scan request failed (HTTP ${res.status})`)
      }
      const data = await res.json()

      if (data.status === 'started' || data.status === 'already_running' || data.is_scanning) {
        const pollOnce = async () => {
          try {
            const stRes = await fetch('/api/scan-status')
            if (!stRes.ok) throw new Error(`Status check failed (HTTP ${stRes.status})`)
            const st = await stRes.json()
            setScanStatus(st)
            if (st.is_scanning) {
              scanPollTimerRef.current = setTimeout(pollOnce, 1000)
            } else {
              await finishScanFlow(st, prevSymbolsSnapshot)
            }
          } catch (pollErr) {
            console.error('Failed to poll scan status:', pollErr)
            wasScanningRef.current = false
            setScanStatus({ is_scanning: false })
            showToast(
              { type: 'error', message: pollErr.message || 'Lost connection while polling scan progress.' },
              6000
            )
          }
        }
        scanPollTimerRef.current = setTimeout(pollOnce, 800)
      } else {
        await finishScanFlow(data, prevSymbolsSnapshot)
      }
    } catch (err) {
      console.error('Failed to trigger scan:', err)
      wasScanningRef.current = false
      setScanStatus({ is_scanning: false })
      showToast(
        {
          type: 'error',
          message: err.message || 'Could not complete Bhavcopy check.',
        },
        6000
      )
    }
  }

  const handleExportTradingView = () => {
    if (!displayedStocks || displayedStocks.length === 0) return
    const content = displayedStocks.map((s) => `NSE:${s.symbol}`).join(',')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const datePart = stats?.latest_data_date || new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `breakoutpulse-${activeTab}-${datePart}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast(
      {
        type: 'success',
        message: `Exported ${displayedStocks.length} NSE symbols for TradingView watchlist import.`,
      },
      4000
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Top Navbar */}
      <Navbar
        theme={theme}
        setTheme={setTheme}
        onSelectHome={() => handleTabChange('ath')}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchInputRef={searchInputRef}
        onOpenUpload={() => setIsUploadOpen(true)}
        onTriggerScan={handleTriggerScan}
        scanStatus={scanStatus}
        totalStocks={stats?.total_stocks || 0}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3 w-full animate-fade-in">
          <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[13px] font-medium text-[var(--ink)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-[var(--down)] shrink-0" />
              ) : toast.type === 'info' ? (
                <Info className="w-4 h-4 text-[var(--accent)] shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[var(--up)] shrink-0" />
              )}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer text-[13px] bp-transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-4 pb-6 flex-1 w-full">
        <MarketBanner
          stats={stats}
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          newlyAddedCount={newlyAddedSymbols.size}
          volumeConfirmedOnly={volumeConfirmedOnly}
          setVolumeConfirmedOnly={handleToggleVolumeConfirmed}
          trendOnly={trendOnly}
          setTrendOnly={setTrendOnly}
          fnoOnly={fnoOnly}
          setFnoOnly={setFnoOnly}
          minRs={minRs}
          setMinRs={setMinRs}
          watchlistOnly={watchlistOnly}
          setWatchlistOnly={setWatchlistOnly}
          watchlistCount={watchlist.size}
          displayedCount={displayedStocks.length}
          onExportTradingView={handleExportTradingView}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* Fetch Error Alert */}
        {fetchError && (
          <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-[6px] bg-[var(--down-soft)] text-[13px] text-[var(--down)] font-medium">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                fetchStats()
                fetchStocks()
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[5px] bg-[var(--down)] text-white text-[13px] font-semibold cursor-pointer hover:opacity-90"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Unified Split Workbench or Full Table */}
        {viewMode === 'split' ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[8px] grid grid-cols-1 lg:grid-cols-[minmax(0,1.54fr)_minmax(492px,1fr)] overflow-hidden">
            <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--border)] min-w-0">
              <StockTable
                layout="split"
                stocks={displayedStocks}
                onSelectStock={(sym) => setActiveSymbol(sym)}
                onOpenChart={(sym) => {
                  setActiveSymbol(sym)
                  setModalSymbol(sym)
                }}
                selectedSymbol={activeSymbol}
                loading={loading}
                sortField={sortField}
                sortAsc={sortAsc}
                onSortChange={handleSortChange}
                activeTab={activeTab}
                watchlist={watchlist}
                onToggleWatchlist={toggleWatchlist}
                totalMatchingCount={watchlistOnly ? displayedStocks.length : totalMatchingCount}
                onOpenUpload={() => setIsUploadOpen(true)}
              />
            </div>

            <StockInspector
              symbol={activeSymbol}
              stockSummary={activeStockSummary}
              theme={theme}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
              onExpandChart={(sym) => setModalSymbol(sym)}
            />
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[8px] overflow-hidden">
            <StockTable
              layout="table"
              stocks={displayedStocks}
              onSelectStock={(sym) => {
                setActiveSymbol(sym)
                setModalSymbol(sym)
              }}
              onOpenChart={(sym) => {
                setActiveSymbol(sym)
                setModalSymbol(sym)
              }}
              selectedSymbol={activeSymbol}
              loading={loading}
              sortField={sortField}
              sortAsc={sortAsc}
              onSortChange={handleSortChange}
              activeTab={activeTab}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
              totalMatchingCount={watchlistOnly ? displayedStocks.length : totalMatchingCount}
              onOpenUpload={() => setIsUploadOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Full-Screen Chart Modal */}
      {modalSymbol && (
        <ChartModal
          symbol={modalSymbol}
          stocks={displayedStocks}
          onSelectStock={(sym) => {
            setModalSymbol(sym)
            setActiveSymbol(sym)
          }}
          onClose={() => setModalSymbol(null)}
          theme={theme}
          watchlist={watchlist}
          onToggleWatchlist={toggleWatchlist}
        />
      )}

      {/* Universe CSV & Bhavcopy Importer Modal */}
      {isUploadOpen && (
        <CsvUploader
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => {
            fetchStats()
            fetchStocks()
          }}
        />
      )}
    </div>
  )
}
