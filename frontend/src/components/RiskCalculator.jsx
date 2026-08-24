import React, { useState } from 'react'
import { Calculator, ShieldAlert, Target } from 'lucide-react'

export default function RiskCalculator({ pivotPrice = 1000, stopLoss = 940 }) {
  const [portfolioSize, setPortfolioSize] = useState(500000)
  const [riskPct, setRiskPct] = useState(1.25) // 1.25% portfolio risk
  const [entryPrice, setEntryPrice] = useState(pivotPrice)
  const [slPrice, setSlPrice] = useState(stopLoss)

  // React to prop changes
  React.useEffect(() => {
    setEntryPrice(pivotPrice)
    setSlPrice(stopLoss)
  }, [pivotPrice, stopLoss])

  const riskPerShare = Math.max(0.01, entryPrice - slPrice)
  const tradeRiskPct = ((entryPrice - slPrice) / entryPrice) * 100
  const maxLossAmount = (portfolioSize * riskPct) / 100.0
  const positionShares = Math.floor(maxLossAmount / riskPerShare)
  const totalOutlay = positionShares * entryPrice
  const portfolioAllocPct = (totalOutlay / portfolioSize) * 100.0

  const target2R = entryPrice + (2.0 * riskPerShare)
  const target3R = entryPrice + (3.0 * riskPerShare)

  return (
    <div className="bg-white dark:bg-[#161a20] border border-surface-border dark:border-surface-dark-border p-4 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm text-[#1a1a17] dark:text-[#e8eaed] flex items-center gap-2">
          <Calculator className="w-4 h-4 text-trade-green" />
          Minervini Risk-First Sizer
        </h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-banana-soft text-banana-ink font-bold font-mono">
          R-Calculator
        </span>
      </div>

      <div className="space-y-3 text-xs">
        {/* Portfolio & Risk Inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500 font-medium block mb-1">Portfolio (₹):</label>
            <input
              type="number"
              value={portfolioSize}
              onChange={(e) => setPortfolioSize(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-[#1d2229] border border-surface-border dark:border-surface-dark-border rounded-xl font-mono text-xs focus:outline-none focus:border-banana"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium block mb-1">Account Risk %:</label>
            <input
              type="number"
              step="0.25"
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-[#1d2229] border border-surface-border dark:border-surface-dark-border rounded-xl font-mono text-xs focus:outline-none focus:border-banana"
            />
          </div>
        </div>

        {/* Calculated Results */}
        <div className="bg-gray-50 dark:bg-[#1d2229] p-3 rounded-xl space-y-2 num">
          <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
            <span>Max Portfolio Loss (1R):</span>
            <span className="font-bold text-trade-red dark:text-[#ff6b5e]">₹{maxLossAmount.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
            <span>Suggested Shares:</span>
            <span className="font-bold text-[#1a1a17] dark:text-[#e8eaed]">{positionShares.toLocaleString('en-IN')} shares</span>
          </div>
          <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
            <span>Capital Outlay:</span>
            <span className="font-semibold">₹{totalOutlay.toLocaleString('en-IN')} ({portfolioAllocPct.toFixed(1)}%)</span>
          </div>
        </div>

        {/* Target 2R / 3R Targets */}
        <div className="grid grid-cols-2 gap-2 pt-1 num">
          <div className="bg-trade-green-soft/60 dark:bg-[#12301f]/60 border border-trade-green/30 p-2.5 rounded-xl text-center">
            <div className="text-[10px] text-trade-green dark:text-[#3ecf7d] font-semibold">TARGET 1 (2R)</div>
            <div className="font-bold text-sm text-[#1a1a17] dark:text-[#e8eaed] mt-0.5">₹{target2R.toFixed(1)}</div>
            <div className="text-[10px] text-trade-green font-medium">+{(tradeRiskPct * 2).toFixed(1)}%</div>
          </div>
          <div className="bg-trade-green-soft/60 dark:bg-[#12301f]/60 border border-trade-green/30 p-2.5 rounded-xl text-center">
            <div className="text-[10px] text-trade-green dark:text-[#3ecf7d] font-semibold">TARGET 2 (3R)</div>
            <div className="font-bold text-sm text-[#1a1a17] dark:text-[#e8eaed] mt-0.5">₹{target3R.toFixed(1)}</div>
            <div className="text-[10px] text-trade-green font-medium">+{(tradeRiskPct * 3).toFixed(1)}%</div>
          </div>
        </div>

      </div>
    </div>
  )
}
