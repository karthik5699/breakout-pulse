import React, { useId } from 'react'

function Sparkline({ points, isUp = true, className = '' }) {
  const gradId = useId()
  const w = 76
  const h = 24
  const padX = 3
  const padY = 3

  if (!Array.isArray(points) || points.length < 2) {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={`inline-block align-middle ${className}`}
        aria-hidden="true"
      >
        <line
          x1={padX}
          y1={h / 2}
          x2={w - padX}
          y2={h / 2}
          stroke="var(--border-strong)"
          strokeWidth="1.2"
          strokeDasharray="2 2"
        />
      </svg>
    )
  }

  let minP = points[0]
  let maxP = points[0]
  for (let i = 1; i < points.length; i++) {
    if (points[i] < minP) minP = points[i]
    if (points[i] > maxP) maxP = points[i]
  }
  const span = Math.max(maxP - minP, 1e-6)
  const n = points.length
  const coords = points.map((val, idx) => {
    const x = padX + (idx / Math.max(n - 1, 1)) * (w - 2 * padX)
    const y = h - padY - ((val - minP) / span) * (h - 2 * padY)
    return [Number(x.toFixed(1)), Number(y.toFixed(1))]
  })

  const linePts = coords.map(([x, y]) => `${x},${y}`).join(' ')
  const last = coords[coords.length - 1]
  const areaPts = `${coords[0][0]},${h - 1} ${linePts} ${last[0]},${h - 1}`
  const stroke = isUp ? 'var(--up)' : 'var(--down)'
  const fill = isUp ? 'var(--up-soft)' : 'var(--down-soft)'

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`inline-block align-middle ${className}`}
      aria-hidden="true"
      data-grad={gradId}
    >
      <polygon points={areaPts} fill={fill} />
      <polyline
        points={linePts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={stroke} />
    </svg>
  )
}

export default React.memo(Sparkline)
