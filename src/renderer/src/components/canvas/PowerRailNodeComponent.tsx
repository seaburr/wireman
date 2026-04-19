import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { PowerRail, powerRailPosHandle, powerRailNegHandle } from '../../models'
import { useHarnessStore } from '../../store'

export type PowerRailFlowNode = Node<PowerRail, 'powerRail'>

export function PowerRailNodeComponent({ data, selected }: NodeProps<PowerRailFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const posId = powerRailPosHandle(data.id)
  const negId = powerRailNegHandle(data.id)
  const posConnected = wires.some((w) => w.startTerminalId === posId || w.endTerminalId === posId)
  const negConnected = wires.some((w) => w.startTerminalId === negId || w.endTerminalId === negId)

  return (
    <div
      className={`power-rail-node${selected ? ' power-rail-node--selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'powerRail') }}
      title={`${data.label}`}
    >
      <div className="power-rail-node__label">{data.label}</div>

      <div className="power-rail-node__terminal power-rail-node__terminal--pos">
        <span className="power-rail-node__term-label">+</span>
        <Handle
          type="source"
          position={Position.Right}
          id={posId}
          className={`power-handle power-handle--pos${posConnected ? ' power-handle--connected' : ''}`}
          title="Positive (+)"
        />
      </div>

      <div className="power-rail-node__terminal power-rail-node__terminal--neg">
        <span className="power-rail-node__term-label">−</span>
        <Handle
          type="source"
          position={Position.Right}
          id={negId}
          className={`power-handle power-handle--neg${negConnected ? ' power-handle--connected' : ''}`}
          title="Negative (−)"
        />
      </div>
    </div>
  )
}
