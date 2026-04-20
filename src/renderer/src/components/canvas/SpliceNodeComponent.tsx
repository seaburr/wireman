import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { SpliceNode, spliceHandleId } from '../../models'
import { useHarnessStore } from '../../store'

export type SpliceFlowNode = Node<SpliceNode, 'splice'>

// Handles are distributed around the splice circle.
// First half = targets (incoming), second half = sources (outgoing)
const POSITIONS = [Position.Left, Position.Top, Position.Right, Position.Bottom,
                   Position.Left, Position.Top, Position.Right, Position.Bottom]
const OFFSETS: Record<string, Record<number, React.CSSProperties>> = {
  // For nodes with >4 handles, shift same-side handles apart
}

export function SpliceNodeComponent({ data, selected }: NodeProps<SpliceFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const handles = Array.from({ length: data.handleCount }, (_, i) => {
    const hid = spliceHandleId(data.id, i)
    const isSource = i >= Math.ceil(data.handleCount / 2)
    const pos = POSITIONS[i % POSITIONS.length]
    const isConnected = wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)
    return { hid, isSource, pos, isConnected }
  })

  return (
    <div
      className={`splice-node${selected ? ' splice-node--selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'splice') }}
      title={`${data.label} — electrical splice/junction. Wires connected here are permanently joined (crimp or solder). Appears on the BOM as a splice connector.`}
    >
      {handles.map(({ hid, isSource, pos, isConnected }) => (
        <Handle
          key={hid}
          type={isSource ? 'source' : 'target'}
          position={pos}
          id={hid}
          className={`splice-handle${isConnected ? ' splice-handle--connected' : ''}`}
        />
      ))}
      <div className="splice-node__inner">
        <span className="splice-node__label">{data.label}</span>
      </div>
    </div>
  )
}
