import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { CableBranch, cableBranchHandleId } from '../../models'
import { useHarnessStore } from '../../store'

export type CableBranchFlowNode = Node<CableBranch, 'cableBranch'>

const POSITIONS = [Position.Left, Position.Right, Position.Top, Position.Bottom,
                   Position.Left, Position.Right, Position.Top, Position.Bottom]

export function CableBranchNodeComponent({ data, selected }: NodeProps<CableBranchFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const connectedCount = Array.from({ length: data.handleCount }, (_, i) =>
    cableBranchHandleId(data.id, i)
  ).filter((hid) => wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)).length

  return (
    <div
      className={`cable-branch-node${selected ? ' cable-branch-node--selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'cableBranch') }}
      title={`${data.label} — cable branch point (${connectedCount} wire${connectedCount !== 1 ? 's' : ''} connected). Wires pass through without electrical connection — use to split or merge cable bundles.`}
    >
      {Array.from({ length: data.handleCount }, (_, i) => {
        const hid = cableBranchHandleId(data.id, i)
        const pos = POSITIONS[i % POSITIONS.length]
        const isConnected = wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)
        return (
          <Handle
            key={hid}
            type="source"
            position={pos}
            id={hid}
            className={`branch-handle${isConnected ? ' branch-handle--connected' : ''}`}
            title={`Branch port ${i + 1}`}
          />
        )
      })}
      <svg className="cable-branch-node__svg" width="40" height="36" viewBox="0 0 40 36">
        <polygon
          points="20,2 38,34 2,34"
          fill="#243040"
          stroke={selected ? 'var(--accent)' : '#63b3ed'}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <text x="20" y="25" textAnchor="middle"
          fontSize="6" fontWeight="700" fontFamily="monospace"
          fill={selected ? 'var(--accent)' : '#63b3ed'}>
          {data.label}
        </text>
      </svg>
    </div>
  )
}
