import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import { X, Flame } from 'lucide-react'

export default function ChartModal({ symbol, onClose, theme }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isDark = theme === 'dark'

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    fetch(`/api/stocks/${symbol}/chart`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        if (isMounted) {
          setData(payload)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [symbol])

  // Initialize and update Lightweight Charts
  useEffect(() => {
    if (!data || !chartContainerRef.current) return

    const container = chartContainerRef.current
    container.innerHTML = '' // clear previous canvas

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#161a20' : '#ffffff' },
        textColor: isDark ? '#e8eaed' : '#1a1a17',
      },
      grid: {
        vertLines: { color: isDark ? '#222831' : '#eef1f4' },
        horzLines: { color: isDark ? '#222831' : '#eef1f4' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isDark ? '#272d36' : '#e9ecef',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: isDark ? '#272d36' : '#e9ecef',
        timeVisible: true,
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    // 1. Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: isDark ? '#3ecf7d' : '#1a8a4a',
      downColor: isDark ? '#ff6b5e' : '#d2392f',
      borderVisible: false,
      wickUpColor: isDark ? '#3ecf7d' : '#1a8a4a',
      wickDownColor: isDark ? '#ff6b5e' : '#d2392f',
    })

    const candleData = data.candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    candleSeries.setData(candleData)

    // 2. 50-day SMA Line
    const closes = data.candles.map((c) => c.close)
    const sma50Data = []
    for (let i = 0; i < data.candles.length; i++) {
      if (i >= 49) {
        const slice = closes.slice(i - 49, i + 1)
        const avg = slice.reduce((a, b) => a + b, 0) / 50
        sma50Data.push({ time: data.candles[i].time, value: avg })
      }
    }
    if (sma50Data.length > 0) {
      const sma50Series = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 1.5,
        title: '50 SMA',
      })
      sma50Series.setData(sma50Data)
    }

    // 3. 200-day SMA Line
    const sma200Data = []
    for (let i = 0; i < data.candles.length; i++) {
      if (i >= 199) {
        const slice = closes.slice(i - 199, i + 1)
        const avg = slice.reduce((a, b) => a + b, 0) / 200
        sma200Data.push({ time: data.candles[i].time, value: avg })
      }
    }
    if (sma200Data.length > 0) {
      const sma200Series = chart.addLineSeries({
        color: '#f97316',
        lineWidth: 2,
        title: '200 SMA',
      })
      sma200Series.setData(sma200Data)
    }

    // 4. All-Time High Line (Gold)
    if (data.high_ath && data.high_ath > 0) {
      candleSeries.createPriceLine({
        price: data.high_ath,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: `👑 ALL-TIME HIGH (₹${data.high_ath})`,
      })
    }

    // 5. 52-Week High Line (Teal)
    if (data.high_52w && data.high_52w > 0 && Math.abs(data.high_52w - data.high_ath) > (data.high_ath * 0.005)) {
      candleSeries.createPriceLine({
        price: data.high_52w,
        color: '#06b6d4',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `🎯 52W HIGH (₹${data.high_52w})`,
      })
    }

    // 6. Volume Histogram Series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.01 },
      borderVisible: false,
    })

    const volumeData = data.candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open 
        ? (isDark ? 'rgba(62, 207, 125, 0.4)' : 'rgba(26, 138, 74, 0.4)')
        : (isDark ? 'rgba(255, 107, 94, 0.4)' : 'rgba(210, 57, 47, 0.4)'),
    }))
    volumeSeries.setData(volumeData)

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [data, isDark])

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer"
    >
      {/* Modal Box: stopPropagation ensures clicks inside the card do not close it */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden cursor-default"
      >
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-surface-border dark:border-surface-dark-border flex items-center justify-between gap-4 bg-gray-50/50 dark:bg-[#1a1f26]/50">
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-banana flex items-center justify-center font-bold text-black text-sm">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                  {symbol}
                </h2>
                <span className="text-xs text-muted">NSE Equities</span>
              </div>
              <p className="text-xs text-muted truncate max-w-sm">
                {data?.name || symbol}
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          {data && (
            <div className="hidden lg:flex items-center gap-3 bg-gray-100 dark:bg-[#1d2229] px-3 py-1.5 rounded-xl text-xs">
              <div>
                <span className="text-muted block text-[10px]">52W High:</span>
                <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                  ₹{data.high_52w} ({data.dist_to_52w_high_pct >= 0 ? `+${data.dist_to_52w_high_pct}%` : `${data.dist_to_52w_high_pct}%`})
                </span>
              </div>
              <div className="border-l border-gray-300 dark:border-gray-700 pl-3">
                <span className="text-muted block text-[10px]">All-Time High:</span>
                <span className="font-mono font-semibold text-amber-500">
                  ₹{data.high_ath} ({data.dist_to_ath_pct >= 0 ? `+${data.dist_to_ath_pct}%` : `${data.dist_to_ath_pct}%`})
                </span>
              </div>
              <div className="border-l border-gray-300 dark:border-gray-700 pl-3">
                <span className="text-muted block text-[10px]">Volume Multiple:</span>
                <span className={`font-mono font-bold flex items-center gap-1 ${
                  data.is_volume_confirmed ? 'text-amber-500' : 'text-gray-400'
                }`}>
                  {data.is_volume_confirmed && <Flame className="w-3 h-3 fill-amber-500" />}
                  {data.volume_multiple}x
                </span>
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-[#1d2229] transition-colors"
            title="Close (or click outside / press Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend Bar */}
        <div className="px-5 py-2 bg-gray-50 dark:bg-[#161a20] border-b border-surface-border dark:border-surface-dark-border flex items-center justify-between text-[11px] text-muted flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap font-medium">
            <span className="flex items-center gap-1.5 text-amber-500">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              All-Time High (Gold Line)
            </span>
            <span className="flex items-center gap-1.5 text-cyan-500">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" />
              52-Week High (Teal Line)
            </span>
            <span className="flex items-center gap-1.5 text-blue-500">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              50 DMA
            </span>
            <span className="flex items-center gap-1.5 text-orange-500">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
              200 DMA
            </span>
          </div>

          <div className="text-muted">
            Turnover: <span className="font-mono text-gray-700 dark:text-gray-300">₹{data?.turnover_cr || '--'} Cr/day</span>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="relative flex-1 min-h-[480px] bg-white dark:bg-[#161a20]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-xs z-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-banana border-t-transparent" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-trade-red text-sm font-medium z-10">
              {error}
            </div>
          )}
          <div ref={chartContainerRef} className="w-full h-full min-h-[480px]" />
        </div>

      </div>
    </div>
  )
}
