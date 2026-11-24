import React, { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function RiskCalculator({
  variant = 'drawer',
  symbol = '',
  entryDefault = 1000,
  stopLossDefault = 940,
  atr14Pct = null,
  isFno = false,
  fnoLotSize = null,
}) {
  const [portfolioSize, setPortfolioSize] = useState(500000)
  const [riskPct, setRiskPct] = useState(1.0)
  const [entryPrice, setEntryPrice] = useState(entryDefault || 1000)
  const [slPrice, setSlPrice] = useState(stopLossDefault || 940)

  useEffect(() => {
    const safeEntry = Number(entryDefault) > 0 ? Number(entryDefault) : 1000
    const safeSl =
      Number(stopLossDefault) > 0 && Number(stopLossDefault) < safeEntry
        ? Number(stopLossDefault)
        : Number((safeEntry * 0.94).toFixed(2))
    setEntryPrice(Number(safeEntry.toFixed(2)))
    setSlPrice(Number(safeSl.toFixed(2)))
  }, [symbol, entryDefault, stopLossDefault])

  const pSize = Number(portfolioSize)
  const rPct = Number(riskPct)
  const entry = variant === 'inline' ? Number(entryDefault) || Number(entryPrice) : Number(entryPrice)
  const sl = Number(slPrice)

  let validationError = null
  if (!Number.isFinite(pSize) || pSize <= 0) {
    validationError = 'Capital must exceed ₹0.'
  } else if (!Number.isFinite(rPct) || rPct <= 0 || rPct > 25) {
    validationError = 'Risk % must be 0.1 to 25%.'
  } else if (!Number.isFinite(entry) || entry <= 0) {
    validationError = 'Entry must exceed ₹0.'
  } else if (!Number.isFinite(sl) || sl <= 0) {
    validationError = 'Stop loss must exceed ₹0.'
  } else if (sl >= entry) {
    validationError = 'Stop must be below entry.'
  }

  const riskPerShare = !validationError ? entry - sl : 0
  const tradeRiskPct = !validationError ? (riskPerShare / entry) * 100 : 0
  const maxLossAmount = !validationError ? (pSize * rPct) / 100.0 : 0
  const positionShares = !validationError ? Math.floor(maxLossAmount / riskPerShare) : 0
  const totalOutlay = Math.round(positionShares * entry)
  const portfolioAllocPct = !validationError && pSize > 0 ? (totalOutlay / pSize) * 100.0 : 0

  const target2R = !validationError ? entry + 2.0 * riskPerShare : 0
  const target3R = !validationError ? entry + 3.0 * riskPerShare : 0

  const lotSize = isFno && Number(fnoLotSize) > 0 ? Number(fnoLotSize) : null
  const fnoLots = lotSize && !validationError ? Math.floor(positionShares / lotSize) : 0
  const fnoShares = lotSize ? fnoLots * lotSize : 0

  const applyStopPreset = (pctDrop) => {
    if (!Number.isFinite(entry) || entry <= 0) return
    setSlPrice(Number((entry * (1 - pctDrop / 100)).toFixed(2)))
  }

  if (variant === 'inline') {
    return (
      <div className="border-t border-[var(--border)] px-4 sm:px-5 pt-3 pb-0 mt-auto">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ink)]">Position sizer</h3>
          <span
            className={`text-[13px] tabular-nums ${
              validationError ? 'text-[var(--down)] font-medium' : 'text-[var(--ink-muted)]'
            }`}
          >
            {validationError
              ? validationError
              : `1R risk ₹${Math.round(maxLossAmount).toLocaleString('en-IN')}`}
          </span>
        </div>

        <div className="grid grid-cols-[1.2fr_0.85fr_1fr] sm:grid-cols-3 gap-2 sm:gap-2.5 mb-3">
          <div>
            <label htmlFor="rc-inline-cap" className="block text-[13px] text-[var(--ink-muted)] mb-1">
              Capital (₹)
            </label>
            <input
              id="rc-inline-cap"
              type="number"
              min="1"
              step="25000"
              value={portfolioSize}
              onChange={(e) => setPortfolioSize(e.target.value)}
              className="w-full h-[34px] px-2.5 text-[14px] font-medium tabular-nums text-[var(--ink)] bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] outline-none bp-transition"
            />
          </div>
          <div>
            <label htmlFor="rc-inline-risk" className="block text-[13px] text-[var(--ink-muted)] mb-1">
              Risk (%)
            </label>
            <input
              id="rc-inline-risk"
              type="number"
              min="0.1"
              max="25"
              step="0.25"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="w-full h-[34px] px-2.5 text-[14px] font-medium tabular-nums text-[var(--ink)] bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] outline-none bp-transition"
            />
          </div>
          <div>
            <label htmlFor="rc-inline-sl" className="block text-[13px] text-[var(--ink-muted)] mb-1">
              Stop loss (₹)
            </label>
            <input
              id="rc-inline-sl"
              type="number"
              min="0.05"
              step="0.5"
              value={slPrice}
              onChange={(e) => setSlPrice(e.target.value)}
              className="w-full h-[34px] px-2.5 text-[14px] font-medium tabular-nums text-[var(--ink)] bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] outline-none bp-transition"
            />
          </div>
        </div>

        <div className="bg-[var(--surface-subtle)] border-t border-[var(--border)] -mx-4 sm:-mx-5 px-4 sm:px-5 py-2.5 flex items-baseline justify-between gap-2.5 flex-wrap text-[13px] text-[var(--ink-muted)] tabular-nums">
          <span>
            Qty{' '}
            <strong className="font-semibold text-[var(--ink)]">
              {positionShares.toLocaleString('en-IN')} shares
            </strong>{' '}
            (<span>₹{totalOutlay.toLocaleString('en-IN')}</span>)
            {lotSize && !validationError && fnoLots > 0 ? (
              <span className="text-[var(--accent)] font-medium">
                {' '}
                · {fnoLots} {fnoLots === 1 ? 'lot' : 'lots'}
              </span>
            ) : null}
          </span>
          <span className="text-[var(--up)] font-semibold">
            {validationError ? '--' : `2R ₹${target2R.toFixed(2)} · 3R ₹${target3R.toFixed(2)}`}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 font-semibold text-[14px] text-[var(--ink)]">Position sizer</h3>
        <span className="text-[13px] text-[var(--ink-muted)] tabular-nums">
          {!validationError ? `1R ₹${Math.round(maxLossAmount).toLocaleString('en-IN')}` : 'Check inputs'}
        </span>
      </div>

      {/* Portfolio & Risk Inputs */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="rc-portfolio" className="text-[13px] text-[var(--ink-muted)] font-medium block mb-1">
            Capital (₹)
          </label>
          <input
            id="rc-portfolio"
            type="number"
            min="1"
            step="25000"
            value={portfolioSize}
            onChange={(e) => setPortfolioSize(e.target.value)}
            className="w-full h-[34px] px-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] tabular-nums text-[14px] text-[var(--ink)] outline-none bp-transition"
          />
        </div>
        <div>
          <label htmlFor="rc-risk" className="text-[13px] text-[var(--ink-muted)] font-medium block mb-1">
            Risk (%)
          </label>
          <input
            id="rc-risk"
            type="number"
            min="0.1"
            max="25"
            step="0.25"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            className="w-full h-[34px] px-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] tabular-nums text-[14px] text-[var(--ink)] outline-none bp-transition"
          />
        </div>
        <div>
          <label htmlFor="rc-entry" className="text-[13px] text-[var(--ink-muted)] font-medium block mb-1">
            Entry (₹)
          </label>
          <input
            id="rc-entry"
            type="number"
            min="0.05"
            step="0.5"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            className="w-full h-[34px] px-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] tabular-nums text-[14px] text-[var(--ink)] outline-none bp-transition"
          />
        </div>
        <div>
          <label htmlFor="rc-sl" className="text-[13px] text-[var(--ink-muted)] font-medium block mb-1">
            Stop loss (₹)
          </label>
          <input
            id="rc-sl"
            type="number"
            min="0.05"
            step="0.5"
            value={slPrice}
            onChange={(e) => setSlPrice(e.target.value)}
            className="w-full h-[34px] px-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] rounded-[5px] tabular-nums text-[14px] text-[var(--ink)] outline-none bp-transition"
          />
        </div>
      </div>

      {/* Quick Stop-Loss Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] text-[var(--ink-muted)]">Stop presets:</span>
        <div className="bp-segmented" role="group" aria-label="Stop loss presets">
          {Number(atr14Pct) > 0 && (
            <button
              type="button"
              onClick={() => applyStopPreset(1.5 * Number(atr14Pct))}
              className="bp-seg-btn"
            >
              1.5× ATR (-{(1.5 * Number(atr14Pct)).toFixed(1)}%)
            </button>
          )}
          <button type="button" onClick={() => applyStopPreset(5)} className="bp-seg-btn">
            -5%
          </button>
          <button type="button" onClick={() => applyStopPreset(8)} className="bp-seg-btn">
            -8%
          </button>
        </div>
      </div>

      {validationError ? (
        <div className="flex items-center gap-2 p-2.5 rounded-[6px] bg-[var(--down-soft)] text-[var(--down)] text-[13px] font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      ) : (
        <div className="border-t border-[var(--border)] pt-3 space-y-2 tabular-nums">
          <div className="flex justify-between items-center text-[var(--ink-muted)]">
            <span>Risk per share (1R)</span>
            <span className="font-semibold text-[var(--ink)]">
              ₹{riskPerShare.toFixed(2)} ({tradeRiskPct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex justify-between items-center text-[var(--ink-muted)]">
            <span>Suggested quantity</span>
            <span className="font-semibold text-[var(--ink)]">
              {positionShares.toLocaleString('en-IN')} shares
            </span>
          </div>
          <div className="flex justify-between items-center text-[var(--ink-muted)]">
            <span>Capital deployed</span>
            <span className="font-semibold text-[var(--ink)]">
              ₹{totalOutlay.toLocaleString('en-IN')} ({portfolioAllocPct.toFixed(1)}%)
            </span>
          </div>
          {lotSize && (
            <div className="flex justify-between items-center text-[var(--accent)]">
              <span>F&amp;O lots ({lotSize}/lot)</span>
              <span className="font-semibold">
                {fnoLots} {fnoLots === 1 ? 'lot' : 'lots'} ({fnoShares.toLocaleString('en-IN')})
              </span>
            </div>
          )}

          <div className="pt-2.5 mt-2 border-t border-[var(--border)] grid grid-cols-2 gap-3">
            <div>
              <div className="text-[13px] text-[var(--ink-muted)]">Target 1 (2R)</div>
              <div className="font-semibold text-[14px] text-[var(--up)] mt-0.5">
                ₹{target2R.toFixed(2)} (+{(tradeRiskPct * 2).toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="text-[13px] text-[var(--ink-muted)]">Target 2 (3R)</div>
              <div className="font-semibold text-[14px] text-[var(--up)] mt-0.5">
                ₹{target3R.toFixed(2)} (+{(tradeRiskPct * 3).toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
