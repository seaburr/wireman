import { EdgeProps, getBezierPath } from '@xyflow/react'

interface CableEdgeData {
  cableName: string
  cableColor: string
  wireColors: string[]   // hex color per wire in the bundle
}

const DOT_R   = 3.5   // radius of each wire-color dot
const DOT_GAP = 9     // vertical spacing between dots

export function CableEdgeComponent({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const wireColors = (data?.wireColors as string[]) ?? []
  const cableColor = (data?.cableColor as string) ?? '#4a5568'
  const cableName  = (data?.cableName  as string) ?? ''

  // Stack dots vertically, centred on the endpoint
  const totalH = (wireColors.length - 1) * DOT_GAP

  const sheathColor  = selected ? '#4299e1' : cableColor
  const sheathWidth  = selected ? 10 : 8
  const outlineWidth = sheathWidth + 4

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Drop-shadow outline rendered first (below sheath) */}
      <path
        d={edgePath}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={outlineWidth}
        fill="none"
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />

      {/* Cable sheath */}
      <path
        d={edgePath}
        stroke={sheathColor}
        strokeWidth={sheathWidth}
        fill="none"
        strokeLinecap="round"
      />

      {/* Wire-color dots — source end */}
      {wireColors.map((color, i) => (
        <circle
          key={`s-${i}`}
          cx={sourceX}
          cy={sourceY + i * DOT_GAP - totalH / 2}
          r={DOT_R}
          fill={color}
          stroke="#0d1520"
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {/* Wire-color dots — target end */}
      {wireColors.map((color, i) => (
        <circle
          key={`t-${i}`}
          cx={targetX}
          cy={targetY + i * DOT_GAP - totalH / 2}
          r={DOT_R}
          fill={color}
          stroke="#0d1520"
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {/* Cable name label — stroked for legibility over any background */}
      <text
        x={labelX}
        y={labelY - 10}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={10}
        fontWeight={600}
        fill="#e2e8f0"
        paintOrder="stroke"
        stroke="#0d1520"
        strokeWidth={3}
        strokeLinejoin="round"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {cableName}
      </text>
    </g>
  )
}
