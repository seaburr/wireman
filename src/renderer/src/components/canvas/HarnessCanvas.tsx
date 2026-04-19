import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  Connection, Edge, EdgeTypes, NodeChange, EdgeChange,
  MarkerType, NodeTypes, useNodesState, useEdgesState, Node,
  ConnectionMode
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useShallow } from 'zustand/react/shallow'
import { ConnectorNodeComponent, ConnectorFlowNode } from './ConnectorNodeComponent'
import { SpliceNodeComponent, SpliceFlowNode } from './SpliceNodeComponent'
import { GroundNodeComponent, GroundFlowNode } from './GroundNodeComponent'
import { CableEdgeComponent } from './CableEdgeComponent'
import { useHarnessStore } from '../../store'
import { WIRE_COLORS } from '../../models'

const nodeTypes: NodeTypes = {
  connector: ConnectorNodeComponent,
  splice:    SpliceNodeComponent,
  ground:    GroundNodeComponent
}

const edgeTypes: EdgeTypes = {
  cable: CableEdgeComponent,
}

type AnyFlowNode = ConnectorFlowNode | SpliceFlowNode | GroundFlowNode

/** Edge IDs for collapsed cables use this prefix so we can distinguish them. */
const CABLE_EDGE_PREFIX = '__cable__'

export function HarnessCanvas() {
  const {
    connectors, wires, cables, splices, grounds,
    addWire, moveConnector, moveSplice, moveGround,
    removeWire, removeConnector, removeSplice, removeGround,
    select, selectedId, selectedType
  } = useHarnessStore(
    useShallow((s) => ({
      connectors:      s.connectors,
      wires:           s.wires,
      cables:          s.cables,
      splices:         s.splices,
      grounds:         s.grounds,
      addWire:         s.addWire,
      moveConnector:   s.moveConnector,
      moveSplice:      s.moveSplice,
      moveGround:      s.moveGround,
      removeWire:      s.removeWire,
      removeConnector: s.removeConnector,
      removeSplice:    s.removeSplice,
      removeGround:    s.removeGround,
      select:          s.select,
      selectedId:      s.selectedId,
      selectedType:    s.selectedType
    }))
  )

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<AnyFlowNode>([])
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge>([])

  // ── Derive nodes from store ──────────────────────────────────────────────

  const storeNodes: AnyFlowNode[] = useMemo(() => [
    ...connectors.map((c): ConnectorFlowNode => ({
      id: c.id, type: 'connector' as const,
      position: c.position,
      selected: selectedId === c.id && selectedType === 'connector',
      data: c
    })),
    ...splices.map((sp): SpliceFlowNode => ({
      id: sp.id, type: 'splice' as const,
      position: sp.position,
      selected: selectedId === sp.id && selectedType === 'splice',
      data: sp
    })),
    ...grounds.map((g): GroundFlowNode => ({
      id: g.id, type: 'ground' as const,
      position: g.position,
      selected: selectedId === g.id && selectedType === 'ground',
      data: g
    }))
  ], [connectors, splices, grounds, selectedId, selectedType])

  // ── Derive edges from store ──────────────────────────────────────────────

  const storeEdges: Edge[] = useMemo(() => {
    // Build a map: handleId → nodeId
    const handleToNode = new Map<string, string>()
    for (const c of connectors) {
      for (const t of c.terminals) handleToNode.set(t.id, c.id)
    }
    for (const sp of splices) {
      for (let i = 0; i < sp.handleCount; i++) handleToNode.set(`${sp.id}_${i}`, sp.id)
    }
    for (const g of grounds) {
      for (let i = 0; i < g.handleCount; i++) handleToNode.set(`${g.id}_gnd_${i}`, g.id)
    }

    // IDs of collapsed cables — their individual wire edges are suppressed
    const collapsedIds = new Set(cables.filter((c) => c.collapsed).map((c) => c.id))

    // ── Individual wire edges (skip wires that belong to a collapsed cable) ──
    const wireEdges: Edge[] = wires
      .filter((w) => w.startTerminalId && w.endTerminalId)
      .filter((w) => !w.cableId || !collapsedIds.has(w.cableId))
      .flatMap((w) => {
        const srcNode = handleToNode.get(w.startTerminalId!)
        const tgtNode = handleToNode.get(w.endTerminalId!)
        if (!srcNode || !tgtNode) return []
        const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
        const color = WIRE_COLORS[w.color] ?? '#718096'
        const strokeWidth = cable ? 3 : 2
        return [{
          id: w.id,
          source: srcNode,
          target: tgtNode,
          sourceHandle: w.startTerminalId!,
          targetHandle: w.endTerminalId!,
          label: w.name,
          selected: selectedId === w.id && selectedType === 'wire',
          style: { stroke: color, strokeWidth },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          labelStyle: { fontSize: 10, fill: '#e2e8f0' },
          labelBgStyle: { fill: '#2d3748', fillOpacity: 0.8 },
          type: 'smoothstep'
        } as Edge]
      })

    // ── Collapsed cable edges ─────────────────────────────────────────────
    const cableEdges: Edge[] = []
    for (const cable of cables) {
      if (!cable.collapsed) continue

      const cableWires = wires.filter(
        (w) => w.cableId === cable.id && w.startTerminalId && w.endTerminalId
      )
      if (cableWires.length === 0) continue

      // Find the most common (srcNode, tgtNode) pair across all wires in the cable
      const pairCounts = new Map<string, { src: string; tgt: string; count: number }>()
      for (const w of cableWires) {
        const src = handleToNode.get(w.startTerminalId!)
        const tgt = handleToNode.get(w.endTerminalId!)
        if (!src || !tgt || src === tgt) continue
        const key = `${src}→${tgt}`
        if (!pairCounts.has(key)) pairCounts.set(key, { src, tgt, count: 0 })
        pairCounts.get(key)!.count++
      }
      if (pairCounts.size === 0) continue

      const { src: srcNode, tgt: tgtNode } = [...pairCounts.values()]
        .sort((a, b) => b.count - a.count)[0]

      // Wire colors shown at each end — only wires that belong to this pair
      const bundleWires = cableWires.filter((w) => {
        const s = handleToNode.get(w.startTerminalId!)
        const t = handleToNode.get(w.endTerminalId!)
        return (s === srcNode && t === tgtNode) || (s === tgtNode && t === srcNode)
      })
      const wireColors = bundleWires.map((w) => WIRE_COLORS[w.color] ?? '#718096')

      cableEdges.push({
        id: `${CABLE_EDGE_PREFIX}${cable.id}`,
        source: srcNode,
        target: tgtNode,
        type: 'cable',
        deletable: false,      // delete from the properties panel, not via keyboard
        selected: selectedId === cable.id && selectedType === 'cable',
        data: {
          cableName:  cable.name,
          cableColor: cable.color ?? '#4a5568',
          wireColors,
        }
      } as Edge)
    }

    return [...wireEdges, ...cableEdges]
  }, [wires, cables, connectors, splices, grounds, selectedId, selectedType])

  // Sync store → React Flow
  useEffect(() => { setRfNodes(storeNodes) }, [storeNodes, setRfNodes])
  useEffect(() => { setRfEdges(storeEdges) }, [storeEdges, setRfEdges])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const onNodesChange = useCallback(
    (changes: NodeChange<AnyFlowNode>[]) => {
      onRfNodesChange(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          if (connectors.some((c) => c.id === change.id)) moveConnector(change.id, change.position)
          else if (splices.some((s) => s.id === change.id)) moveSplice(change.id, change.position)
          else moveGround(change.id, change.position)
        }
        if (change.type === 'remove') {
          if (connectors.some((c) => c.id === change.id)) removeConnector(change.id)
          else if (splices.some((s) => s.id === change.id)) removeSplice(change.id)
          else if (grounds.some((g) => g.id === change.id)) removeGround(change.id)
        }
      }
    },
    [onRfNodesChange, moveConnector, moveSplice, moveGround,
     removeConnector, removeSplice, removeGround, connectors, splices, grounds]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onRfEdgesChange(changes)
      for (const change of changes) {
        // Cable edges are marked deletable:false; guard anyway
        if (change.type === 'remove' && !change.id.startsWith(CABLE_EDGE_PREFIX)) {
          removeWire(change.id)
        }
      }
    },
    [onRfEdgesChange, removeWire]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return
      addWire(connection.sourceHandle, connection.targetHandle)
    },
    [addWire]
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (edge.id.startsWith(CABLE_EDGE_PREFIX)) {
        // Cable edge — select the cable, not a wire
        select(edge.id.slice(CABLE_EDGE_PREFIX.length), 'cable')
      } else {
        select(edge.id, 'wire')
      }
    },
    [select]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (splices.some((s) => s.id === node.id)) select(node.id, 'splice')
      else if (grounds.some((g) => g.id === node.id)) select(node.id, 'ground')
      else select(node.id, 'connector')
    },
    [select, splices, grounds]
  )

  const onPaneClick = useCallback(() => select(null, null), [select])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="harness-canvas"
      >
        <Background color="#4a5568" gap={20} />
        <Controls />
        <MiniMap nodeColor="#4299e1" maskColor="rgba(26,32,44,0.8)" />
      </ReactFlow>
    </div>
  )
}
