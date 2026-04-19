import { useRef, useLayoutEffect, useState } from 'react'
import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { ConnectorNode, WIRE_COLORS, getPinLayout, getLayoutCols } from '../../models'
import { useHarnessStore } from '../../store'

export type ConnectorFlowNode = Node<ConnectorNode, 'connector'>

const CELL         = 44   // px per pin cell (must match CSS grid)
const GAP          = 4    // px gap between cells
const PAD          = 8    // px face inner padding (inline style)
const FACE_MARGIN  = 8    // px .connector-face horizontal margin (must match CSS)

export function ConnectorNodeComponent({ data, selected }: NodeProps<ConnectorFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const layout = getPinLayout(data.model, data.terminals.length)
  const cols   = getLayoutCols(layout)
  const rows   = layout.length

  // nodeW must accommodate: face margin (both sides) + face padding (both sides) + grid content
  const nodeW = (FACE_MARGIN + PAD) * 2 + cols * CELL + (cols - 1) * GAP

  // Measure the face's actual offsetTop after mount so handle Y values
  // align perfectly regardless of header height or browser font metrics.
  const faceRef = useRef<HTMLDivElement>(null)
  const [faceOffsetTop, setFaceOffsetTop] = useState(32) // reasonable initial estimate

  useLayoutEffect(() => {
    if (faceRef.current) setFaceOffsetTop(faceRef.current.offsetTop)
  }, [data.model, data.terminals.length])

  // Y center of pin row r within the connector-node element
  const rowCenterY = (r: number) =>
    faceOffsetTop + PAD + r * (CELL + GAP) + CELL / 2

  // Map pinNum → { r, c } in layout
  const pinGrid = new Map<number, { r: number; c: number }>()
  layout.forEach((row, r) => row.forEach((pinNum, c) => {
    if (pinNum !== null) pinGrid.set(pinNum, { r, c })
  }))

  // Split by column: left half → left edge, right half → right edge
  const leftPins: number[] = []
  const rightPins: number[] = []
  layout.forEach((row) => row.forEach((pinNum) => {
    if (pinNum === null) return
    const { c } = pinGrid.get(pinNum)!
    if (c < cols / 2) leftPins.push(pinNum)
    else rightPins.push(pinNum)
  }))

  // Compute handle Y for each pin, anchored to its row with intra-row stagger
  // when multiple pins on the same side share a row.
  function buildHandleYMap(pins: number[]): Map<number, number> {
    const byRow = new Map<number, number[]>()
    pins.forEach((p) => {
      const { r } = pinGrid.get(p)!
      if (!byRow.has(r)) byRow.set(r, [])
      byRow.get(r)!.push(p)
    })
    const result = new Map<number, number>()
    byRow.forEach((rowPins, r) => {
      const cy = rowCenterY(r)
      const n  = rowPins.length
      rowPins.forEach((p, i) => {
        const spread = n > 1 ? CELL * 0.3 : 0
        const offset = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2 * spread
        result.set(p, cy + offset)
      })
    })
    return result
  }

  const leftY  = buildHandleYMap(leftPins)
  const rightY = buildHandleYMap(rightPins)

  function EdgeHandle(pinNum: number, side: 'left' | 'right') {
    const terminal = data.terminals[pinNum - 1]
    if (!terminal) return null
    const wire      = terminal.wireId ? wires.find((w) => w.id === terminal.wireId) : null
    const wireColor = wire ? (WIRE_COLORS[wire.color] ?? null) : null
    const top       = (side === 'left' ? leftY : rightY).get(pinNum) ?? 0
    return (
      <Handle
        key={terminal.id}
        type="source"
        position={side === 'left' ? Position.Left : Position.Right}
        id={terminal.id}
        className={`pin-handle-edge${wireColor ? ' pin-handle-edge--connected' : ''}`}
        style={{
          top,
          background:  wireColor ?? undefined,
          borderColor: wireColor ?? undefined,
        }}
      />
    )
  }

  return (
    <div
      className={`connector-node${selected ? ' connector-node--selected' : ''}`}
      style={{ width: nodeW }}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'connector') }}
    >
      <div className="connector-node__header">
        <span className="connector-node__name">{data.name}</span>
        <span className="connector-node__model">{data.model}</span>
      </div>

      {/* Visual pin grid — display only, no handles inside */}
      <div
        ref={faceRef}
        className="connector-face"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
          gridTemplateRows:    `repeat(${rows}, ${CELL}px)`,
          padding: PAD,
          gap:     GAP,
        }}
      >
        {layout.map((row, r) =>
          row.map((pinNum, c) => {
            if (pinNum === null) {
              return <div key={`e-${r}-${c}`} className="pin-cell pin-cell--empty" />
            }
            const terminal = data.terminals[pinNum - 1]
            if (!terminal) return <div key={`e2-${r}-${c}`} className="pin-cell pin-cell--empty" />

            const wire      = terminal.wireId ? wires.find((w) => w.id === terminal.wireId) : null
            const wireColor = wire ? (WIRE_COLORS[wire.color] ?? null) : null

            return (
              <div key={terminal.id} className="pin-cell">
                <div
                  className={`pin-dot${wireColor ? ' pin-dot--connected' : ''}`}
                  style={{
                    background:  wireColor ?? undefined,
                    borderColor: wireColor ?? undefined,
                    boxShadow:   wireColor ? `0 0 5px ${wireColor}55` : undefined,
                  }}
                />
                <span className="pin-number">{pinNum}</span>
              </div>
            )
          })
        )}
      </div>

      <div className="connector-node__key" />

      {/* Edge handles — absolutely positioned relative to connector-node */}
      {leftPins.map((p)  => EdgeHandle(p, 'left'))}
      {rightPins.map((p) => EdgeHandle(p, 'right'))}
    </div>
  )
}
