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
        background: { type: ColorType.Solid, color: isDark ? '#111827' : '#ffffff' },
        textColor: isDark ? '#9CA3AF' : '#6B7280',
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: isDark ? '#1F2937' : '#F3F4F6' },
        horzLines: { color: isDark ? '#1F2937' : '#F3F4F6' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isDark ? '#1F2937' : '#E5E7EB',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: isDark ? '#1F2937' : '#E5E7EB',
        timeVisible: true,
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    // 1. Candlestick Series - High Contrast Semantic Colors
    const upColor = isDark ? '#22c55e' : '#16a34a'
    const downColor = isDark ? '#ef4444' : '#dc2626'

    const candleSeries = chart.addCandlestickSeries({
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
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
        title: '',
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
        color: '#ea580c',
        lineWidth: 2,
        title: '',
      })
      sma200Series.setData(sma200Data)
    }

    // 4. All-Time High Line
    if (data.high_ath && data.high_ath > 0) {
      candleSeries.createPriceLine({
        price: data.high_ath,
        color: '#d97706',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: '',
      })
    }

    // 5. 52-Week High Line
    if (data.high_52w && data.high_52w > 0 && Math.abs(data.high_52w - data.high_ath) > (data.high_ath * 0.005)) {
      candleSeries.createPriceLine({
        price: data.high_52w,
        color: '#2563eb',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: '',
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
        ? (isDark ? 'rgba(34, 197, 94, 0.4)' : 'rgba(22, 163, 74, 0.4)')
        : (isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(220, 38, 38, 0.4)'),
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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer font-sans"
    >
      {/* Modal Box */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#111827] border border-[#E5E7EB] dark:border-[#1F2937] rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden cursor-default"
      >
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E5E7EB] dark:border-[#1F2937] flex items-center justify-between gap-4 bg-white dark:bg-[#111827]">
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-[#111827] dark:bg-[#F9FAFB] text-white dark:text-[#111827] flex items-center justify-center font-mono font-bold text-sm shadow-xs">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#111827] dark:text-[#F9FAFB] font-mono tracking-tight">
                  {symbol}
                </h2>
                <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF] font-sans">NSE Equities</span>
              </div>
              <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-sm font-sans">
                {data?.name || symbol}
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          {data && (
            <div className="hidden lg:flex items-center gap-4 bg-[#F9FAFB] dark:bg-[#161D27] px-3.5 py-2 rounded-xl text-xs border border-[#E5E7EB] dark:border-[#1F2937]">
              <div>
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[10px] uppercase font-sans font-medium">52W High:</span>
                <span className="font-mono font-bold text-[#111827] dark:text-[#F9FAFB]">
                  ₹{data.high_52w} ({data.dist_to_52w_high_pct >= 0 ? `+${data.dist_to_52w_high_pct}%` : `${data.dist_to_52w_high_pct}%`})
                </span>
              </div>
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[10px] uppercase font-sans font-medium">All-Time High:</span>
                <span className="font-mono font-bold text-[#111827] dark:text-[#F9FAFB]">
                  ₹{data.high_ath} ({data.dist_to_ath_pct >= 0 ? `+${data.dist_to_ath_pct}%` : `${data.dist_to_ath_pct}%`})
                </span>
              </div>
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[10px] uppercase font-sans font-medium">Volume Multiple:</span>
                <span className={`font-mono font-bold flex items-center gap-1 ${
                  data.is_volume_confirmed ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#6B7280] dark:text-[#9CA3AF]'
                }`}>
                  <Flame className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  {data.volume_multiple}x
                </span>
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB] rounded-xl hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] transition-colors"
            title="Close (or click outside / press Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend Bar */}
        <div className="px-5 py-2 bg-[#F9FAFB] dark:bg-[#111827] border-b border-[#E5E7EB] dark:border-[#1F2937] flex items-center justify-between text-[11px] text-[#6B7280] dark:text-[#9CA3AF] flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap font-medium font-sans">
            <span className="flex items-center gap-1.5 text-[#6B7280] dark:text-[#9CA3AF]">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              All-Time High
            </span>
            <span className="flex items-center gap-1.5 text-[#6B7280] dark:text-[#9CA3AF]">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              52-Week High
            </span>
            <span className="flex items-center gap-1.5 text-[#6B7280] dark:text-[#9CA3AF]">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
              50 DMA
            </span>
            <span className="flex items-center gap-1.5 text-[#6B7280] dark:text-[#9CA3AF]">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
              200 DMA
            </span>
          </div>

          <div className="text-[#6B7280] dark:text-[#9CA3AF] font-sans">
            Turnover: <span className="font-mono text-[#111827] dark:text-[#F9FAFB]">₹{data?.turnover_cr || '--'} Cr/day</span>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="relative flex-1 min-h-[480px] bg-white dark:bg-[#111827]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-xs z-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#111827] dark:border-[#F9FAFB] border-t-transparent" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-[#DC2626] dark:text-[#EF4444] text-sm font-medium z-10">
              {error}
            </div>
          )}
          <div ref={chartContainerRef} className="w-full h-full min-h-[480px]" />
        </div>

      </div>
    </div>
  )
}
