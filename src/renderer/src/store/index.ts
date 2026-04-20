import { create } from 'zustand'
import {
  ConnectorNode, Wire, Cable, SpliceNode, GroundNode, FuseBlock, PowerRail, PowerBus, CableBranch,
  createConnector, createTerminal, createWire, createCable, createSplice, createGround,
  createFuseBlock, createPowerRail, createPowerBus, createCableBranch,
  groundHandleId, fuseBlockInHandle, fuseBlockOutHandle, powerRailPosHandle, powerRailNegHandle,
  powerBusInHandle, powerBusOutHandle, cableBranchHandleId,
  generateBom, validateHarness,
  Bom, ValidationIssue
} from '../models'

const MAX_HISTORY = 50

// ── File format versioning ────────────────────────────────────────────────
//
// FILE_VERSION is written into every saved file.
// The loader accepts any version <= FILE_VERSION (older files are always
// openable). A file with a HIGHER version than FILE_VERSION was saved by a
// newer build — we warn but still attempt to load rather than hard-failing,
// because new builds only ever ADD optional fields with safe defaults.
//
// Rules for changing FILE_VERSION:
//   • Adding a new optional field with a ?? default → no bump needed
//   • Renaming or removing a field                  → bump required
//   • Changing the shape of an existing field       → bump required
//
const FILE_VERSION = 1

interface CoreSnapshot {
  connectors: ConnectorNode[]
  wires: Wire[]
  cables: Cable[]
  splices: SpliceNode[]
  grounds: GroundNode[]
  fuseBlocks: FuseBlock[]
  powerRails: PowerRail[]
  powerBuses: PowerBus[]
  cableBranches: CableBranch[]
}

interface HarnessState {
  projectName: string
  setProjectName: (name: string) => void

  connectors: ConnectorNode[]
  wires: Wire[]
  cables: Cable[]
  splices: SpliceNode[]
  grounds: GroundNode[]
  fuseBlocks: FuseBlock[]
  powerRails: PowerRail[]
  powerBuses: PowerBus[]
  cableBranches: CableBranch[]
  selectedId: string | null
  selectedType: 'connector' | 'wire' | 'cable' | 'splice' | 'ground' | 'fuseBlock' | 'powerRail' | 'powerBus' | 'cableBranch' | null

  // History
  past: CoreSnapshot[]
  future: CoreSnapshot[]
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Connector actions
  addConnector: (
    name: string, model: string, terminalCount: number,
    costUsd: number, bootModel: string, bootCostUsd: number,
    position?: { x: number; y: number }
  ) => void
  updateConnector: (id: string, patch: Partial<ConnectorNode>) => void
  /** Returns an error string if rejected, null on success. */
  changeConnectorModel: (
    id: string, model: string, terminalCount: number,
    costUsd: number, bootModel: string, bootCostUsd: number
  ) => string | null
  removeConnector: (id: string) => void
  moveConnector: (id: string, position: { x: number; y: number }) => void

  // Wire actions
  addWire: (startTerminalId?: string, endTerminalId?: string) => void
  updateWire: (id: string, patch: Partial<Omit<Wire, 'id'>>) => void
  removeWire: (id: string) => void

  // Cable actions
  addCable: () => void
  updateCable: (id: string, patch: Partial<Omit<Cable, 'id'>>) => void
  removeCable: (id: string) => void
  assignWireToCable: (wireId: string, cableId: string | null) => void
  /** Toggle collapsed view — not pushed to undo history (view-only state). */
  toggleCableCollapsed: (id: string) => void

  // Splice actions
  addSplice: (position?: { x: number; y: number }) => void
  updateSplice: (id: string, patch: Partial<Omit<SpliceNode, 'id'>>) => void
  removeSplice: (id: string) => void
  moveSplice: (id: string, position: { x: number; y: number }) => void

  // Ground actions
  addGround: (position?: { x: number; y: number }) => void
  updateGround: (id: string, patch: Partial<Omit<GroundNode, 'id'>>) => void
  removeGround: (id: string) => void
  moveGround: (id: string, position: { x: number; y: number }) => void

  // Fuse block actions
  addFuseBlock: (position?: { x: number; y: number }) => void
  updateFuseBlock: (id: string, patch: Partial<Omit<FuseBlock, 'id'>>) => void
  removeFuseBlock: (id: string) => void
  moveFuseBlock: (id: string, position: { x: number; y: number }) => void

  // Power rail actions
  addPowerRail: (position?: { x: number; y: number }) => void
  updatePowerRail: (id: string, patch: Partial<Omit<PowerRail, 'id'>>) => void
  removePowerRail: (id: string) => void
  movePowerRail: (id: string, position: { x: number; y: number }) => void

  // Power bus actions
  addPowerBus: (position?: { x: number; y: number }) => void
  updatePowerBus: (id: string, patch: Partial<Omit<PowerBus, 'id'>>) => void
  removePowerBus: (id: string) => void
  movePowerBus: (id: string, position: { x: number; y: number }) => void

  // Cable branch actions
  addCableBranch: (position?: { x: number; y: number }) => void
  updateCableBranch: (id: string, patch: Partial<Omit<CableBranch, 'id'>>) => void
  removeCableBranch: (id: string) => void
  moveCableBranch: (id: string, position: { x: number; y: number }) => void
  /**
   * Split every wire in `cableId` at this branch point.
   * Each wire A→B becomes: A→branch (stays in cable) + branch→B (new unassigned stub).
   * The new stubs keep the same colour/AWG; assign them to the outgoing cable manually.
   */
  injectCableThroughBranch: (branchId: string, cableId: string) => void

  // Wire actions — reconnect
  /** Move one endpoint of a wire from oldHandle to newHandle. */
  reconnectWire: (wireId: string, oldHandle: string, newHandle: string) => void

  // Selection
  select: (id: string | null, type: HarnessState['selectedType']) => void

  // File I/O
  saveToFile: () => Promise<void>
  loadFromFile: () => Promise<void>

  // Computed
  getBom: () => Bom
  getValidation: () => ValidationIssue[]
}

export const useHarnessStore = create<HarnessState>((set, get) => {
  /** Capture all mutable collections as a cheap snapshot. */
  const snap = (): CoreSnapshot => {
    const s = get()
    return { connectors: s.connectors, wires: s.wires, cables: s.cables,
             splices: s.splices, grounds: s.grounds,
             fuseBlocks: s.fuseBlocks, powerRails: s.powerRails, powerBuses: s.powerBuses,
             cableBranches: s.cableBranches }
  }

  /** Call before every state-mutating action to push a history entry. */
  const pushHistory = () => {
    const current = snap()
    set((s) => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), current],
      future: []
    }))
  }

  return ({
  projectName: 'My Harness',
  setProjectName: (name) => set({ projectName: name }),

  connectors: [],
  wires: [],
  cables: [],
  splices: [],
  grounds: [],
  fuseBlocks: [],
  powerRails: [],
  powerBuses: [],
  cableBranches: [],
  selectedId: null,
  selectedType: null,
  past: [],
  future: [],

  undo: () => {
    const { past, future } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    const current = snap()
    set({
      ...prev,
      past: past.slice(0, -1),
      future: [current, ...future].slice(0, MAX_HISTORY)
    })
  },

  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return
    const next = future[0]
    const current = snap()
    set({
      ...next,
      past: [...past, current].slice(-MAX_HISTORY),
      future: future.slice(1)
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // ── Connectors ──────────────────────────────────────────────────────────

  addConnector: (name, model, terminalCount, costUsd, bootModel, bootCostUsd, position) => {
    pushHistory()
    const pos = position ?? { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 }
    const connector = createConnector(name, model, terminalCount, costUsd, bootModel, bootCostUsd, pos)
    set((s) => ({ connectors: [...s.connectors, connector] }))
  },

  updateConnector: (id, patch) => {
    pushHistory()
    set((s) => ({
      connectors: s.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c))
    }))
  },

  changeConnectorModel: (id, model, terminalCount, costUsd, bootModel, bootCostUsd) => {
    pushHistory()
    const connector = get().connectors.find((c) => c.id === id)
    if (!connector) return 'Connector not found.'

    // Check how many of the terminals that WOULD BE REMOVED still have wires.
    // (A shrink from 4→2 with wires on pins 3 & 4 must be rejected even though
    // connectedCount == terminalCount.)
    const wouldLose = connector.terminals.slice(terminalCount).filter((t) => t.wireId !== null).length
    if (wouldLose > 0) {
      return `Cannot change to ${terminalCount}-pin — ${wouldLose} pin(s) that would be removed still have wires. Disconnect them first.`
    }

    // Keep existing terminals (IDs + wire refs intact), pad with new empty ones
    const kept = connector.terminals.slice(0, terminalCount)
    const added = Array.from(
      { length: terminalCount - kept.length },
      (_, i) => createTerminal(id, kept.length + i)
    )
    set((s) => ({
      connectors: s.connectors.map((c) =>
        c.id === id
          ? { ...c, model, costUsd, bootModel, bootCostUsd, terminals: [...kept, ...added] }
          : c
      )
    }))
    return null
  },

  removeConnector: (id) => {
    pushHistory()
    const connector = get().connectors.find((c) => c.id === id)
    if (!connector) return
    const terminalIds = new Set(connector.terminals.map((t) => t.id))
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && terminalIds.has(w.startTerminalId)) ||
        (w.endTerminalId && terminalIds.has(w.endTerminalId))
      )
      .map((w) => w.id)

    set((s) => ({
      connectors: s.connectors.filter((c) => c.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({
        ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid))
      })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  moveConnector: (id, position) => {
    set((s) => ({
      connectors: s.connectors.map((c) => (c.id === id ? { ...c, position } : c))
    }))
  },

  // ── Wires ────────────────────────────────────────────────────────────────

  addWire: (startTerminalId, endTerminalId) => {
    pushHistory()
    const { connectors, grounds, powerBuses, cableBranches } = get()

    // Enforce one wire per regular connector pin
    const terminalAlreadyUsed = (hid: string | undefined) => {
      if (!hid) return false
      return connectors.some((c) =>
        c.terminals.some((t) => t.id === hid && t.wireId !== null)
      )
    }
    if (terminalAlreadyUsed(startTerminalId) || terminalAlreadyUsed(endTerminalId)) {
      console.warn('Wireman: that pin already has a wire connected.')
      return
    }

    const wire = createWire(`Wire ${get().wires.length + 1}`)
    if (startTerminalId) wire.startTerminalId = startTerminalId
    if (endTerminalId) wire.endTerminalId = endTerminalId

    set((s) => {
      // Update connector terminal wireId references
      const connectors = s.connectors.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) =>
          t.id === startTerminalId || t.id === endTerminalId
            ? { ...t, wireId: wire.id }
            : t
        )
      }))

      // Auto-grow ground handles — always keep ≥1 spare
      const grounds = s.grounds.map((g) => {
        const myHandles = Array.from({ length: g.handleCount }, (_, i) => groundHandleId(g.id, i))
        if (
          (startTerminalId && myHandles.includes(startTerminalId)) ||
          (endTerminalId && myHandles.includes(endTerminalId))
        ) {
          return { ...g, handleCount: g.handleCount + 1 }
        }
        return g
      })

      // Auto-grow power bus output slots — always keep ≥1 spare
      const buses = s.powerBuses.map((pb) => {
        const lastOut = powerBusOutHandle(pb.id, pb.outputCount - 1)
        if (startTerminalId === lastOut || endTerminalId === lastOut) {
          return { ...pb, outputCount: pb.outputCount + 1 }
        }
        return pb
      })

      // Auto-grow cable branch handles — always keep ≥1 spare
      const branches = s.cableBranches.map((br) => {
        const myHandles = Array.from({ length: br.handleCount }, (_, i) => cableBranchHandleId(br.id, i))
        if (
          (startTerminalId && myHandles.includes(startTerminalId)) ||
          (endTerminalId && myHandles.includes(endTerminalId))
        ) {
          return { ...br, handleCount: br.handleCount + 1 }
        }
        return br
      })

      return { wires: [...s.wires, wire], connectors, grounds, powerBuses: buses, cableBranches: branches }
    })
  },

  updateWire: (id, patch) => {
    pushHistory()
    set((s) => ({ wires: s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) }))
  },

  removeWire: (id) => {
    pushHistory()
    const wire = get().wires.find((w) => w.id === id)
    if (!wire) return
    const { startTerminalId, endTerminalId } = wire
    const baseEnd = endTerminalId?.replace('__t', '') ?? null

    set((s) => ({
      wires: s.wires.filter((w) => w.id !== id),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => wid !== id) })),
      connectors: s.connectors.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) =>
          t.id === startTerminalId || t.id === endTerminalId || t.id === baseEnd
            ? { ...t, wireId: null } : t
        )
      })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  // ── Cables ───────────────────────────────────────────────────────────────

  addCable: () => {
    pushHistory()
    const cable = createCable(`Cable ${get().cables.length + 1}`)
    set((s) => ({ cables: [...s.cables, cable] }))
    get().select(cable.id, 'cable')
  },

  updateCable: (id, patch) => {
    pushHistory()
    set((s) => ({ cables: s.cables.map((ca) => (ca.id === id ? { ...ca, ...patch } : ca)) }))
    // If length changed, propagate to wires in the cable
    if (patch.lengthInches !== undefined) {
      // Wires read cable length directly via getBom; no wire mutation needed
      // But we DO update wire.lengthInches so the properties panel reflects it
      const cable = get().cables.find((c) => c.id === id)
      if (cable) {
        set((s) => ({
          wires: s.wires.map((w) =>
            w.cableId === id ? { ...w, lengthInches: patch.lengthInches! } : w
          )
        }))
      }
    }
  },

  removeCable: (id) => {
    pushHistory()
    set((s) => ({
      cables: s.cables.filter((ca) => ca.id !== id),
      wires: s.wires.map((w) => (w.cableId === id ? { ...w, cableId: null } : w)),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  assignWireToCable: (wireId, cableId) => {
    pushHistory()
    const wire = get().wires.find((w) => w.id === wireId)
    if (!wire) return
    const oldCableId = wire.cableId

    set((s) => ({
      wires: s.wires.map((w) =>
        w.id === wireId
          ? { ...w, cableId,
              lengthInches: cableId
                ? (s.cables.find((c) => c.id === cableId)?.lengthInches ?? w.lengthInches)
                : w.lengthInches }
          : w
      ),
      cables: s.cables.map((ca) => {
        if (ca.id === oldCableId) return { ...ca, wireIds: ca.wireIds.filter((id) => id !== wireId) }
        if (ca.id === cableId) return { ...ca, wireIds: [...ca.wireIds, wireId] }
        return ca
      })
    }))
  },

  toggleCableCollapsed: (id) => {
    // Not pushed to history — collapse is a transient view state, not harness data
    set((s) => ({
      cables: s.cables.map((ca) => ca.id === id ? { ...ca, collapsed: !ca.collapsed } : ca)
    }))
  },

  // ── Splices ──────────────────────────────────────────────────────────────

  addSplice: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const splice = createSplice(pos)
    set((s) => ({ splices: [...s.splices, splice] }))
    get().select(splice.id, 'splice')
  },

  updateSplice: (id, patch) => {
    pushHistory()
    set((s) => ({ splices: s.splices.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)) }))
  },

  removeSplice: (id) => {
    pushHistory()
    const splice = get().splices.find((s) => s.id === id)
    if (!splice) return
    const spliceHandles = new Set(
      Array.from({ length: splice.handleCount }, (_, i) => `${id}_${i}`)
    )
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && spliceHandles.has(w.startTerminalId)) ||
        (w.endTerminalId && spliceHandles.has(w.endTerminalId))
      )
      .map((w) => w.id)

    set((s) => ({
      splices: s.splices.filter((sp) => sp.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({
        ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid))
      })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  moveSplice: (id, position) => {
    set((s) => ({
      splices: s.splices.map((sp) => (sp.id === id ? { ...sp, position } : sp))
    }))
  },

  // ── Grounds ───────────────────────────────────────────────────────────────

  addGround: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const ground = createGround(pos)
    set((s) => ({ grounds: [...s.grounds, ground] }))
    get().select(ground.id, 'ground')
  },

  updateGround: (id, patch) => {
    pushHistory()
    set((s) => ({ grounds: s.grounds.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
  },

  removeGround: (id) => {
    pushHistory()
    const ground = get().grounds.find((g) => g.id === id)
    if (!ground) return
    const handles = new Set(Array.from({ length: ground.handleCount }, (_, i) => groundHandleId(id, i)))
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && handles.has(w.startTerminalId)) ||
        (w.endTerminalId && handles.has(w.endTerminalId))
      )
      .map((w) => w.id)
    set((s) => ({
      grounds: s.grounds.filter((g) => g.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid)) })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  moveGround: (id, position) => {
    set((s) => ({ grounds: s.grounds.map((g) => (g.id === id ? { ...g, position } : g)) }))
  },

  // ── Fuse Blocks ───────────────────────────────────────────────────────────

  addFuseBlock: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const fb = createFuseBlock(pos)
    set((s) => ({ fuseBlocks: [...s.fuseBlocks, fb] }))
    get().select(fb.id, 'fuseBlock')
  },

  updateFuseBlock: (id, patch) => {
    pushHistory()
    set((s) => ({
      fuseBlocks: s.fuseBlocks.map((fb) => {
        if (fb.id !== id) return fb
        const updated = { ...fb, ...patch }
        // Keep ampRatings in sync with circuits count
        const circuits = updated.circuits ?? fb.circuits
        const ratings = updated.ampRatings ?? fb.ampRatings
        const synced = Array.from({ length: circuits }, (_, i) => ratings[i] ?? 10)
        return { ...updated, ampRatings: synced }
      })
    }))
  },

  removeFuseBlock: (id) => {
    pushHistory()
    const fb = get().fuseBlocks.find((f) => f.id === id)
    if (!fb) return
    const handles = new Set([
      fuseBlockInHandle(id),
      ...Array.from({ length: fb.circuits }, (_, i) => fuseBlockOutHandle(id, i))
    ])
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && handles.has(w.startTerminalId)) ||
        (w.endTerminalId && handles.has(w.endTerminalId))
      )
      .map((w) => w.id)
    set((s) => ({
      fuseBlocks: s.fuseBlocks.filter((f) => f.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid)) })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  moveFuseBlock: (id, position) => {
    set((s) => ({ fuseBlocks: s.fuseBlocks.map((fb) => (fb.id === id ? { ...fb, position } : fb)) }))
  },

  // ── Power Rails ───────────────────────────────────────────────────────────

  addPowerRail: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const pr = createPowerRail(pos)
    set((s) => ({ powerRails: [...s.powerRails, pr] }))
    get().select(pr.id, 'powerRail')
  },

  updatePowerRail: (id, patch) => {
    pushHistory()
    set((s) => ({ powerRails: s.powerRails.map((pr) => (pr.id === id ? { ...pr, ...patch } : pr)) }))
  },

  removePowerRail: (id) => {
    pushHistory()
    if (!get().powerRails.find((r) => r.id === id)) return
    const handles = new Set([powerRailPosHandle(id), powerRailNegHandle(id)])
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && handles.has(w.startTerminalId)) ||
        (w.endTerminalId && handles.has(w.endTerminalId))
      )
      .map((w) => w.id)
    set((s) => ({
      powerRails: s.powerRails.filter((r) => r.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid)) })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  movePowerRail: (id, position) => {
    set((s) => ({ powerRails: s.powerRails.map((pr) => (pr.id === id ? { ...pr, position } : pr)) }))
  },

  // ── Power Buses ───────────────────────────────────────────────────────────

  addPowerBus: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const pb = createPowerBus(pos)
    set((s) => ({ powerBuses: [...s.powerBuses, pb] }))
    get().select(pb.id, 'powerBus')
  },

  updatePowerBus: (id, patch) => {
    pushHistory()
    set((s) => ({ powerBuses: s.powerBuses.map((pb) => (pb.id === id ? { ...pb, ...patch } : pb)) }))
  },

  removePowerBus: (id) => {
    pushHistory()
    const pb = get().powerBuses.find((b) => b.id === id)
    if (!pb) return
    const handles = new Set([
      powerBusInHandle(id),
      ...Array.from({ length: pb.outputCount }, (_, i) => powerBusOutHandle(id, i))
    ])
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && handles.has(w.startTerminalId)) ||
        (w.endTerminalId && handles.has(w.endTerminalId))
      )
      .map((w) => w.id)
    set((s) => ({
      powerBuses: s.powerBuses.filter((b) => b.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid)) })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  movePowerBus: (id, position) => {
    set((s) => ({ powerBuses: s.powerBuses.map((pb) => (pb.id === id ? { ...pb, position } : pb)) }))
  },

  // ── Cable Branches ─────────────────────────────────────────────────────────

  addCableBranch: (position) => {
    pushHistory()
    const pos = position ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 }
    const br = createCableBranch(pos)
    set((s) => ({ cableBranches: [...s.cableBranches, br] }))
    get().select(br.id, 'cableBranch')
  },

  updateCableBranch: (id, patch) => {
    pushHistory()
    set((s) => ({ cableBranches: s.cableBranches.map((br) => (br.id === id ? { ...br, ...patch } : br)) }))
  },

  removeCableBranch: (id) => {
    pushHistory()
    const br = get().cableBranches.find((b) => b.id === id)
    if (!br) return
    const handles = new Set(
      Array.from({ length: br.handleCount }, (_, i) => cableBranchHandleId(id, i))
    )
    const wireIdsToRemove = get().wires
      .filter((w) =>
        (w.startTerminalId && handles.has(w.startTerminalId)) ||
        (w.endTerminalId && handles.has(w.endTerminalId))
      )
      .map((w) => w.id)
    set((s) => ({
      cableBranches: s.cableBranches.filter((b) => b.id !== id),
      wires: s.wires.filter((w) => !wireIdsToRemove.includes(w.id)),
      cables: s.cables.map((ca) => ({ ...ca, wireIds: ca.wireIds.filter((wid) => !wireIdsToRemove.includes(wid)) })),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType
    }))
  },

  moveCableBranch: (id, position) => {
    set((s) => ({ cableBranches: s.cableBranches.map((br) => (br.id === id ? { ...br, position } : br)) }))
  },

  injectCableThroughBranch: (branchId, cableId) => {
    pushHistory()
    const s = get()
    const branch = s.cableBranches.find((b) => b.id === branchId)
    if (!branch) return
    const sourceCable = s.cables.find((c) => c.id === cableId)
    if (!sourceCable) return
    const cableWires = s.wires.filter(
      (w) => w.cableId === cableId && w.startTerminalId && w.endTerminalId
    )
    if (cableWires.length === 0) return

    // Build handle→node maps
    const handleToNodeId = new Map<string, string>()
    const nodeIdToName = new Map<string, string>()
    for (const c of s.connectors) {
      nodeIdToName.set(c.id, c.name)
      for (const t of c.terminals) handleToNodeId.set(t.id, c.id)
    }
    for (const sp of s.splices) {
      nodeIdToName.set(sp.id, sp.label)
      for (let i = 0; i < sp.handleCount; i++) handleToNodeId.set(`${sp.id}_${i}`, sp.id)
    }
    for (const g of s.grounds) {
      nodeIdToName.set(g.id, g.label)
      for (let i = 0; i < g.handleCount; i++) handleToNodeId.set(`${g.id}_gnd_${i}`, g.id)
    }
    for (const b of s.cableBranches) {
      nodeIdToName.set(b.id, b.label)
      for (let i = 0; i < b.handleCount; i++) handleToNodeId.set(`${b.id}_br_${i}`, b.id)
    }

    // Count how many wires (across all cables) connect to each node.
    // The node with the most connections is the trunk/hub — inject cuts on that side
    // so the trunk stubs go into the shared trunk cable and the original cable keeps
    // its leaf-side wires (e.g. SPLIT → L stays as cable "L").
    const nodeWireCount = new Map<string, number>()
    for (const c of s.cables) {
      for (const wid of c.wireIds) {
        const w = s.wires.find((w2) => w2.id === wid)
        if (!w || !w.startTerminalId || !w.endTerminalId) continue
        const sn = handleToNodeId.get(w.startTerminalId)
        const tn = handleToNodeId.get(w.endTerminalId)
        if (sn) nodeWireCount.set(sn, (nodeWireCount.get(sn) ?? 0) + 1)
        if (tn) nodeWireCount.set(tn, (nodeWireCount.get(tn) ?? 0) + 1)
      }
    }

    let nextIdx = branch.handleCount
    const newWires: Wire[] = []
    const wirePatches = new Map<string, { startTerminalId?: string; endTerminalId?: string }>()
    const terminalRemap = new Map<string, string>()
    // Group trunk stubs by trunk node → one trunk cable per hub connector
    const stubsByTrunk = new Map<string, Wire[]>()
    // Track the leaf node so we can rename the source cable to "[branch] → [leaf]"
    let leafNodeId: string | null = null

    for (const w of cableWires) {
      const brHandle = cableBranchHandleId(branchId, nextIdx++)
      const startNode = handleToNodeId.get(w.startTerminalId!)
      const endNode   = handleToNodeId.get(w.endTerminalId!)
      const startCount = nodeWireCount.get(startNode ?? '') ?? 0
      const endCount   = nodeWireCount.get(endNode   ?? '') ?? 0
      // Cut on the trunk (more-connected) side; default to end if equal
      const cutAtStart = startCount > endCount

      const stub = createWire(w.name)
      stub.color = w.color
      stub.awg = w.awg
      stub.lengthInches = sourceCable.lengthInches
      stub.cableId = null

      let trunkNodeId: string
      if (cutAtStart) {
        const oldStart = w.startTerminalId!
        stub.startTerminalId = oldStart
        stub.endTerminalId = brHandle
        wirePatches.set(w.id, { startTerminalId: brHandle })
        if (s.connectors.some((c) => c.terminals.some((t) => t.id === oldStart)))
          terminalRemap.set(oldStart, stub.id)
        trunkNodeId = startNode ?? oldStart
        if (!leafNodeId) leafNodeId = endNode ?? null
      } else {
        const oldEnd = w.endTerminalId!
        stub.startTerminalId = brHandle
        stub.endTerminalId = oldEnd
        wirePatches.set(w.id, { endTerminalId: brHandle })
        if (s.connectors.some((c) => c.terminals.some((t) => t.id === oldEnd)))
          terminalRemap.set(oldEnd, stub.id)
        trunkNodeId = endNode ?? oldEnd
        if (!leafNodeId) leafNodeId = startNode ?? null
      }

      newWires.push(stub)
      if (!stubsByTrunk.has(trunkNodeId)) stubsByTrunk.set(trunkNodeId, [])
      stubsByTrunk.get(trunkNodeId)!.push(stub)
    }

    // Rename the source cable to "[branch.label] → [leaf connector]"
    const leafName = leafNodeId ? (nodeIdToName.get(leafNodeId) ?? sourceCable.name) : sourceCable.name
    const newSourceCableName = `${branch.label} → ${leafName}`

    // Create or merge trunk cables
    const newCables: Cable[] = []
    const existingCableAppend = new Map<string, string[]>()

    for (const [trunkNodeId, stubs] of stubsByTrunk) {
      // Find existing trunk cable: wires going from trunkNode → branch (or vice-versa)
      const existing = s.cables.find((c) =>
        s.wires.some((w) => {
          if (!c.wireIds.includes(w.id)) return false
          if (!w.startTerminalId || !w.endTerminalId) return false
          const startAtBranch  = w.startTerminalId.startsWith(`${branchId}_br_`)
          const endAtBranch    = w.endTerminalId.startsWith(`${branchId}_br_`)
          const startIsTrunk   = handleToNodeId.get(w.startTerminalId) === trunkNodeId
          const endIsTrunk     = handleToNodeId.get(w.endTerminalId)   === trunkNodeId
          return (startAtBranch && endIsTrunk) || (endAtBranch && startIsTrunk)
        })
      )

      if (existing) {
        if (!existingCableAppend.has(existing.id)) existingCableAppend.set(existing.id, [])
        existingCableAppend.get(existing.id)!.push(...stubs.map((st) => st.id))
        for (const stub of stubs) stub.cableId = existing.id
      } else {
        const trunkName = nodeIdToName.get(trunkNodeId) ?? 'Main'
        const outCable = createCable()
        outCable.name = `${trunkName} → ${branch.label}`
        outCable.lengthInches = sourceCable.lengthInches
        outCable.wireIds = stubs.map((st) => st.id)
        newCables.push(outCable)
        for (const stub of stubs) stub.cableId = outCable.id
      }
    }

    const newHandleCount = nextIdx + 1   // keep one spare

    set((st) => ({
      wires: [
        ...st.wires.map((w) => {
          const p = wirePatches.get(w.id)
          return p ? { ...w, ...p } : w
        }),
        ...newWires,
      ],
      cables: [
        ...st.cables.map((c) => {
          if (c.id === cableId) return { ...c, name: newSourceCableName }
          const append = existingCableAppend.get(c.id)
          return append ? { ...c, wireIds: [...c.wireIds, ...append] } : c
        }),
        ...newCables,
      ],
      connectors: st.connectors.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) =>
          terminalRemap.has(t.id) ? { ...t, wireId: terminalRemap.get(t.id)! } : t
        ),
      })),
      cableBranches: st.cableBranches.map((br) =>
        br.id === branchId ? { ...br, handleCount: newHandleCount } : br
      ),
    }))
  },

  reconnectWire: (wireId, oldHandle, newHandle) => {
    pushHistory()
    const wire = get().wires.find((w) => w.id === wireId)
    if (!wire) return
    const isStart = wire.startTerminalId === oldHandle
    if (!isStart && wire.endTerminalId !== oldHandle) return   // stale call

    // Reject if the new target is a connector terminal already occupied by another wire
    const occupied = get().connectors.some((c) =>
      c.terminals.some((t) => t.id === newHandle && t.wireId !== null && t.wireId !== wireId)
    )
    if (occupied) {
      console.warn('Wireman: reconnect rejected — that pin already has a wire.')
      return
    }

    set((s) => {
      const wires = s.wires.map((w) =>
        w.id !== wireId ? w :
          isStart ? { ...w, startTerminalId: newHandle }
                  : { ...w, endTerminalId: newHandle }
      )

      const connectors = s.connectors.map((c) => ({
        ...c,
        terminals: c.terminals.map((t) => {
          if (t.id === oldHandle) return { ...t, wireId: null }
          if (t.id === newHandle) return { ...t, wireId: wireId }
          return t
        }),
      }))

      // Auto-grow ground handles when reconnecting onto a ground
      const grounds = s.grounds.map((g) => {
        const mine = Array.from({ length: g.handleCount }, (_, i) => groundHandleId(g.id, i))
        return mine.includes(newHandle) ? { ...g, handleCount: g.handleCount + 1 } : g
      })

      // Auto-grow cable branch handles when reconnecting onto a branch
      const cableBranches = s.cableBranches.map((br) => {
        const mine = Array.from({ length: br.handleCount }, (_, i) => cableBranchHandleId(br.id, i))
        return mine.includes(newHandle) ? { ...br, handleCount: br.handleCount + 1 } : br
      })

      return { wires, connectors, grounds, cableBranches }
    })
  },

  // ── Selection / computed ─────────────────────────────────────────────────

  select: (id, type) => set({ selectedId: id, selectedType: type }),

  saveToFile: async () => {
    const { projectName, connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches } = get()
    const json = JSON.stringify(
      { version: FILE_VERSION, projectName, connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches },
      null, 2
    )
    await window.api.saveHarness(json, projectName)
  },

  loadFromFile: async () => {
    const result = await window.api.loadHarness()
    if (!result.ok || !result.json) return
    try {
      const data = JSON.parse(result.json)
      const fileVer = typeof data.version === 'number' ? data.version : 0
      if (fileVer > FILE_VERSION) {
        console.warn(`Wireman: file version ${fileVer} is newer than this build (${FILE_VERSION}). Some data may be ignored.`)
      }
      if (fileVer < 1) { console.error('Wireman: unrecognised file format'); return }
      pushHistory()
      set({
        projectName:   data.projectName   ?? 'My Harness',
        connectors:    data.connectors    ?? [],
        wires:         data.wires         ?? [],
        cables:        data.cables        ?? [],
        splices:       data.splices       ?? [],
        grounds:       data.grounds       ?? [],
        fuseBlocks:    data.fuseBlocks    ?? [],
        powerRails:    data.powerRails    ?? [],
        powerBuses:    data.powerBuses    ?? [],
        cableBranches: data.cableBranches ?? [],
        selectedId:    null,
        selectedType:  null,
      })
    } catch (e) {
      console.error('Failed to parse harness file', e)
    }
  },

  getBom: () => {
    const s = get()
    return generateBom(s.connectors, s.wires, s.cables, s.splices, s.grounds, s.fuseBlocks, s.powerRails, s.powerBuses, s.cableBranches)
  },
  getValidation: () => {
    const s = get()
    return validateHarness(s.connectors, s.wires, s.splices, s.grounds, s.fuseBlocks, s.powerRails, s.powerBuses, s.cableBranches, s.cables)
  }
  })
})
