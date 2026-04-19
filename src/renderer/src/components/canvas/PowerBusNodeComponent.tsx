import { Handle, Position, NodeProps, Node } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { PowerBus, powerBusInHandle, powerBusOutHandle } from '../../models'
import { useHarnessStore } from '../../store'

export type PowerBusFlowNode = Node<PowerBus, 'powerBus'>

const HEADER_H = 28
const ROW_H = 28

export function PowerBusNodeComponent({ data, selected }: NodeProps<PowerBusFlowNode>) {
  const { select, wires } = useHarnessStore(
    useShallow((s) => ({ select: s.select, wires: s.wires }))
  )

  const nodeH = HEADER_H + data.outputCount * ROW_H
  const inHid = powerBusInHandle(data.id)
  const isInConnected = wires.some((w) => w.startTerminalId === inHid || w.endTerminalId === inHid)

  return (
    <div
      className={`power-bus-node${selected ? ' power-bus-node--selected' : ''}`}
      style={{ height: nodeH }}
      onClick={(e) => { e.stopPropagation(); select(data.id, 'powerBus') }}
      title={`${data.label} — power distribution bus`}
    >
      {/* All handles are direct children of the root so `top` is relative to the node */}

      {/* Single power-feed input on the left, vertically centered */}
      <Handle
        type="source"
        position={Position.Left}
        id={inHid}
        className={`bus-handle bus-handle--in${isInConnected ? ' bus-handle--connected' : ''}`}
        style={{ top: nodeH / 2 }}
        title="PWR IN"
      />

      {/* One output handle per tap on the right */}
      {Array.from({ length: data.outputCount }, (_, i) => {
        const hid = powerBusOutHandle(data.id, i)
        const isConnected = wires.some((w) => w.startTerminalId === hid || w.endTerminalId === hid)
        return (
          <Handle
            key={hid}
            type="source"
            position={Position.Right}
            id={hid}
            className={`bus-handle${isConnected ? ' bus-handle--connected' : ''}`}
            style={{ top: HEADER_H + i * ROW_H + ROW_H / 2 }}
            title={`Out ${i + 1}`}
          />
        )
      })}

      {/* Visual content — no handles inside these divs */}
      <div className="power-bus-node__header">
        <span className="power-bus-node__label">{data.label}</span>
        <span className="power-bus-node__meta">BUS</span>
      </div>

      {Array.from({ length: data.outputCount }, (_, i) => (
        <div key={i} className="power-bus-node__row">
          <span className="power-bus-node__row-num">{i + 1}</span>
          <span className="power-bus-node__row-label">Out</span>
        </div>
      ))}
    </div>
  )
}
