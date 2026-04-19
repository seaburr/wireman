import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { FuseBlock, fuseBlockInHandle, fuseBlockOutHandle } from '../../models'
import { useHarnessStore } from '../../store'

export type FuseBlockFlowNode = Node<FuseBlock, 'fuseBlock'>

const HEADER_H = 28
const ROW_H = 28

export function FuseBlockNodeComponent({ data, selected }: NodeProps<FuseBlockFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const nodeH = HEADER_H + data.circuits * ROW_H
  const inHandle = fuseBlockInHandle(data.id)
  const isInConnected = wires.some((w) => w.startTerminalId === inHandle || w.endTerminalId === inHandle)

  return (
    <div
      className={`fuse-block-node${selected ? ' fuse-block-node--selected' : ''}`}
      style={{ height: nodeH }}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'fuseBlock') }}
      title={`${data.label} — ${data.circuits}-circuit fuse block`}
    >
      {/* All handles are direct children of the root so `top` is relative to the node */}

      {/* Single power-in handle on the left, vertically centered */}
      <Handle
        type="source"
        position={Position.Left}
        id={inHandle}
        className={`fuse-handle fuse-handle--in${isInConnected ? ' fuse-handle--connected' : ''}`}
        style={{ top: nodeH / 2 }}
        title="PWR IN"
      />

      {/* One output handle per circuit on the right */}
      {Array.from({ length: data.circuits }, (_, i) => {
        const hid = fuseBlockOutHandle(data.id, i)
        const isConnected = wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)
        return (
          <Handle
            key={hid}
            type="source"
            position={Position.Right}
            id={hid}
            className={`fuse-handle${isConnected ? ' fuse-handle--connected' : ''}`}
            style={{ top: HEADER_H + i * ROW_H + ROW_H / 2 }}
            title={`Circuit ${i + 1} – ${data.ampRatings[i] ?? 10}A`}
          />
        )
      })}

      {/* Visual content — no handles inside these divs */}
      <div className="fuse-block-node__header">
        <span className="fuse-block-node__label">{data.label}</span>
        <span className="fuse-block-node__meta">{data.circuits}C</span>
      </div>

      {Array.from({ length: data.circuits }, (_, i) => (
        <div key={i} className="fuse-block-node__circuit">
          <span className="fuse-block-node__circuit-num">{i + 1}</span>
          <span className="fuse-block-node__circuit-amp">{data.ampRatings[i] ?? 10}A</span>
        </div>
      ))}
    </div>
  )
}
