import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { GroundNode, groundHandleId } from '../../models'
import { useHarnessStore } from '../../store'

export type GroundFlowNode = Node<GroundNode, 'ground'>

const SIDE_POSITIONS = [Position.Left, Position.Right, Position.Top, Position.Bottom]

export function GroundNodeComponent({ data, selected }: NodeProps<GroundFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const connectedCount = Array.from({ length: data.handleCount }, (_, i) =>
    groundHandleId(data.id, i)
  ).filter((hid) => wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)).length

  return (
    <div
      className={`ground-node${selected ? ' ground-node--selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'ground') }}
      title={`${data.label} — ${connectedCount} wire(s) connected`}
    >
      {/* One handle slot per wire connection — grows as wires are added */}
      {Array.from({ length: data.handleCount }, (_, i) => {
        const hid = groundHandleId(data.id, i)
        const pos = SIDE_POSITIONS[i % SIDE_POSITIONS.length]
        const isConnected = wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)
        return (
          <Handle
            key={hid}
            type="source"
            position={pos}
            id={hid}
            className={`ground-handle${isConnected ? ' ground-handle--connected' : ''}`}
          />
        )
      })}

      <div className="ground-node__symbol">
        {/* Ground symbol: horizontal lines tapering downward */}
        <div className="ground-line ground-line--1" />
        <div className="ground-line ground-line--2" />
        <div className="ground-line ground-line--3" />
      </div>
      <span className="ground-node__label">{data.label}</span>
    </div>
  )
}
