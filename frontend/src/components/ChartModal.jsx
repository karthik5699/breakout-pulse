import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { X, ChevronUp, ChevronDown } from 'lucide-react'

const TIMEFRAMES = ['1H', '1D', '1W']

export default function ChartModal({ symbol, stocks = [], onSelectStock, onClose, theme }) {
  const chartContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const candleDataRef = useRef([])
  const cacheRef = useRef({})

  const [activeRange, setActiveRange] = useState('1D')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [legendData, setLegendData] = useState(null)

  const isDark = theme === 'dark'
  const currentIndex = stocks.findIndex((s) => s.symbol === symbol)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex !== -1 && currentIndex < stocks.length - 1

  const handlePrevStock = () => {
    if (hasPrev && onSelectStock) {
      onSelectStock(stocks[currentIndex - 1].symbol)
    }
  }

  const handleNextStock = () => {
    if (hasNext && onSelectStock) {
      onSelectStock(stocks[currentIndex + 1].symbol)
    }
  }

  const applyRange = (rangeKey, chartInstance, rsiChartInstance, candles) => {
    const ch = chartInstance || chartRef.current
    const rCh = rsiChartInstance || rsiChartRef.current
    const cData = candles || candleDataRef.current
    if (!ch || !cData || cData.length === 0) return

    let bars = 252
    if (rangeKey === '1H') bars = 140      // ~20 trading sessions of 1-hour bars initially visible
    else if (rangeKey === '1D') bars = 252 // ~1 year of daily bars initially visible
    else if (rangeKey === '1W') bars = 156 // ~3 years of weekly bars initially visible

    const count = Math.min(bars, cData.length)
    const fromIndex = Math.max(0, cData.length - count)
    const toIndex = cData.length - 1 + 5 // right offset padding

    const logicalRange = {
      from: fromIndex,
      to: toIndex,
    }
    ch.timeScale().setVisibleLogicalRange(logicalRange)
    if (rCh) {
      rCh.timeScale().setVisibleLogicalRange(logicalRange)
    }
  }

  const handleRangeChange = (r) => {
    if (r === activeRange) return
    setActiveRange(r)
  }

  // Handle Escape key to close and Arrow keys to navigate stocks in current screened list
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.composedPath ? e.composedPath()[0] : e.target
      if (
        target instanceof Element &&
        target.matches(':read-write, select, input[type="range"], [role="slider"]')
      ) {
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (hasNext && onSelectStock) {
          e.preventDefault()
          onSelectStock(stocks[currentIndex + 1].symbol)
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (hasPrev && onSelectStock) {
          e.preventDefault()
          onSelectStock(stocks[currentIndex - 1].symbol)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, hasNext, hasPrev, currentIndex, stocks, onSelectStock])

  useEffect(() => {
    let isMounted = true
    const cacheKey = `${symbol}:${activeRange}`
    if (cacheRef.current[cacheKey]) {
      setData(cacheRef.current[cacheKey])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    fetch(
      `/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=${encodeURIComponent(activeRange)}`,
      { cache: 'no-store' }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        if (isMounted) {
          cacheRef.current[cacheKey] = payload
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
  }, [symbol, activeRange])

  // Initialize and update Lightweight Charts (Main Chart + Synchronized RSI 14 Pane)
  useEffect(() => {
    if (!data || !chartContainerRef.current || !rsiContainerRef.current) return

    const container = chartContainerRef.current
    const rsiContainer = rsiContainerRef.current
    container.innerHTML = ''
    rsiContainer.innerHTML = ''

    const isHourly = activeRange === '1H'
    const sharedLayout = {
      background: { type: ColorType.Solid, color: isDark ? '#111827' : '#ffffff' },
      textColor: isDark ? '#9CA3AF' : '#6B7280',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }
    const sharedGrid = {
      vertLines: { visible: false },
      horzLines: { color: isDark ? '#1F2937' : '#F3F4F6' },
    }

    try {
      const chart = createChart(container, {
        autoSize: true,
        width: container.clientWidth || 800,
        height: container.clientHeight || 350,
        layout: sharedLayout,
        grid: sharedGrid,
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: isDark ? '#1F2937' : '#E5E7EB',
          scaleMargins: { top: 0.08, bottom: 0.22 },
          minimumWidth: 72,
        },
        timeScale: {
          borderColor: isDark ? '#1F2937' : '#E5E7EB',
          visible: false,
          timeVisible: isHourly,
          secondsVisible: false,
          rightOffset: 12,
        },
        handleScroll: true,
        handleScale: true,
      })

      const rsiChart = createChart(rsiContainer, {
        autoSize: true,
        width: rsiContainer.clientWidth || 800,
        height: rsiContainer.clientHeight || 140,
        layout: sharedLayout,
        grid: sharedGrid,
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: isDark ? '#1F2937' : '#E5E7EB',
          scaleMargins: { top: 0.1, bottom: 0.1 },
          minimumWidth: 72,
        },
        timeScale: {
          borderColor: isDark ? '#1F2937' : '#E5E7EB',
          visible: true,
          timeVisible: isHourly,
          secondsVisible: false,
          rightOffset: 12,
        },
        handleScroll: true,
        handleScale: true,
      })

      chartRef.current = chart
      rsiChartRef.current = rsiChart

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

      const rawCandles = data.candles || []
      const filteredRaw = rawCandles.filter(
        (c) =>
          c &&
          c.time !== undefined &&
          c.time !== null &&
          !isNaN(c.open) &&
          !isNaN(c.high) &&
          !isNaN(c.low) &&
          !isNaN(c.close)
      )
      const candleData = filteredRaw.map((c) => ({
        time: typeof c.time === 'number' ? c.time : String(c.time),
        open: Number(c.open),
        high: Math.max(Number(c.high), Number(c.open), Number(c.close)),
        low: Math.min(Number(c.low), Number(c.open), Number(c.close)),
        close: Number(c.close),
      }))

      if (candleData.length > 0) {
        candleSeries.setData(candleData)
      }

      // 2. 50-period SMA Line: Sky Blue (#38BDF8), Solid 2px
      const closes = candleData.map((c) => c.close)
      const sma50Data = []
      const sma50Map = new Map()
      for (let i = 0; i < candleData.length; i++) {
        if (i >= 49) {
          const slice = closes.slice(i - 49, i + 1)
          const avg = slice.reduce((a, b) => a + b, 0) / 50
          sma50Data.push({ time: candleData[i].time, value: avg })
          sma50Map.set(candleData[i].time, avg)
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

      // 3. 200-period SMA Line: Amber/Orange (#F97316), Solid 2px
      const sma200Data = []
      const sma200Map = new Map()
      for (let i = 0; i < candleData.length; i++) {
        if (i >= 199) {
          const slice = closes.slice(i - 199, i + 1)
          const avg = slice.reduce((a, b) => a + b, 0) / 200
          sma200Data.push({ time: candleData[i].time, value: avg })
          sma200Map.set(candleData[i].time, avg)
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
      const highAthNum = Number(data.high_ath)
      if (!isNaN(highAthNum) && highAthNum > 0) {
        candleSeries.createPriceLine({
          price: highAthNum,
          color: '#FACC15',
          lineWidth: 1.5,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'ATH',
        })
      }

      // 5. 52-Week High Line: Purple (#A855F7), Dotted 1.5px (Omit if 52W High == ATH)
      const high52wNum = Number(data.high_52w)
      const isSameHigh =
        !isNaN(high52wNum) &&
        !isNaN(highAthNum) &&
        highAthNum > 0 &&
        Math.abs(high52wNum - highAthNum) / highAthNum < 0.005
      if (!isNaN(high52wNum) && high52wNum > 0 && !isSameHigh) {
        candleSeries.createPriceLine({
          price: high52wNum,
          color: '#A855F7',
          lineWidth: 1.5,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '52W H',
        })
      }

      // 6. Volume Histogram Series (Occupy lower 18% of main chart)
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

      const volumeMap = new Map()
      const volumeData = candleData.map((c, idx) => {
        const rawVol = Number(filteredRaw[idx]?.volume)
        const volVal = !isNaN(rawVol) ? rawVol : 0
        volumeMap.set(c.time, volVal)
        return {
          time: c.time,
          value: volVal,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }
      })
      if (volumeData.length > 0) {
        volumeSeries.setData(volumeData)
      }

      // 7. Wilder's RSI(14) Series in Dedicated Bottom Sub-Pane
      const rsiPeriod = 14
      const rsiSeriesData = []
      const rsiMap = new Map()
      if (candleData.length > 0) {
        let avgGain = 0
        let avgLoss = 0

        for (let i = 0; i < candleData.length; i++) {
          const t = candleData[i].time
          if (i === 0) {
            rsiSeriesData.push({ time: t }) // Whitespace item to keep 1:1 logical index alignment
            continue
          }
          const diff = closes[i] - closes[i - 1]
          const gain = diff > 0 ? diff : 0
          const loss = diff < 0 ? -diff : 0

          if (i < rsiPeriod) {
            avgGain += gain
            avgLoss += loss
            rsiSeriesData.push({ time: t }) // Whitespace item during warmup
          } else if (i === rsiPeriod) {
            avgGain = (avgGain + gain) / rsiPeriod
            avgLoss = (avgLoss + loss) / rsiPeriod
            const rsiVal = avgLoss === 0 ? (avgGain > 0 ? 100 : 50) : 100 - 100 / (1 + avgGain / avgLoss)
            rsiSeriesData.push({ time: t, value: rsiVal })
            rsiMap.set(t, rsiVal)
          } else {
            avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod
            avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod
            const rsiVal = avgLoss === 0 ? (avgGain > 0 ? 100 : 50) : 100 - 100 / (1 + avgGain / avgLoss)
            rsiSeriesData.push({ time: t, value: rsiVal })
            rsiMap.set(t, rsiVal)
          }
        }
      }

      const rsiSeries = rsiChart.addLineSeries({
        color: '#8B5CF6',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: '',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
        }),
      })

      if (rsiSeriesData.length > 0) {
        rsiSeries.setData(rsiSeriesData)
      }

      // RSI Overbought (70), Midline (50), Oversold (30) reference lines
      rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(239, 68, 68, 0.55)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: '',
      })
      rsiSeries.createPriceLine({
        price: 50,
        color: isDark ? 'rgba(156, 163, 175, 0.28)' : 'rgba(107, 114, 128, 0.28)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      })
      rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(16, 185, 129, 0.55)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: '',
      })

      // 8. Bidirectional Logical Range Synchronization
      let isSyncingFromMain = false
      let isSyncingFromRsi = false

      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingFromRsi || !range) return
        isSyncingFromMain = true
        rsiChart.timeScale().setVisibleLogicalRange(range)
        isSyncingFromMain = false
      })

      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingFromMain || !range) return
        isSyncingFromRsi = true
        chart.timeScale().setVisibleLogicalRange(range)
        isSyncingFromRsi = false
      })

      // 9. Default / Initial Legend Data & Bidirectional Crosshair Sync
      if (candleData.length > 0) {
        const candleMap = new Map()
        candleData.forEach((c) => candleMap.set(c.time, c))

        const lastCandle = candleData[candleData.length - 1]
        const lastTime = lastCandle.time
        const defaultLegend = {
          time: lastTime,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: volumeMap.get(lastTime) ?? 0,
          sma50: sma50Map.get(lastTime) ?? null,
          sma200: sma200Map.get(lastTime) ?? null,
          rsi14: rsiMap.get(lastTime) ?? null,
        }
        setLegendData(defaultLegend)

        let isSyncingCrosshair = false

        const updateLegendForTime = (t) => {
          const c = candleMap.get(t)
          if (!c) {
            setLegendData(defaultLegend)
            return
          }
          setLegendData({
            time: t,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: volumeMap.get(t) ?? 0,
            sma50: sma50Map.get(t) ?? null,
            sma200: sma200Map.get(t) ?? null,
            rsi14: rsiMap.get(t) ?? null,
          })
        }

        chart.subscribeCrosshairMove((param) => {
          if (isSyncingCrosshair) return
          isSyncingCrosshair = true
          try {
            if (
              !param.point ||
              param.time === undefined ||
              param.point.x < 0 ||
              param.point.x > container.clientWidth ||
              param.point.y < 0 ||
              param.point.y > container.clientHeight
            ) {
              setLegendData(defaultLegend)
              try {
                rsiChart.clearCrosshairPosition()
              } catch {}
              return
            }

            updateLegendForTime(param.time)
            const rVal = rsiMap.get(param.time)
            try {
              if (rVal !== undefined && rVal !== null && !isNaN(rVal)) {
                rsiChart.setCrosshairPosition(rVal, param.time, rsiSeries)
              } else {
                rsiChart.clearCrosshairPosition()
              }
            } catch {}
          } finally {
            isSyncingCrosshair = false
          }
        })

        rsiChart.subscribeCrosshairMove((param) => {
          if (isSyncingCrosshair) return
          isSyncingCrosshair = true
          try {
            if (
              !param.point ||
              param.time === undefined ||
              param.point.x < 0 ||
              param.point.x > rsiContainer.clientWidth ||
              param.point.y < 0 ||
              param.point.y > rsiContainer.clientHeight
            ) {
              setLegendData(defaultLegend)
              try {
                chart.clearCrosshairPosition()
              } catch {}
              return
            }

            updateLegendForTime(param.time)
            const c = candleMap.get(param.time)
            try {
              if (c) {
                chart.setCrosshairPosition(c.close, param.time, candleSeries)
              } else {
                chart.clearCrosshairPosition()
              }
            } catch {}
          } finally {
            isSyncingCrosshair = false
          }
        })
      }

      candleDataRef.current = candleData
      applyRange(activeRange, chart, rsiChart, candleData)

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        }
        if (rsiContainerRef.current && rsiChartRef.current) {
          rsiChartRef.current.applyOptions({
            width: rsiContainerRef.current.clientWidth,
            height: rsiContainerRef.current.clientHeight,
          })
        }
      }

      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        if (chartRef.current) {
          chartRef.current.remove()
          chartRef.current = null
        }
        if (rsiChartRef.current) {
          rsiChartRef.current.remove()
          rsiChartRef.current = null
        }
      }
    } catch (e) {
      console.error('Error rendering Lightweight Charts:', e)
      setError(e.message || 'Failed to render chart')
    }
  }, [data, isDark, activeRange])

  const isSameHigh =
    data &&
    data.high_52w &&
    data.high_ath &&
    Math.abs(data.high_52w - data.high_ath) / data.high_ath < 0.005

  const formatNum2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00'
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const formatPct2 = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00%'
    const num = Number(val)
    return num >= 0 ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`
  }

  const formatLegendDate = (time) => {
    if (time === undefined || time === null) return ''
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    if (typeof time === 'number') {
      const d = new Date(time * 1000)
      const day = d.getUTCDate()
      const month = months[d.getUTCMonth()] || ''
      const year = d.getUTCFullYear()
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      return `${day} ${month} ${year}, ${hh}:${mm}`
    }
    if (typeof time === 'string') {
      const parts = time.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts
        return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1] || m} ${y}`
      }
    }
    if (typeof time === 'object' && time.year) {
      return `${time.day} ${months[time.month - 1] || time.month} ${time.year}`
    }
    return String(time)
  }

  const formatVolume = (val) => {
    const num = Number(val)
    if (isNaN(num) || num <= 0) return '0'
    if (num >= 1e7) return `${(num / 1e7).toFixed(2)} Cr`
    if (num >= 1e5) return `${(num / 1e5).toFixed(2)} L`
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)} k`
    return num.toLocaleString('en-IN')
  }

  const maLabelPrefix = activeRange === '1D' ? 'DMA' : 'SMA'

  const getRsiColorClass = (rsiVal) => {
    if (rsiVal === null || rsiVal === undefined || isNaN(rsiVal)) {
      return 'text-[#111827] dark:text-[#F9FAFB]'
    }
    if (rsiVal >= 70) return 'text-[#EF4444]'
    if (rsiVal <= 30) return 'text-[#10B981]'
    return 'text-[#111827] dark:text-[#F9FAFB]'
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
                {data?.is_fno && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded bg-[#8069BF]/10 text-[#8069BF] dark:bg-[#8069BF]/20 dark:text-[#A78BFA] border border-[#8069BF]/20 leading-none"
                    title={
                      data.fno_lot_size
                        ? `NSE F&O Stock • Lot Size: ${data.fno_lot_size}`
                        : 'NSE F&O Stock'
                    }
                  >
                    F&O
                  </span>
                )}
                <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF] font-normal">
                  NSE Equities
                </span>
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
                  <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">
                    52W / ATH:
                  </span>
                  <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                    {formatNum2(data.high_ath)} ({formatPct2(data.dist_to_ath_pct)})
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">
                      52W High:
                    </span>
                    <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                      {formatNum2(data.high_52w)} ({formatPct2(data.dist_to_52w_high_pct)})
                    </span>
                  </div>
                  <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                    <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">
                      All-Time High:
                    </span>
                    <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                      {formatNum2(data.high_ath)} ({formatPct2(data.dist_to_ath_pct)})
                    </span>
                  </div>
                </>
              )}

              {/* Volume Multiple */}
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">
                  Volume Signal:
                </span>
                <span
                  className={`font-semibold tabular-nums text-sm ${
                    data.is_volume_confirmed
                      ? 'text-[#16A34A] dark:text-[#22C55E]'
                      : 'text-[#111827] dark:text-[#F9FAFB]'
                  }`}
                >
                  {Number(data.volume_multiple).toFixed(2)}x
                </span>
              </div>

              {/* Turnover */}
              <div className="border-l border-[#E5E7EB] dark:border-[#374151] pl-4">
                <span className="text-[#6B7280] dark:text-[#9CA3AF] block text-[11px] uppercase font-medium">
                  Turnover:
                </span>
                <span className="font-semibold tabular-nums text-[#111827] dark:text-[#F9FAFB] text-sm">
                  {formatNum2(data.turnover_cr)} Cr/day
                </span>
              </div>
            </div>
          )}

          {/* Header Right Actions: Prev/Next Navigation, Timeframe Selector (1H, 1D, 1W) & Close */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stock List Navigation (Keyboard ↑/↓) */}
            {stocks.length > 1 && currentIndex !== -1 && (
              <div
                className="flex items-center bg-[#F3F4F6] dark:bg-[#1F2937] p-0.5 rounded-xl text-xs"
                title="Use ↑ / ↓ or ← / → arrow keys to cycle through screened stocks"
              >
                <button
                  onClick={handlePrevStock}
                  disabled={!hasPrev}
                  className="p-1.5 rounded-lg text-[#111827] dark:text-[#F9FAFB] disabled:opacity-30 hover:bg-white dark:hover:bg-[#111827] transition-colors"
                  aria-label="Previous stock (Up Arrow)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[11px] font-medium tabular-nums text-[#6B7280] dark:text-[#9CA3AF]">
                  {currentIndex + 1} / {stocks.length}
                </span>
                <button
                  onClick={handleNextStock}
                  disabled={!hasNext}
                  className="p-1.5 rounded-lg text-[#111827] dark:text-[#F9FAFB] disabled:opacity-30 hover:bg-white dark:hover:bg-[#111827] transition-colors"
                  aria-label="Next stock (Down Arrow)"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Timeframe Selector (1H, 1D, 1W) */}
            <div className="flex items-center bg-[#F3F4F6] dark:bg-[#1F2937] p-0.5 rounded-xl text-xs">
              {TIMEFRAMES.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRangeChange(r)}
                  className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                    activeRange === r
                      ? 'bg-white dark:bg-[#111827] text-[#111827] dark:text-[#F9FAFB] shadow-xs font-semibold'
                      : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F9FAFB] rounded-xl hover:bg-[#F9FAFB] dark:hover:bg-[#1F2937] transition-colors"
              title="Close (or click outside / press Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                O:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(legendData.open)}
                </span>
              </span>
              <span>
                H:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(legendData.high)}
                </span>
              </span>
              <span>
                L:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(legendData.low)}
                </span>
              </span>
              <span>
                C:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(legendData.close)}
                </span>
              </span>
              {/* Candle Return */}
              {legendData.open && legendData.close && (
                <span
                  className={`font-semibold ${
                    legendData.close >= legendData.open ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {legendData.close >= legendData.open ? '+' : ''}
                  {(legendData.close - legendData.open).toFixed(2)} (
                  {legendData.close >= legendData.open ? '+' : ''}
                  {(((legendData.close - legendData.open) / legendData.open) * 100).toFixed(2)}%)
                </span>
              )}
              {legendData.volume !== undefined && legendData.volume !== null && (
                <span>
                  Vol:{' '}
                  <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {formatVolume(legendData.volume)}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Real-time Indicator Overlays */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] font-medium tabular-nums ml-auto">
            {/* 50 SMA */}
            <span className="flex items-center gap-1.5 text-[#38BDF8]">
              <span className="w-2.5 h-0.5 bg-[#38BDF8] inline-block" />
              50 {maLabelPrefix}:{' '}
              <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                {legendData?.sma50 ? formatNum2(legendData.sma50) : '--'}
              </span>
            </span>

            {/* 200 SMA */}
            <span className="flex items-center gap-1.5 text-[#F97316]">
              <span className="w-2.5 h-0.5 bg-[#F97316] inline-block" />
              200 {maLabelPrefix}:{' '}
              <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                {legendData?.sma200 ? formatNum2(legendData.sma200) : '--'}
              </span>
            </span>

            {/* RSI 14 */}
            <span className="flex items-center gap-1.5 text-[#8B5CF6]">
              <span className="w-2.5 h-0.5 bg-[#8B5CF6] inline-block" />
              RSI 14:{' '}
              <span className={`font-semibold ${getRsiColorClass(legendData?.rsi14)}`}>
                {legendData?.rsi14 !== null && legendData?.rsi14 !== undefined
                  ? legendData.rsi14.toFixed(2)
                  : '--'}
              </span>
            </span>

            {/* ATH */}
            {data?.high_ath && (
              <span className="flex items-center gap-1.5 text-[#FACC15]">
                <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[#FACC15] inline-block" />
                ATH:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(data.high_ath)}
                </span>
              </span>
            )}

            {/* 52W High (Only if not same as ATH) */}
            {!isSameHigh && data?.high_52w && (
              <span className="flex items-center gap-1.5 text-[#A855F7]">
                <span className="w-2.5 h-0.5 border-t-2 border-dotted border-[#A855F7] inline-block" />
                52W H:{' '}
                <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">
                  {formatNum2(data.high_52w)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Stacked Chart Canvases: Main Candlestick/Volume Pane + Synchronized RSI(14) Sub-Pane */}
        <div className="relative flex-1 flex flex-col min-h-[500px] bg-white dark:bg-[#111827]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-xs z-20">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#111827] dark:border-[#F9FAFB] border-t-transparent" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-[#DC2626] dark:text-[#EF4444] text-sm font-medium z-20">
              {error}
            </div>
          )}

          {/* Main Candlestick + SMA + Volume Pane */}
          <div ref={chartContainerRef} className="w-full flex-1 min-h-[350px]" />

          {/* RSI(14) Indicator Sub-Pane */}
          <div className="relative w-full h-[145px] border-t border-[#E5E7EB] dark:border-[#1F2937]">
            <div className="absolute top-2 left-3 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-medium tabular-nums bg-white/80 dark:bg-[#111827]/80 px-2 py-0.5 rounded-md">
              <span className="text-[#8B5CF6] font-semibold">RSI (14)</span>
              <span className={`font-semibold ${getRsiColorClass(legendData?.rsi14)}`}>
                {legendData?.rsi14 !== null && legendData?.rsi14 !== undefined
                  ? legendData.rsi14.toFixed(2)
                  : '--'}
              </span>
            </div>
            <div ref={rsiContainerRef} className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
