import React, { useEffect, useRef, useState, useId } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { X, ChevronUp, ChevronDown, Star, Calculator, AlertTriangle, RotateCcw } from 'lucide-react'
import RiskCalculator from './RiskCalculator'

const TIMEFRAMES = ['1H', '1D', '1W']

export default function ChartModal({
  symbol,
  stocks = [],
  onSelectStock,
  onClose,
  theme,
  watchlist = new Set(),
  onToggleWatchlist,
}) {
  const dialogRef = useRef(null)
  const chartContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const candleDataRef = useRef([])
  const cacheRef = useRef({})
  const titleId = useId()

  const [activeRange, setActiveRange] = useState('1D')
  const [fetched, setFetched] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchNonce, setFetchNonce] = useState(0)
  const [legendData, setLegendData] = useState(null)
  const [showRiskCalc, setShowRiskCalc] = useState(true)
  const [overlays, setOverlays] = useState({
    sma20: false,
    sma50: true,
    sma200: true,
    volSma50: true,
    highs: true,
  })

  const isDark = theme === 'dark'
  const isWatchlisted = watchlist.has(symbol)
  const currentIndex = stocks.findIndex((s) => s.symbol === symbol)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex !== -1 && currentIndex < stocks.length - 1

  const activeData =
    fetched && fetched.symbol === symbol && fetched.timeframe === activeRange
      ? fetched.payload
      : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) {
      dialog.showModal()
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if ('closedBy' in HTMLDialogElement.prototype) return

    const outside = (e) => {
      const r = dialog.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    let pressedOutside = false
    const onPointerDown = (e) => {
      pressedOutside = outside(e)
    }
    const onPointerUp = (e) => {
      if (pressedOutside && outside(e)) {
        dialog.close()
      }
      pressedOutside = false
    }
    dialog.addEventListener('pointerdown', onPointerDown)
    dialog.addEventListener('pointerup', onPointerUp)
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown)
      dialog.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

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
    if (rangeKey === '1H') bars = 140
    else if (rangeKey === '1D') bars = 252
    else if (rangeKey === '1W') bars = 156

    const count = Math.min(bars, cData.length)
    const fromIndex = Math.max(0, cData.length - count)
    const toIndex = cData.length - 1 + 5

    const logicalRange = { from: fromIndex, to: toIndex }
    ch.timeScale().setVisibleLogicalRange(logicalRange)
    if (rCh) {
      rCh.timeScale().setVisibleLogicalRange(logicalRange)
    }
  }

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

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
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
  }, [hasNext, hasPrev, currentIndex, stocks, onSelectStock])

  useEffect(() => {
    const cacheKey = `${symbol}:${activeRange}`
    if (fetchNonce === 0 && cacheRef.current[cacheKey]) {
      setFetched({ symbol, timeframe: activeRange, payload: cacheRef.current[cacheKey] })
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(
      `/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=${encodeURIComponent(activeRange)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load chart (HTTP ${res.status})`)
        return res.json()
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          cacheRef.current[cacheKey] = payload
          setFetched({ symbol, timeframe: activeRange, payload })
          setLoading(false)
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message || 'Could not load chart data.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [symbol, activeRange, fetchNonce])

  useEffect(() => {
    if (!activeData || !chartContainerRef.current || !rsiContainerRef.current) {
      setLegendData(null)
      return
    }

    const container = chartContainerRef.current
    const rsiContainer = rsiContainerRef.current
    container.innerHTML = ''
    rsiContainer.innerHTML = ''

    const surfaceColor = isDark ? '#0D1721' : '#FFFFFF'
    const textColor = isDark ? '#8FA4B8' : '#525B55'
    const gridColor = isDark ? '#162636' : '#ECEEE9'
    const borderColor = isDark ? '#1C2E40' : '#E0E3DD'
    const upColor = isDark ? '#25C281' : '#0E7A4D'
    const downColor = isDark ? '#F25C69' : '#C42536'
    const upVolColor = isDark ? 'rgba(37, 194, 129, 0.36)' : 'rgba(14, 122, 77, 0.32)'
    const downVolColor = isDark ? 'rgba(242, 92, 105, 0.36)' : 'rgba(196, 37, 54, 0.32)'
    const sma50Color = isDark ? '#558BFF' : '#1648D8'
    const sma200Color = isDark ? '#E5A032' : '#B45309'
    const sma20Color = isDark ? '#2DD4BF' : '#0F766E'
    const athColor = isDark ? '#8FA4B8' : '#525B55'

    const isHourly = activeRange === '1H'
    const sharedLayout = {
      background: { type: ColorType.Solid, color: surfaceColor },
      textColor,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 13,
    }
    const sharedGrid = {
      vertLines: { visible: false },
      horzLines: { color: gridColor },
    }

    try {
      const chart = createChart(container, {
        autoSize: true,
        width: container.clientWidth || 800,
        height: container.clientHeight || 360,
        layout: sharedLayout,
        grid: sharedGrid,
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor,
          scaleMargins: { top: 0.08, bottom: 0.22 },
          minimumWidth: 74,
        },
        timeScale: {
          borderColor,
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
        height: rsiContainer.clientHeight || 135,
        layout: { ...sharedLayout, attributionLogo: false },
        grid: sharedGrid,
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          minimumWidth: 74,
        },
        timeScale: {
          borderColor,
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

      const candleSeries = chart.addCandlestickSeries({
        upColor,
        downColor,
        borderVisible: false,
        wickUpColor: upColor,
        wickDownColor: downColor,
      })

      const rawCandles = activeData.candles || []
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

      const closes = candleData.map((c) => c.close)
      const prevCloseMap = new Map()
      for (let i = 0; i < candleData.length; i++) {
        prevCloseMap.set(candleData[i].time, i > 0 ? candleData[i - 1].close : candleData[i].open)
      }

      const computeSmaSeries = (period) => {
        const seriesData = []
        const map = new Map()
        for (let i = period - 1; i < candleData.length; i++) {
          let sum = 0
          for (let j = i - (period - 1); j <= i; j++) sum += closes[j]
          const avg = sum / period
          seriesData.push({ time: candleData[i].time, value: avg })
          map.set(candleData[i].time, avg)
        }
        return { seriesData, map }
      }

      const { seriesData: sma20Data, map: sma20Map } = computeSmaSeries(20)
      if (overlays.sma20 && sma20Data.length > 0) {
        const s20 = chart.addLineSeries({
          color: sma20Color,
          lineWidth: 1.5,
          lineStyle: LineStyle.Solid,
          title: '',
        })
        s20.setData(sma20Data)
      }

      const { seriesData: sma50Data, map: sma50Map } = computeSmaSeries(50)
      if (overlays.sma50 && sma50Data.length > 0) {
        const s50 = chart.addLineSeries({
          color: sma50Color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          title: '',
        })
        s50.setData(sma50Data)
      }

      const { seriesData: sma200Data, map: sma200Map } = computeSmaSeries(200)
      if (overlays.sma200 && sma200Data.length > 0) {
        const s200 = chart.addLineSeries({
          color: sma200Color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          title: '',
        })
        s200.setData(sma200Data)
      }

      const highAthNum = Number(activeData.high_ath)
      const high52wNum = Number(activeData.high_52w)
      const sameHigh =
        !isNaN(high52wNum) &&
        !isNaN(highAthNum) &&
        highAthNum > 0 &&
        Math.abs(high52wNum - highAthNum) / highAthNum < 0.005

      if (overlays.highs) {
        if (!isNaN(highAthNum) && highAthNum > 0) {
          candleSeries.createPriceLine({
            price: highAthNum,
            color: athColor,
            lineWidth: 1.5,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'ATH',
          })
        }
        if (!isNaN(high52wNum) && high52wNum > 0 && !sameHigh) {
          candleSeries.createPriceLine({
            price: high52wNum,
            color: sma50Color,
            lineWidth: 1.5,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: '52W H',
          })
        }
      }

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
      const rawVolumes = []
      const volumeData = candleData.map((c, idx) => {
        const rawVol = Number(filteredRaw[idx]?.volume)
        const volVal = !isNaN(rawVol) ? rawVol : 0
        volumeMap.set(c.time, volVal)
        rawVolumes.push(volVal)
        return {
          time: c.time,
          value: volVal,
          color: c.close >= c.open ? upVolColor : downVolColor,
        }
      })
      if (volumeData.length > 0) {
        volumeSeries.setData(volumeData)
      }

      if (overlays.volSma50 && rawVolumes.length >= 20) {
        const volMaWin = Math.min(50, rawVolumes.length)
        const volSmaData = []
        for (let i = 0; i < rawVolumes.length; i++) {
          const start = Math.max(0, i - volMaWin + 1)
          let sum = 0
          for (let j = start; j <= i; j++) sum += rawVolumes[j]
          volSmaData.push({ time: candleData[i].time, value: sum / (i - start + 1) })
        }
        const volMaSeries = chart.addLineSeries({
          color: sma200Color,
          lineWidth: 1.5,
          lineStyle: LineStyle.Solid,
          priceScaleId: 'volume',
          lastValueVisible: false,
          priceLineVisible: false,
          title: '',
        })
        volMaSeries.setData(volSmaData)
      }

      const rsiPeriod = 14
      const rsiSeriesData = []
      const rsiMap = new Map()
      if (candleData.length > 0) {
        let avgGain = 0
        let avgLoss = 0

        for (let i = 0; i < candleData.length; i++) {
          const t = candleData[i].time
          if (i === 0) {
            rsiSeriesData.push({ time: t })
            continue
          }
          const diff = closes[i] - closes[i - 1]
          const gain = diff > 0 ? diff : 0
          const loss = diff < 0 ? -diff : 0

          if (i < rsiPeriod) {
            avgGain += gain
            avgLoss += loss
            rsiSeriesData.push({ time: t })
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
        color: sma50Color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: '',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
      })
      if (rsiSeriesData.length > 0) {
        rsiSeries.setData(rsiSeriesData)
      }

      rsiSeries.createPriceLine({
        price: 70,
        color: isDark ? 'rgba(242, 92, 105, 0.5)' : 'rgba(196, 37, 54, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      })
      rsiSeries.createPriceLine({
        price: 50,
        color: isDark ? 'rgba(143, 164, 184, 0.28)' : 'rgba(82, 91, 85, 0.25)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      })
      rsiSeries.createPriceLine({
        price: 30,
        color: isDark ? 'rgba(37, 194, 129, 0.5)' : 'rgba(14, 122, 77, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      })

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

      if (candleData.length > 0) {
        const candleMap = new Map()
        candleData.forEach((c) => candleMap.set(c.time, c))

        const makeLegendForTime = (t) => {
          const c = candleMap.get(t)
          if (!c) return null
          return {
            time: t,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            prevClose: prevCloseMap.get(t) ?? c.open,
            volume: volumeMap.get(t) ?? 0,
            sma20: sma20Map.get(t) ?? null,
            sma50: sma50Map.get(t) ?? null,
            sma200: sma200Map.get(t) ?? null,
            rsi14: rsiMap.get(t) ?? null,
          }
        }

        const lastTime = candleData[candleData.length - 1].time
        const defaultLegend = makeLegendForTime(lastTime)
        setLegendData(defaultLegend)

        let isSyncingCrosshair = false

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

            setLegendData(makeLegendForTime(param.time) || defaultLegend)
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

            setLegendData(makeLegendForTime(param.time) || defaultLegend)
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

      return () => {
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
  }, [activeData, isDark, activeRange, overlays])

  const isSameHigh =
    activeData &&
    activeData.high_52w &&
    activeData.high_ath &&
    Math.abs(activeData.high_52w - activeData.high_ath) / activeData.high_ath < 0.005

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
      return 'text-[var(--ink)]'
    }
    if (rsiVal >= 70) return 'text-[var(--down)]'
    if (rsiVal <= 30) return 'text-[var(--up)]'
    return 'text-[var(--ink)]'
  }

  const toggleOverlay = (key) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const currentPrice = activeData?.current_price || legendData?.close || 1000
  const suggestedSl = (() => {
    if (activeData?.atr14_pct && activeData.atr14_pct > 0) {
      return Number((currentPrice * (1 - (1.5 * activeData.atr14_pct) / 100)).toFixed(2))
    }
    if (activeData?.sma20 && activeData.sma20 > 0 && activeData.sma20 < currentPrice) {
      return Number(activeData.sma20.toFixed(2))
    }
    return Number((currentPrice * 0.95).toFixed(2))
  })()

  const prevChgDiff = legendData ? legendData.close - (legendData.prevClose || legendData.open) : 0
  const prevChgPct =
    legendData && (legendData.prevClose || legendData.open) > 0
      ? (prevChgDiff / (legendData.prevClose || legendData.open)) * 100
      : 0

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="bg-transparent p-0 m-auto w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[1280px] max-h-[94vh] rounded-[8px] border-0 overflow-visible font-sans animate-fade-in"
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[8px] w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-4 bg-[var(--surface)] flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id={titleId} className="m-0 font-display text-[18px] font-bold tracking-[-0.02em] text-[var(--ink)]">
                {symbol}
              </h2>
              {onToggleWatchlist && (
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(symbol)}
                  aria-label={isWatchlisted ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
                  aria-pressed={isWatchlisted}
                  className={`p-0.5 cursor-pointer bp-transition ${
                    isWatchlisted
                      ? 'text-[var(--star-active)]'
                      : 'text-[var(--border-strong)] hover:text-[var(--ink-muted)]'
                  }`}
                >
                  <Star className="w-4 h-4" fill={isWatchlisted ? 'currentColor' : 'none'} strokeWidth={1.8} />
                </button>
              )}
              {activeRange === '1H' && activeData?.is_synthetic && (
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--sma200)]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Estimated 1H (intraday feed unavailable)
                </span>
              )}
            </div>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--ink-muted)] truncate max-w-md">
              {activeData?.name || (loading ? 'Loading...' : symbol)}
              {activeData?.is_fno && (
                <span className="text-[var(--accent)] font-semibold">
                  {activeData.fno_lot_size
                    ? ` · F&O lot ${Number(activeData.fno_lot_size).toLocaleString('en-IN')}`
                    : ' · F&O'}
                </span>
              )}
            </p>
          </div>

          {/* Typographic Summary Stats */}
          {activeData && (
            <div className="hidden lg:flex items-center gap-6 text-[13px] tabular-nums">
              {isSameHigh ? (
                <div>
                  <span className="block text-[var(--ink-muted)]">52W / ATH</span>
                  <span className="font-semibold text-[14px] text-[var(--ink)]">
                    ₹{formatNum2(activeData.high_ath)} ({formatPct2(activeData.dist_to_ath_pct)})
                  </span>
                </div>
              ) : (
                <>
                  <div>
                    <span className="block text-[var(--ink-muted)]">52W high</span>
                    <span className="font-semibold text-[14px] text-[var(--ink)]">
                      ₹{formatNum2(activeData.high_52w)} ({formatPct2(activeData.dist_to_52w_high_pct)})
                    </span>
                  </div>
                  <div className="border-l border-[var(--border)] pl-5">
                    <span className="block text-[var(--ink-muted)]">All-time high</span>
                    <span className="font-semibold text-[14px] text-[var(--ink)]">
                      ₹{formatNum2(activeData.high_ath)} ({formatPct2(activeData.dist_to_ath_pct)})
                    </span>
                  </div>
                </>
              )}

              <div className="border-l border-[var(--border)] pl-5">
                <span className="block text-[var(--ink-muted)]">Volume multiple</span>
                <span
                  className={`font-semibold text-[14px] ${
                    activeData.is_volume_confirmed ? 'text-[var(--up)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {Number(activeData.volume_multiple).toFixed(2)}×
                </span>
              </div>

              <div className="border-l border-[var(--border)] pl-5">
                <span className="block text-[var(--ink-muted)]">Turnover</span>
                <span className="font-semibold text-[14px] text-[var(--ink)]">
                  ₹{formatNum2(activeData.turnover_cr)} Cr
                </span>
              </div>
            </div>
          )}

          {/* Header Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {stocks.length > 1 && currentIndex !== -1 && (
              <div
                className="bp-segmented"
                title="Use Up/Down or Left/Right arrow keys to cycle screened stocks"
              >
                <button
                  type="button"
                  onClick={handlePrevStock}
                  disabled={!hasPrev}
                  className="bp-seg-btn disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous stock"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[13px] font-medium tabular-nums text-[var(--ink-muted)]">
                  {currentIndex + 1} / {stocks.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextStock}
                  disabled={!hasNext}
                  className="bp-seg-btn disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next stock"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="bp-segmented" role="group" aria-label="Chart timeframe">
              {TIMEFRAMES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => r !== activeRange && setActiveRange(r)}
                  aria-pressed={activeRange === r}
                  className={`bp-seg-btn ${activeRange === r ? 'is-active' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowRiskCalc((v) => !v)}
              aria-pressed={showRiskCalc}
              className={`inline-flex items-center gap-1.5 px-2.5 h-[32px] rounded-[6px] text-[13px] font-medium border bp-transition cursor-pointer ${
                showRiskCalc
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] font-semibold'
                  : 'bg-[var(--surface-subtle)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]'
              }`}
              title="Toggle R-based Position Sizer"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sizer</span>
            </button>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close chart modal"
              className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[6px] hover:bg-[var(--surface-subtle)] bp-transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Crosshair Readout & Overlay Toggles */}
        <div className="px-5 py-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border)] flex items-center justify-between text-[13px] text-[var(--ink-muted)] flex-wrap gap-y-2 gap-x-4">
          {legendData ? (
            <div className="flex items-center gap-3 flex-wrap tabular-nums">
              <span className="font-medium text-[var(--ink)]">
                {formatLegendDate(legendData.time)}
              </span>
              <span>
                O <span className="font-semibold text-[var(--ink)]">{formatNum2(legendData.open)}</span>
              </span>
              <span>
                H <span className="font-semibold text-[var(--ink)]">{formatNum2(legendData.high)}</span>
              </span>
              <span>
                L <span className="font-semibold text-[var(--ink)]">{formatNum2(legendData.low)}</span>
              </span>
              <span>
                C <span className="font-semibold text-[var(--ink)]">{formatNum2(legendData.close)}</span>
              </span>
              <span
                className={`font-semibold ${prevChgDiff >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}
              >
                {prevChgDiff >= 0 ? '+' : ''}
                {prevChgDiff.toFixed(2)} ({prevChgPct >= 0 ? '+' : ''}
                {prevChgPct.toFixed(2)}%)
              </span>
              <span>
                Vol <span className="font-semibold text-[var(--ink)]">{formatVolume(legendData.volume)}</span>
              </span>
            </div>
          ) : (
            <div className="text-[13px] text-[var(--ink-muted)]">Loading series...</div>
          )}

          {/* Clean Interactive Overlay Switches/Buttons */}
          <div className="flex items-center gap-3 flex-wrap text-[13px] font-medium tabular-nums ml-auto">
            <button
              type="button"
              onClick={() => toggleOverlay('sma20')}
              aria-pressed={overlays.sma20}
              className={`inline-flex items-center gap-1.5 cursor-pointer bp-transition ${
                overlays.sma20 ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)] opacity-55 hover:opacity-90'
              }`}
            >
              <span className="w-2.5 h-0.5 bg-[var(--sma20)] inline-block" />
              <span>20 {maLabelPrefix}{overlays.sma20 && legendData?.sma20 ? ` ${formatNum2(legendData.sma20)}` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleOverlay('sma50')}
              aria-pressed={overlays.sma50}
              className={`inline-flex items-center gap-1.5 cursor-pointer bp-transition ${
                overlays.sma50 ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)] opacity-55 hover:opacity-90'
              }`}
            >
              <span className="w-2.5 h-0.5 bg-[var(--accent)] inline-block" />
              <span>50 {maLabelPrefix}{overlays.sma50 && legendData?.sma50 ? ` ${formatNum2(legendData.sma50)}` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleOverlay('sma200')}
              aria-pressed={overlays.sma200}
              className={`inline-flex items-center gap-1.5 cursor-pointer bp-transition ${
                overlays.sma200 ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)] opacity-55 hover:opacity-90'
              }`}
            >
              <span className="w-2.5 h-0.5 bg-[var(--sma200)] inline-block" />
              <span>200 {maLabelPrefix}{overlays.sma200 && legendData?.sma200 ? ` ${formatNum2(legendData.sma200)}` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleOverlay('volSma50')}
              aria-pressed={overlays.volSma50}
              className={`inline-flex items-center gap-1.5 cursor-pointer bp-transition ${
                overlays.volSma50 ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)] opacity-55 hover:opacity-90'
              }`}
            >
              <span className="w-2.5 h-0.5 bg-[var(--sma200)] inline-block opacity-75" />
              <span>Vol 50 MA</span>
            </button>

            <button
              type="button"
              onClick={() => toggleOverlay('highs')}
              aria-pressed={overlays.highs}
              className={`inline-flex items-center gap-1.5 cursor-pointer bp-transition ${
                overlays.highs ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-muted)] opacity-55 hover:opacity-90'
              }`}
            >
              <span className="w-2.5 h-0 border-t-2 border-dashed border-[var(--ink-muted)] inline-block" />
              <span>ATH / 52W</span>
            </button>

            <span className="inline-flex items-center gap-1 pl-1 text-[var(--accent)]">
              RSI(14)
              <span className={`font-semibold ${getRsiColorClass(legendData?.rsi14)}`}>
                {legendData?.rsi14 !== null && legendData?.rsi14 !== undefined
                  ? legendData.rsi14.toFixed(2)
                  : '--'}
              </span>
            </span>
          </div>
        </div>

        {/* Chart Stage + Risk Calculator Side Column */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-[500px] overflow-hidden bg-[var(--surface)]">
          <div className="relative flex-1 flex flex-col min-h-[500px] min-w-0">
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface)]/90 backdrop-blur-sm z-20 gap-2">
                <div className="inline-block animate-spin rounded-full h-7 w-7 border-[3px] border-[var(--accent)] border-t-transparent" />
                <span className="text-[13px] text-[var(--ink-muted)]">
                  Loading {symbol} ({activeRange})...
                </span>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface)]/95 z-20 p-6 text-center gap-3">
                <AlertTriangle className="w-7 h-7 text-[var(--down)]" />
                <p className="text-[14px] font-medium text-[var(--down)] max-w-md">{error}</p>
                <button
                  type="button"
                  onClick={() => setFetchNonce((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[14px] font-semibold rounded-[6px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            )}

            <div ref={chartContainerRef} className="w-full flex-1 min-h-[360px]" />

            <div className="relative w-full h-[140px] border-t border-[var(--border)]">
              <div className="absolute top-1.5 left-3 z-10 pointer-events-none flex items-center gap-2 text-[13px] font-medium tabular-nums bg-[var(--surface)]/85 px-1.5 py-0.5 rounded-[4px]">
                <span className="text-[var(--accent)] font-semibold">RSI (14)</span>
                <span className={`font-semibold ${getRsiColorClass(legendData?.rsi14)}`}>
                  {legendData?.rsi14 !== null && legendData?.rsi14 !== undefined
                    ? legendData.rsi14.toFixed(2)
                    : '--'}
                </span>
              </div>
              <div ref={rsiContainerRef} className="w-full h-full" />
            </div>
          </div>

          {showRiskCalc && (
            <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--border)] p-5 overflow-y-auto bg-[var(--surface)]">
              <RiskCalculator
                variant="drawer"
                symbol={symbol}
                entryDefault={currentPrice}
                stopLossDefault={suggestedSl}
                atr14Pct={activeData?.atr14_pct}
                isFno={activeData?.is_fno}
                fnoLotSize={activeData?.fno_lot_size}
              />
            </aside>
          )}
        </div>
      </div>
    </dialog>
  )
}
