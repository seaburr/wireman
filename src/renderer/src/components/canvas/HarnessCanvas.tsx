import { useCallback, useEffect, useMemo, useRef } from 'react'
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
import { FuseBlockNodeComponent, FuseBlockFlowNode } from './FuseBlockNodeComponent'
import { PowerRailNodeComponent, PowerRailFlowNode } from './PowerRailNodeComponent'
import { PowerBusNodeComponent, PowerBusFlowNode } from './PowerBusNodeComponent'
import { CableBranchNodeComponent, CableBranchFlowNode } from './CableBranchNodeComponent'
import { CableEdgeComponent } from './CableEdgeComponent'
import { useHarnessStore } from '../../store'
import { WIRE_COLORS, fuseBlockInHandle, fuseBlockOutHandle, powerRailPosHandle, powerRailNegHandle, powerBusInHandle, powerBusOutHandle, cableBranchHandleId } from '../../models'

const nodeTypes: NodeTypes = {
  connector:   ConnectorNodeComponent,
  splice:      SpliceNodeComponent,
  ground:      GroundNodeComponent,
  fuseBlock:   FuseBlockNodeComponent,
  powerRail:   PowerRailNodeComponent,
  powerBus:    PowerBusNodeComponent,
  cableBranch: CableBranchNodeComponent,
}

const edgeTypes: EdgeTypes = {
  cable: CableEdgeComponent,
}

type AnyFlowNode = ConnectorFlowNode | SpliceFlowNode | GroundFlowNode | FuseBlockFlowNode | PowerRailFlowNode | PowerBusFlowNode | CableBranchFlowNode

/** Edge IDs for collapsed cables use this prefix so we can distinguish them. */
const CABLE_EDGE_PREFIX = '__cable__'

export function HarnessCanvas() {
  const {
    connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches,
    addWire, moveConnector, moveSplice, moveGround, moveFuseBlock, movePowerRail, movePowerBus, moveCableBranch,
    removeWire, reconnectWire, removeConnector, removeSplice, removeGround, removeFuseBlock, removePowerRail, removePowerBus, removeCableBranch,
    select, selectedId, selectedType
  } = useHarnessStore(
    useShallow((s) => ({
      connectors:         s.connectors,
      wires:              s.wires,
      cables:             s.cables,
      splices:            s.splices,
      grounds:            s.grounds,
      fuseBlocks:         s.fuseBlocks,
      powerRails:         s.powerRails,
      powerBuses:         s.powerBuses,
      cableBranches:      s.cableBranches,
      addWire:            s.addWire,
      moveConnector:      s.moveConnector,
      moveSplice:         s.moveSplice,
      moveGround:         s.moveGround,
      moveFuseBlock:      s.moveFuseBlock,
      movePowerRail:      s.movePowerRail,
      movePowerBus:       s.movePowerBus,
      moveCableBranch:    s.moveCableBranch,
      removeWire:         s.removeWire,
      reconnectWire:      s.reconnectWire,
      removeConnector:    s.removeConnector,
      removeSplice:       s.removeSplice,
      removeGround:       s.removeGround,
      removeFuseBlock:    s.removeFuseBlock,
      removePowerRail:    s.removePowerRail,
      removePowerBus:     s.removePowerBus,
      removeCableBranch:  s.removeCableBranch,
      select:             s.select,
      selectedId:         s.selectedId,
      selectedType:       s.selectedType
    }))
  )

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<AnyFlowNode>([])
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge>([])

  // Track which edge is mid-reconnect so onEdgesChange doesn't fire removeWire prematurely.
  // RF temporarily removes the edge from its state while the user drags the endpoint.
  const reconnectingEdgeId = useRef<string | null>(null)

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
    })),
    ...fuseBlocks.map((fb): FuseBlockFlowNode => ({
      id: fb.id, type: 'fuseBlock' as const,
      position: fb.position,
      selected: selectedId === fb.id && selectedType === 'fuseBlock',
      data: fb
    })),
    ...powerRails.map((pr): PowerRailFlowNode => ({
      id: pr.id, type: 'powerRail' as const,
      position: pr.position,
      selected: selectedId === pr.id && selectedType === 'powerRail',
      data: pr
    })),
    ...powerBuses.map((pb): PowerBusFlowNode => ({
      id: pb.id, type: 'powerBus' as const,
      position: pb.position,
      selected: selectedId === pb.id && selectedType === 'powerBus',
      data: pb
    })),
    ...cableBranches.map((br): CableBranchFlowNode => ({
      id: br.id, type: 'cableBranch' as const,
      position: br.position,
      selected: selectedId === br.id && selectedType === 'cableBranch',
      data: br
    })),
  ], [connectors, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches, selectedId, selectedType])

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
    for (const fb of fuseBlocks) {
      handleToNode.set(fuseBlockInHandle(fb.id), fb.id)
      for (let i = 0; i < fb.circuits; i++) handleToNode.set(fuseBlockOutHandle(fb.id, i), fb.id)
    }
    for (const pr of powerRails) {
      handleToNode.set(powerRailPosHandle(pr.id), pr.id)
      handleToNode.set(powerRailNegHandle(pr.id), pr.id)
    }
    for (const pb of powerBuses) {
      handleToNode.set(powerBusInHandle(pb.id), pb.id)
      for (let i = 0; i < pb.outputCount; i++) handleToNode.set(powerBusOutHandle(pb.id, i), pb.id)
    }
    for (const br of cableBranches) {
      for (let i = 0; i < br.handleCount; i++) handleToNode.set(cableBranchHandleId(br.id, i), br.id)
    }

    // IDs of CableBranch nodes — excluded when counting distinct endpoint nodes
    const branchNodeIds = new Set(cableBranches.map((b) => b.id))

    // IDs of collapsed cables whose wires all share ≤2 distinct non-branch nodes.
    // Multi-destination cables (wires going to 3+ different connectors) are NOT
    // suppressed — their individual wire edges remain visible to surface the issue.
    const collapsedIds = new Set<string>()
    for (const cable of cables) {
      if (!cable.collapsed) continue
      const cableWires = wires.filter((w) => w.cableId === cable.id && w.startTerminalId && w.endTerminalId)
      if (cableWires.length === 0) continue
      const nonBranchNodes = new Set<string>()
      for (const w of cableWires) {
        const s = handleToNode.get(w.startTerminalId!)
        const t = handleToNode.get(w.endTerminalId!)
        if (s && !branchNodeIds.has(s)) nonBranchNodes.add(s)
        if (t && !branchNodeIds.has(t)) nonBranchNodes.add(t)
      }
      if (nonBranchNodes.size <= 2) {
        collapsedIds.add(cable.id)
      } else {
        // More than 2 distinct endpoint nodes — valid only if a CableBranch mediates the fork
        const hasBranch = cableWires.some((w) => {
          const s = handleToNode.get(w.startTerminalId!)
          const t = handleToNode.get(w.endTerminalId!)
          return (s && branchNodeIds.has(s)) || (t && branchNodeIds.has(t))
        })
        if (hasBranch) collapsedIds.add(cable.id)
        // else: fall through — individual wire edges remain visible
      }
    }

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
          type: 'smoothstep',
          reconnectable: true,
        } as Edge]
      })

    // ── Collapsed cable edges ─────────────────────────────────────────────
    const cableEdges: Edge[] = []
    for (const cable of cables) {
      // Only draw a cable edge for cables that are in collapsedIds (valid single-path cables)
      if (!collapsedIds.has(cable.id)) continue

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
  }, [wires, cables, connectors, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches, selectedId, selectedType])

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
          else if (fuseBlocks.some((f) => f.id === change.id)) moveFuseBlock(change.id, change.position)
          else if (powerRails.some((p) => p.id === change.id)) movePowerRail(change.id, change.position)
          else if (powerBuses.some((b) => b.id === change.id)) movePowerBus(change.id, change.position)
          else if (cableBranches.some((b) => b.id === change.id)) moveCableBranch(change.id, change.position)
          else moveGround(change.id, change.position)
        }
        if (change.type === 'remove') {
          if (connectors.some((c) => c.id === change.id)) removeConnector(change.id)
          else if (splices.some((s) => s.id === change.id)) removeSplice(change.id)
          else if (grounds.some((g) => g.id === change.id)) removeGround(change.id)
          else if (fuseBlocks.some((f) => f.id === change.id)) removeFuseBlock(change.id)
          else if (powerRails.some((p) => p.id === change.id)) removePowerRail(change.id)
          else if (powerBuses.some((b) => b.id === change.id)) removePowerBus(change.id)
          else if (cableBranches.some((b) => b.id === change.id)) removeCableBranch(change.id)
        }
      }
    },
    [onRfNodesChange, moveConnector, moveSplice, moveGround, moveFuseBlock, movePowerRail, movePowerBus, moveCableBranch,
     removeConnector, removeSplice, removeGround, removeFuseBlock, removePowerRail, removePowerBus, removeCableBranch,
     connectors, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onRfEdgesChange(changes)
      for (const change of changes) {
        if (change.type === 'remove' && !change.id.startsWith(CABLE_EDGE_PREFIX)) {
          // Skip: RF temporarily removes the edge while the user drags to reconnect
          if (reconnectingEdgeId.current === change.id) continue
          removeWire(change.id)
        }
      }
    },
    [onRfEdgesChange, removeWire]
  )

  const onReconnectStart = useCallback(
    (_: React.MouseEvent | React.TouchEvent, edge: Edge) => {
      reconnectingEdgeId.current = edge.id
    },
    []
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectingEdgeId.current = null
      if (oldEdge.id.startsWith(CABLE_EDGE_PREFIX)) return
      if (!newConnection.sourceHandle || !newConnection.targetHandle) return
      // Determine which end moved by comparing handles
      if (newConnection.targetHandle !== oldEdge.targetHandle) {
        reconnectWire(oldEdge.id, oldEdge.targetHandle!, newConnection.targetHandle)
      } else if (newConnection.sourceHandle !== oldEdge.sourceHandle) {
        reconnectWire(oldEdge.id, oldEdge.sourceHandle!, newConnection.sourceHandle)
      }
    },
    [reconnectWire]
  )

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent) => {
      // Drop on empty space — clear the flag; store edge is unchanged so
      // the next useEffect sync will restore it in RF's state.
      reconnectingEdgeId.current = null
    },
    []
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
      else if (fuseBlocks.some((f) => f.id === node.id)) select(node.id, 'fuseBlock')
      else if (powerRails.some((p) => p.id === node.id)) select(node.id, 'powerRail')
      else if (powerBuses.some((b) => b.id === node.id)) select(node.id, 'powerBus')
      else if (cableBranches.some((b) => b.id === node.id)) select(node.id, 'cableBranch')
      else select(node.id, 'connector')
    },
    [select, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches]
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
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
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
