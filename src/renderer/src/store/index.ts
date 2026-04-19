import { create } from 'zustand'
import {
  ConnectorNode, Wire, Cable, SpliceNode, GroundNode, FuseBlock, PowerRail, PowerBus,
  createConnector, createTerminal, createWire, createCable, createSplice, createGround,
  createFuseBlock, createPowerRail, createPowerBus,
  groundHandleId, fuseBlockInHandle, fuseBlockOutHandle, powerRailPosHandle, powerRailNegHandle,
  powerBusInHandle, powerBusOutHandle,
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
  selectedId: string | null
  selectedType: 'connector' | 'wire' | 'cable' | 'splice' | 'ground' | 'fuseBlock' | 'powerRail' | 'powerBus' | null

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
             fuseBlocks: s.fuseBlocks, powerRails: s.powerRails, powerBuses: s.powerBuses }
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
    const { connectors, grounds, powerBuses } = get()

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

      return { wires: [...s.wires, wire], connectors, grounds, powerBuses: buses }
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

  // ── Selection / computed ─────────────────────────────────────────────────

  select: (id, type) => set({ selectedId: id, selectedType: type }),

  saveToFile: async () => {
    const { projectName, connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses } = get()
    const json = JSON.stringify(
      { version: FILE_VERSION, projectName, connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses },
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
        projectName:  data.projectName ?? 'My Harness',
        connectors:   data.connectors  ?? [],
        wires:        data.wires       ?? [],
        cables:       data.cables      ?? [],
        splices:      data.splices     ?? [],
        grounds:      data.grounds     ?? [],
        fuseBlocks:   data.fuseBlocks  ?? [],
        powerRails:   data.powerRails  ?? [],
        powerBuses:   data.powerBuses  ?? [],
        selectedId:   null,
        selectedType: null,
      })
    } catch (e) {
      console.error('Failed to parse harness file', e)
    }
  },

  getBom: () => {
    const s = get()
    return generateBom(s.connectors, s.wires, s.cables, s.splices, s.grounds, s.fuseBlocks, s.powerRails, s.powerBuses)
  },
  getValidation: () => {
    const s = get()
    return validateHarness(s.connectors, s.wires, s.splices, s.grounds, s.fuseBlocks, s.powerRails, s.powerBuses)
  }
  })
})
