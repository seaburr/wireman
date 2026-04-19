import { create } from 'zustand'
import {
  ConnectorNode, Wire, Cable, SpliceNode, GroundNode,
  createConnector, createTerminal, createWire, createCable, createSplice, createGround,
  groundHandleId,
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
}

interface HarnessState {
  projectName: string
  setProjectName: (name: string) => void

  connectors: ConnectorNode[]
  wires: Wire[]
  cables: Cable[]
  splices: SpliceNode[]
  grounds: GroundNode[]
  selectedId: string | null
  selectedType: 'connector' | 'wire' | 'cable' | 'splice' | 'ground' | null

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
  /** Capture the five mutable collections as a cheap snapshot. */
  const snap = (): CoreSnapshot => {
    const s = get()
    return { connectors: s.connectors, wires: s.wires, cables: s.cables,
             splices: s.splices, grounds: s.grounds }
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

    const connectedCount = connector.terminals.filter((t) => t.wireId !== null).length
    if (terminalCount < connectedCount) {
      return `Cannot change to ${terminalCount}-pin — ${connectedCount} pin(s) still have wires. Disconnect them first.`
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
    const { connectors, grounds } = get()

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

      // If this wire connects to a ground node, grow its handle count so
      // there is always at least one spare handle available
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

      return { wires: [...s.wires, wire], connectors, grounds }
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

  // ── Selection / computed ─────────────────────────────────────────────────

  select: (id, type) => set({ selectedId: id, selectedType: type }),

  saveToFile: async () => {
    const { projectName, connectors, wires, cables, splices, grounds } = get()
    const json = JSON.stringify({ version: FILE_VERSION, projectName, connectors, wires, cables, splices, grounds }, null, 2)
    await window.api.saveHarness(json, projectName)
  },

  loadFromFile: async () => {
    const result = await window.api.loadHarness()
    if (!result.ok || !result.json) return
    try {
      const data = JSON.parse(result.json)
      const fileVer = typeof data.version === 'number' ? data.version : 0
      if (fileVer > FILE_VERSION) {
        // File is from a newer build — warn but attempt to load anyway,
        // since unknown fields are simply ignored and new fields have defaults.
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
        selectedId:   null,
        selectedType: null,
      })
    } catch (e) {
      console.error('Failed to parse harness file', e)
    }
  },

  getBom: () => generateBom(get().connectors, get().wires, get().cables, get().splices, get().grounds),
  getValidation: () => validateHarness(get().connectors, get().wires, get().splices, get().grounds)
  })
})
