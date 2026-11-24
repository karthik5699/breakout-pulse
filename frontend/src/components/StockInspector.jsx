import React, { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import { Maximize2, Star, AlertTriangle, RotateCcw } from 'lucide-react'
import RiskCalculator from './RiskCalculator'

const RANGES = [
  { key: '3M', bars: 68 },
  { key: '6M', bars: 130 },
  { key: '1Y', bars: 252 },
]

function formatNum2(val) {
  if (val === undefined || val === null || isNaN(val)) return '0.00'
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function StockInspector({
  symbol,
  stockSummary = null,
  theme,
  watchlist = new Set(),
  onToggleWatchlist,
  onExpandChart,
}) {
  const chartContainerRef = useRef(null)
  const rsiContainerRef = useRef(null)
  const chartRef = useRef(null)
  const rsiChartRef = useRef(null)
  const cacheRef = useRef({})
  const candleDataRef = useRef([])

  const [rangeKey, setRangeKey] = useState('3M')
  const [fetched, setFetched] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fetchNonce, setFetchNonce] = useState(0)
  const [legend, setLegend] = useState(null)

  const isDark = theme === 'dark'
  const isWatchlisted = symbol ? watchlist.has(symbol) : false

  const activeData =
    fetched && symbol && fetched.symbol === symbol ? fetched.payload : null

  const applyRange = (targetRange, chartInst, rsiInst, cData) => {
    const ch = chartInst || chartRef.current
    const rCh = rsiInst || rsiChartRef.current
    const barsArr = cData || candleDataRef.current
    if (!ch || !barsArr || barsArr.length === 0) return

    const spec = RANGES.find((r) => r.key === targetRange) || RANGES[0]
    const count = Math.min(spec.bars, barsArr.length)
    const fromIdx = Math.max(0, barsArr.length - count)
    const toIdx = barsArr.length - 1 + 4
    const lr = { from: fromIdx, to: toIdx }
    ch.timeScale().setVisibleLogicalRange(lr)
    if (rCh) rCh.timeScale().setVisibleLogicalRange(lr)
  }

  useEffect(() => {
    if (!symbol) return
    if (fetchNonce === 0 && cacheRef.current[symbol]) {
      setFetched({ symbol, payload: cacheRef.current[symbol] })
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=1D`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Chart unavailable (HTTP ${res.status})`)
        return res.json()
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          cacheRef.current[symbol] = payload
          setFetched({ symbol, payload })
          setLoading(false)
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message || 'Unable to load chart data.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [symbol, fetchNonce])

  useEffect(() => {
    if (!activeData || !chartContainerRef.current || !rsiContainerRef.current) {
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
    const athColor = isDark ? '#8FA4B8' : '#525B55'

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
        width: container.clientWidth || 440,
        height: container.clientHeight || 200,
        layout: sharedLayout,
        grid: sharedGrid,
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor,
          scaleMargins: { top: 0.08, bottom: 0.22 },
          minimumWidth: 66,
        },
        timeScale: {
          borderColor,
          visible: false,
          rightOffset: 4,
        },
        handleScroll: true,
        handleScale: true,
      })

      const rsiChart = createChart(rsiContainer, {
        autoSize: true,
        width: rsiContainer.clientWidth || 440,
        height: rsiContainer.clientHeight || 76,
        layout: { ...sharedLayout, attributionLogo: false },
        grid: sharedGrid,
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor,
          scaleMargins: { top: 0.12, bottom: 0.12 },
          minimumWidth: 66,
        },
        timeScale: {
          borderColor,
          visible: true,
          rightOffset: 4,
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
        time: String(c.time),
        open: Number(c.open),
        high: Math.max(Number(c.high), Number(c.open), Number(c.close)),
        low: Math.min(Number(c.low), Number(c.open), Number(c.close)),
        close: Number(c.close),
      }))

      if (candleData.length > 0) {
        candleSeries.setData(candleData)
      }

      const closes = candleData.map((c) => c.close)

      const buildSma = (period) => {
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

      const { seriesData: sma50Data, map: sma50Map } = buildSma(50)
      if (sma50Data.length > 0) {
        const s50 = chart.addLineSeries({
          color: sma50Color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        s50.setData(sma50Data)
      }

      const { seriesData: sma200Data, map: sma200Map } = buildSma(200)
      if (sma200Data.length > 0) {
        const s200 = chart.addLineSeries({
          color: sma200Color,
          lineWidth: 1.75,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        s200.setData(sma200Data)
      }

      const highAthNum = Number(activeData.high_ath)
      if (!isNaN(highAthNum) && highAthNum > 0) {
        candleSeries.createPriceLine({
          price: highAthNum,
          color: athColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'ATH',
        })
      }

      // Volume Histogram
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
      const volumeData = candleData.map((c, idx) => ({
        time: c.time,
        value: Number(filteredRaw[idx]?.volume || 0),
        color: c.close >= c.open ? upVolColor : downVolColor,
      }))
      if (volumeData.length > 0) {
        volumeSeries.setData(volumeData)
      }

      // Wilder's RSI(14)
      const rsiPeriod = 14
      const rsiSeriesData = []
      const rsiMap = new Map()
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

      const rsiSeries = rsiChart.addLineSeries({
        color: sma50Color,
        lineWidth: 1.75,
        lineStyle: LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 20, maxValue: 85 },
        }),
      })
      if (rsiSeriesData.length > 0) {
        rsiSeries.setData(rsiSeriesData)
      }
      rsiSeries.createPriceLine({
        price: 70,
        color: isDark ? 'rgba(143, 164, 184, 0.35)' : 'rgba(82, 91, 85, 0.3)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      })
      rsiSeries.createPriceLine({
        price: 30,
        color: isDark ? 'rgba(143, 164, 184, 0.35)' : 'rgba(82, 91, 85, 0.3)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      })

      // Sync pan/zoom & crosshair across panes
      let syncingRange = false
      chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (syncingRange || !r) return
        syncingRange = true
        rsiChart.timeScale().setVisibleLogicalRange(r)
        syncingRange = false
      })
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (syncingRange || !r) return
        syncingRange = true
        chart.timeScale().setVisibleLogicalRange(r)
        syncingRange = false
      })

      if (candleData.length > 0) {
        const lastTime = candleData[candleData.length - 1].time
        const candleMap = new Map(candleData.map((c) => [c.time, c]))
        const buildLegend = (t) => ({
          sma50: sma50Map.get(t) ?? activeData.sma50 ?? null,
          sma200: sma200Map.get(t) ?? activeData.sma200 ?? null,
          rsi14: rsiMap.get(t) ?? null,
        })
        const defaultLegend = buildLegend(lastTime)
        setLegend(defaultLegend)

        let syncingCross = false
        chart.subscribeCrosshairMove((param) => {
          if (syncingCross) return
          syncingCross = true
          try {
            if (!param.point || param.time === undefined) {
              setLegend(defaultLegend)
              try {
                rsiChart.clearCrosshairPosition()
              } catch {}
              return
            }
            setLegend(buildLegend(param.time))
            const rv = rsiMap.get(param.time)
            try {
              if (rv !== undefined) rsiChart.setCrosshairPosition(rv, param.time, rsiSeries)
              else rsiChart.clearCrosshairPosition()
            } catch {}
          } finally {
            syncingCross = false
          }
        })

        rsiChart.subscribeCrosshairMove((param) => {
          if (syncingCross) return
          syncingCross = true
          try {
            if (!param.point || param.time === undefined) {
              setLegend(defaultLegend)
              try {
                chart.clearCrosshairPosition()
              } catch {}
              return
            }
            setLegend(buildLegend(param.time))
            const cv = candleMap.get(param.time)
            try {
              if (cv) chart.setCrosshairPosition(cv.close, param.time, candleSeries)
              else chart.clearCrosshairPosition()
            } catch {}
          } finally {
            syncingCross = false
          }
        })
      }

      candleDataRef.current = candleData
      applyRange(rangeKey, chart, rsiChart, candleData)

      return () => {
        try {
          if (chartRef.current) {
            chartRef.current.remove()
            chartRef.current = null
          }
          if (rsiChartRef.current) {
            rsiChartRef.current.remove()
            rsiChartRef.current = null
          }
        } catch {}
      }
    } catch (e) {
      console.error('StockInspector chart render error:', e)
      setError(e.message || 'Unable to render chart.')
    }
  }, [activeData, isDark])

  useEffect(() => {
    applyRange(rangeKey)
  }, [rangeKey])

  if (!symbol) {
    return (
      <aside className="flex flex-col items-center justify-center p-10 text-center min-w-0 bg-[var(--surface)]">
        <p className="text-[14px] text-[var(--ink-muted)] m-0">
          Select any equity on the left to inspect its chart and position sizer.
        </p>
      </aside>
    )
  }

  const displayName = activeData?.name || stockSummary?.name || symbol
  const isFno = activeData?.is_fno ?? stockSummary?.is_fno ?? false
  const fnoLotSize = activeData?.fno_lot_size ?? stockSummary?.fno_lot_size ?? null
  const currentPrice = activeData?.current_price ?? stockSummary?.current_price ?? 0
  const changePct = activeData?.change_pct ?? stockSummary?.change_pct ?? 0
  const highAth = activeData?.high_ath ?? stockSummary?.high_ath ?? 0
  const distAth = activeData?.dist_to_ath_pct ?? stockSummary?.dist_to_ath_pct ?? 0
  const volMult = activeData?.volume_multiple ?? stockSummary?.vol_multiple ?? 0
  const isVolConf = activeData?.is_volume_confirmed ?? stockSummary?.is_volume_confirmed ?? false
  const turnoverCr = activeData?.turnover_cr ?? stockSummary?.turnover_cr ?? 0
  const atr14Pct = activeData?.atr14_pct ?? stockSummary?.atr14_pct ?? 0
  const sma20 = activeData?.sma20 ?? stockSummary?.sma20 ?? null
  const sma50 = legend?.sma50 ?? activeData?.sma50 ?? stockSummary?.sma50 ?? null
  const sma200 = legend?.sma200 ?? activeData?.sma200 ?? stockSummary?.sma200 ?? null
  const rsi14 = legend?.rsi14 ?? stockSummary?.rsi14 ?? null

  const dist50 = sma50 && sma50 > 0 ? ((currentPrice - sma50) / sma50) * 100 : null
  const dist200 = sma200 && sma200 > 0 ? ((currentPrice - sma200) / sma200) * 100 : null

  const suggestedSl = (() => {
    if (atr14Pct && atr14Pct > 0 && currentPrice > 0) {
      return Number((currentPrice * (1 - (1.5 * atr14Pct) / 100)).toFixed(2))
    }
    if (sma20 && sma20 > 0 && sma20 < currentPrice) {
      return Number(sma20.toFixed(2))
    }
    return Number((currentPrice * 0.94).toFixed(2))
  })()

  return (
    <aside
      aria-label={`Technical inspector for ${symbol}`}
      className="flex flex-col min-w-0 bg-[var(--surface)]"
    >
      {/* Inspector Header */}
      <div className="px-4 sm:px-5 pt-3.5 pb-2.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="m-0 font-display text-[18px] font-bold tracking-[-0.02em] leading-[1.2] text-[var(--ink)]">
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
            {onExpandChart && (
              <button
                type="button"
                onClick={() => onExpandChart(symbol)}
                aria-label={`Expand full chart for ${symbol}`}
                title="Expand full chart (1H, 1D, 1W)"
                className="p-1 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] cursor-pointer bp-transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-[13px] text-[var(--ink-muted)] mt-0.5 truncate">
            {displayName}
            {isFno && (
              <span className="text-[var(--accent)] font-medium">
                {fnoLotSize ? ` · F&O lot ${Number(fnoLotSize).toLocaleString('en-IN')}` : ' · F&O'}
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-display text-[18px] font-bold text-[var(--ink)] leading-[1.2] tabular-nums">
            ₹{formatNum2(currentPrice)}
          </div>
          <div
            className={`text-[14px] font-semibold mt-0.5 tabular-nums ${
              changePct >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
            }`}
          >
            {changePct >= 0 ? '+' : ''}
            {Number(changePct).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Chart Range Control & Inline Legend */}
      <div className="px-4 sm:px-5 pb-2 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="bp-segmented" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              aria-pressed={rangeKey === r.key}
              className={`bp-seg-btn ${rangeKey === r.key ? 'is-active' : ''}`}
            >
              {r.key}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-3 flex-wrap text-[13px] text-[var(--ink-muted)] tabular-nums">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-0.5 bg-[var(--accent)] inline-block" />
            <span>50 DMA {sma50 ? `₹${formatNum2(sma50)}` : '--'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-0.5 bg-[var(--sma200)] inline-block" />
            <span>200 DMA {sma200 ? `₹${formatNum2(sma200)}` : '--'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-0 border-t-2 border-dashed border-[var(--ink-muted)] inline-block" />
            <span>ATH ₹{formatNum2(highAth)}</span>
          </span>
        </div>
      </div>

      {/* Live Candlestick + Volume + Synced RSI Chart Stage */}
      <div className="px-4 sm:px-5 pb-1 relative min-w-0">
        {loading && !activeData && (
          <div className="h-[272px] flex flex-col items-center justify-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <div className="animate-spin rounded-full h-6 w-6 border-[2.5px] border-[var(--accent)] border-t-transparent" />
            <span>Loading {symbol} chart...</span>
          </div>
        )}

        {error && !activeData && (
          <div className="h-[272px] flex flex-col items-center justify-center gap-2.5 text-center px-4">
            <AlertTriangle className="w-5 h-5 text-[var(--down)]" />
            <p className="text-[13px] text-[var(--down)] m-0">{error}</p>
            <button
              type="button"
              onClick={() => setFetchNonce((n) => n + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-[var(--accent)] text-white text-[13px] font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        <div className={loading && !activeData ? 'hidden' : 'block'}>
          <div ref={chartContainerRef} className="w-full min-w-0 h-[196px]" />
          <div className="relative w-full min-w-0 h-[76px] border-t border-[var(--border)]">
            <span className="absolute top-1 left-0 z-10 pointer-events-none text-[13px] font-semibold text-[var(--accent)] tabular-nums bg-[var(--surface)]/85 pr-1.5">
              RSI {rsi14 !== null && rsi14 !== undefined ? Number(rsi14).toFixed(0) : '--'}
            </span>
            <div ref={rsiContainerRef} className="w-full h-full min-w-0" />
          </div>
        </div>
      </div>

      {/* Key Levels 3-Column Typographic Grid */}
      <div className="border-t border-[var(--border)] px-4 sm:px-5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-3.5 gap-y-2.5">
        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">All-time high</div>
          <div className="text-[14px] font-semibold text-[var(--ink)] mt-0.5 leading-[1.25] tabular-nums">
            ₹{formatNum2(highAth)}
            <span
              className={`text-[13px] font-medium ml-1 ${
                Math.abs(distAth) < 0.05 ? 'text-[var(--up)]' : 'text-[var(--ink-muted)]'
              }`}
            >
              ({Math.abs(distAth) < 0.05 ? 'At ATH' : `${Number(distAth).toFixed(2)}%`})
            </span>
          </div>
        </div>

        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">Volume multiple</div>
          <div
            className={`text-[14px] font-semibold mt-0.5 leading-[1.25] tabular-nums ${
              isVolConf ? 'text-[var(--up)]' : 'text-[var(--ink)]'
            }`}
          >
            {Number(volMult).toFixed(2)}×
            <span className="text-[13px] font-medium text-[var(--ink-muted)] ml-1">
              (₹{Number(turnoverCr).toFixed(1)} Cr)
            </span>
          </div>
        </div>

        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">ATR (14)</div>
          <div className="text-[14px] font-semibold text-[var(--ink)] mt-0.5 leading-[1.25] tabular-nums">
            {atr14Pct ? `${Number(atr14Pct).toFixed(2)}%` : '--'}
          </div>
        </div>

        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">50 DMA</div>
          <div className="text-[14px] font-semibold text-[var(--ink)] mt-0.5 leading-[1.25] tabular-nums">
            {sma50 ? `₹${formatNum2(sma50)}` : '--'}
            {dist50 !== null && (
              <span
                className={`text-[13px] font-medium ml-1 ${
                  dist50 >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
                }`}
              >
                ({dist50 >= 0 ? '+' : ''}
                {dist50.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">200 DMA</div>
          <div className="text-[14px] font-semibold text-[var(--ink)] mt-0.5 leading-[1.25] tabular-nums">
            {sma200 ? `₹${formatNum2(sma200)}` : '--'}
            {dist200 !== null && (
              <span
                className={`text-[13px] font-medium ml-1 ${
                  dist200 >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
                }`}
              >
                ({dist200 >= 0 ? '+' : ''}
                {dist200.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[13px] text-[var(--ink-muted)] leading-[1.25]">RSI (14)</div>
          <div className="text-[14px] font-semibold text-[var(--ink)] mt-0.5 leading-[1.25] tabular-nums">
            {rsi14 !== null && rsi14 !== undefined ? Number(rsi14).toFixed(2) : '--'}
          </div>
        </div>
      </div>

      {/* Inline R-Based Position Sizer */}
      <RiskCalculator
        variant="inline"
        symbol={symbol}
        entryDefault={currentPrice}
        stopLossDefault={suggestedSl}
        atr14Pct={atr14Pct}
        isFno={isFno}
        fnoLotSize={fnoLotSize}
      />
    </aside>
  )
}
