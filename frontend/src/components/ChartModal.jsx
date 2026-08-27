import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { X } from 'lucide-react'

export default function ChartModal({ symbol, onClose, theme }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [legendData, setLegendData] = useState(null)

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
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { visible: false },
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
        rightOffset: 12,
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    // 1. Candlestick Series - Emerald (#10B981) / Red (#EF4444)
    const upColor = '#10B981'
    const downColor = '#EF4444'

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

    // 2. 50-day SMA Line: Sky Blue (#38BDF8), Solid 2px
    const closes = data.candles.map((c) => c.close)
    const sma50Data = []
    for (let i = 0; i < data.candles.length; i++) {
      if (i >= 49) {
        const slice = closes.slice(i - 49, i + 1)
        const avg = slice.reduce((a, b) => a + b, 0) / 50
        sma50Data.push({ time: data.candles[i].time, value: avg })
      }
    }
    let sma50Series = null
    if (sma50Data.length > 0) {
      sma50Series = chart.addLineSeries({
        color: '#38BDF8',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: '',
      })
      sma50Series.setData(sma50Data)
    }

    // 3. 200-day SMA Line: Amber/Orange (#F97316), Solid 2px
    const sma200Data = []
    for (let i = 0; i < data.candles.length; i++) {
      if (i >= 199) {
        const slice = closes.slice(i - 199, i + 1)
        const avg = slice.reduce((a, b) => a + b, 0) / 200
        sma200Data.push({ time: data.candles[i].time, value: avg })
      }
    }
    let sma200Series = null
    if (sma200Data.length > 0) {
      sma200Series = chart.addLineSeries({
        color: '#F97316',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: '',
      })
      sma200Series.setData(sma200Data)
    }

    // 4. All-Time High Line: Gold/Yellow (#FACC15), Dashed 1.5px
    if (data.high_ath && data.high_ath > 0) {
      candleSeries.createPriceLine({
        price: data.high_ath,
        color: '#FACC15',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'ATH',
      })
    }

    // 5. 52-Week High Line: Purple (#A855F7), Dotted 1.5px (Omit if 52W High == ATH)
    const isSameHigh = data.high_52w && data.high_ath && Math.abs(data.high_52w - data.high_ath) / data.high_ath < 0.005
    if (data.high_52w && data.high_52w > 0 && !isSameHigh) {
      candleSeries.createPriceLine({
        price: data.high_52w,
        color: '#A855F7',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: '52W H',
      })
    }

    // 6. Volume Histogram Series (Occupy lower 18%, prevent price scale badge collision)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0.0 },
      borderVisible: false,
    })

    const volumeData = data.candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open 
        ? 'rgba(16, 185, 129, 0.35)' 
        : 'rgba(239, 68, 68, 0.35)',
    }))
    volumeSeries.setData(volumeData)

    // Set Default / Initial Legend Data (Most recent candle)
    const lastCandle = data.candles[data.candles.length - 1]
    const defaultLegend = {
      time: lastCandle.time,
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
      volume: lastCandle.volume,
      sma50: sma50Data.length > 0 ? sma50Data[sma50Data.length - 1].value : null,
      sma200: sma200Data.length > 0 ? sma200Data[sma200Data.length - 1].value : null,
    }
    setLegendData(defaultLegend)

    // 7. Subscribe to Real-Time Crosshair Movement
    chart.subscribeCrosshairMove((param) => {
      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setLegendData(defaultLegend)
        return
      }

      const candle = param.seriesData.get(candleSeries)
      const sma50Val = sma50Series ? param.seriesData.get(sma50Series) : null
      const sma200Val = sma200Series ? param.seriesData.get(sma200Series) : null
      const volVal = volumeSeries ? param.seriesData.get(volumeSeries) : null

      if (candle) {
        setLegendData({
          time: param.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: volVal ? volVal.value : candle.volume,
          sma50: sma50Val ? sma50Val.value : null,
          sma200: sma200Val ? sma200Val.value : null,
        })
      } else {
        setLegendData(defaultLegend)
      }
    })

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

  const isSameHigh = data && data.high_52w && data.high_ath && (Math.abs(data.high_52w - data.high_ath) / data.high_ath < 0.005)

  const formatNum2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00'
    return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatPct2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00%'
    const num = Number(val)
    return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
  }

  const formatLegendDate = (time) => {
    if (!time) return ''
    if (typeof time === 'string') {
      const parts = time.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1] || m} ${y}`
      }
    }
    if (typeof time === 'object' && time.year) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${time.day} ${months[time.month - 1] || time.month} ${time.year}`
    }
    return String(time)
  }

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
            <div className="w-9 h-9 rounded-lg bg-[#111827] dark:bg-[#F9FAFB] text-white dark:text-[#111827] flex items-center justify-center font-semibold text-xs shadow-xs">
              {symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F9FAFB] tracking-tight">
                  {symbol}
                </h2>
                <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF] font-normal">NSE Equities</span>
              </div>
              <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] truncate max-w-xs sm:max-w-sm font-normal">
                {data?.name || symbol}
              </p>
            </div>
          </div>

          {/* Quick Metrics: Aligned Labels & Values with Consolidated Duplicate Highs & Turnover */}
          {data && (
            <div className="hidden md:flex items-center gap-4 bg-[#F9FAFB] dark:bg-[#161D27] px-4 py-2 rounded-xl text-xs border border-[#E5E7EB] dark:border-[#1F2937]">
              
              {/* Consolidated 52W / ATH or Distinct Badges */}
              {isSameHigh ? (
                <div>
                  <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">52W / ATH:</span>
                  <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                    {formatNum2(data.high_ath)} ({formatPct2(data.dist_to_ath_pct)})
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">52W High:</span>
                    <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                      {formatNum2(data.high_52w)} ({formatPct2(data.dist_to_52w_high_pct)})
                    </span>
                  </div>
                  <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                    <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">All-Time High:</span>
                    <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                      {formatNum2(data.high_ath)} ({formatPct2(data.dist_to_ath_pct)})
                    </span>
                  </div>
                </>
              )}

              {/* Volume Multiple */}
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">Volume Signal:</span>
                <span className={`font-semibold tabular-nums text-sm ${
                  data.is_volume_confirmed ? 'text-[#16A34A] dark:text-[#22C55E]' : 'text-[#111827] dark:text-[#F9FAFB]'
                }`}>
                  {Number(data.volume_multiple).toFixed(2)}x
                </span>
              </div>

              {/* Turnover */}
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">Turnover:</span>
                <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                  {formatNum2(data.turnover_cr)} Cr/day
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

        {/* Real-time Dynamic Crosshair Legend Bar */}
        <div className="px-5 py-2.5 bg-[#F9FAFB] dark:bg-[#111827] border-b border-[#E5E7EB] dark:border-[#1F2937] flex items-center justify-between text-xs text-[#6B7280] dark:text-[#9CA3AF] flex-wrap gap-y-2 gap-x-4">
          
          {/* Live Hovered OHLC */}
          {legendData && (
            <div className="flex items-center gap-3.5 flex-wrap font-normal tabular-nums">
              <span className="font-medium text-[#111827] dark:text-[#F9FAFB]">
                {formatLegendDate(legendData.time)}
              </span>
              <span>
                O: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(legendData.open)}</span>
              </span>
              <span>
                H: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(legendData.high)}</span>
              </span>
              <span>
                L: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(legendData.low)}</span>
              </span>
              <span>
                C: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(legendData.close)}</span>
              </span>
              {/* Candle Return */}
              {legendData.open && legendData.close && (
                <span className={`font-semibold ${legendData.close >= legendData.open ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {legendData.close >= legendData.open ? '+' : ''}
                  {(legendData.close - legendData.open).toFixed(2)} ({legendData.close >= legendData.open ? '+' : ''}{(((legendData.close - legendData.open) / legendData.open) * 100).toFixed(2)}%)
                </span>
              )}
              {legendData.volume && (
                <span>
                  Vol: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{(legendData.volume >= 1e6 ? `${(legendData.volume / 1e6).toFixed(2)}M` : legendData.volume >= 1e3 ? `${(legendData.volume / 1e3).toFixed(1)}k` : legendData.volume)}</span>
                </span>
              )}
            </div>
          )}

          {/* Real-time Indicator Overlays */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] font-medium tabular-nums ml-auto">
            {/* 50 DMA */}
            <span className="flex items-center gap-1.5 text-[#38BDF8]">
              <span className="w-2.5 h-0.5 bg-[#38BDF8] inline-block" />
              50 DMA: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{legendData?.sma50 ? formatNum2(legendData.sma50) : '--'}</span>
            </span>

            {/* 200 DMA */}
            <span className="flex items-center gap-1.5 text-[#F97316]">
              <span className="w-2.5 h-0.5 bg-[#F97316] inline-block" />
              200 DMA: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{legendData?.sma200 ? formatNum2(legendData.sma200) : '--'}</span>
            </span>

            {/* ATH */}
            {data?.high_ath && (
              <span className="flex items-center gap-1.5 text-[#FACC15]">
                <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[#FACC15] inline-block" />
                ATH: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(data.high_ath)}</span>
              </span>
            )}

            {/* 52W High (Only if not same as ATH) */}
            {!isSameHigh && data?.high_52w && (
              <span className="flex items-center gap-1.5 text-[#A855F7]">
                <span className="w-2.5 h-0.5 border-t-2 border-dotted border-[#A855F7] inline-block" />
                52W H: <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">{formatNum2(data.high_52w)}</span>
              </span>
            )}
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
