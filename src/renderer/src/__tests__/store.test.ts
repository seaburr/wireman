import { describe, it, expect, beforeEach } from 'vitest'
import { useHarnessStore } from '../store'
import { createConnector, createWire } from '../models'

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore() {
  useHarnessStore.setState({
    projectName: 'Test',
    connectors: [], wires: [], cables: [], splices: [], grounds: [],
    selectedId: null, selectedType: null,
    past: [], future: [],
  })
}

function get() {
  return useHarnessStore.getState()
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(resetStore)

// ── Connectors ────────────────────────────────────────────────────────────────

describe('addConnector', () => {
  it('adds a connector to the store', () => {
    get().addConnector('A', 'DTM-4', 4, 5, 'BOOT', 0.5)
    expect(get().connectors).toHaveLength(1)
    expect(get().connectors[0].name).toBe('A')
  })

  it('creates the correct number of terminals', () => {
    get().addConnector('A', 'DTM-6', 6, 5, 'BOOT', 0.5)
    expect(get().connectors[0].terminals).toHaveLength(6)
  })

  it('pushes a history entry', () => {
    get().addConnector('A', 'DTM-4', 4, 5, 'BOOT', 0.5)
    expect(get().past).toHaveLength(1)
  })
})

describe('removeConnector', () => {
  it('removes the connector', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    get().removeConnector(id)
    expect(get().connectors).toHaveLength(0)
  })

  it('removes wires attached to the connector', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    expect(get().wires).toHaveLength(1)

    get().removeConnector(cA.id)
    expect(get().wires).toHaveLength(0)
  })

  it('clears selection when the selected connector is removed', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    get().select(id, 'connector')
    get().removeConnector(id)
    expect(get().selectedId).toBeNull()
  })
})

describe('changeConnectorModel', () => {
  it('changes the model and terminal count', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    get().changeConnectorModel(id, 'DTM-4', 4, 6, 'BOOT2', 0.6)
    const c = get().connectors[0]
    expect(c.model).toBe('DTM-4')
    expect(c.terminals).toHaveLength(4)
  })

  it('preserves existing terminal IDs when growing', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    const originalIds = get().connectors[0].terminals.map((t) => t.id)
    get().changeConnectorModel(id, 'DTM-4', 4, 6, 'BOOT', 0.5)
    const newIds = get().connectors[0].terminals.slice(0, 2).map((t) => t.id)
    expect(newIds).toEqual(originalIds)
  })

  it('rejects shrink when connected pins would be lost', () => {
    get().addConnector('A', 'DTM-4', 4, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-4', 4, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    // Connect pin 3 and 4 of A to pins on B
    get().addWire(cA.terminals[2].id, cB.terminals[0].id)
    get().addWire(cA.terminals[3].id, cB.terminals[1].id)

    const err = get().changeConnectorModel(cA.id, 'DTM-2', 2, 3, 'BOOT', 0.5)
    expect(err).not.toBeNull()
    expect(get().connectors[0].terminals).toHaveLength(4)  // unchanged
  })

  it('returns null on success', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    const err = get().changeConnectorModel(id, 'DTM-4', 4, 6, 'BOOT', 0.5)
    expect(err).toBeNull()
  })
})

// ── Wires ─────────────────────────────────────────────────────────────────────

describe('addWire', () => {
  it('adds a wire connecting two terminals', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    expect(get().wires).toHaveLength(1)
    expect(get().wires[0].startTerminalId).toBe(cA.terminals[0].id)
  })

  it('updates terminal wireId references on both connectors', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    const wireId = get().wires[0].id
    expect(get().connectors[0].terminals[0].wireId).toBe(wireId)
    expect(get().connectors[1].terminals[0].wireId).toBe(wireId)
  })

  it('rejects connecting a terminal that already has a wire', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('C', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB, cC] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    get().addWire(cA.terminals[0].id, cC.terminals[0].id)  // pin already used
    expect(get().wires).toHaveLength(1)
  })
})

describe('removeWire', () => {
  it('removes the wire', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    const wireId = get().wires[0].id
    get().removeWire(wireId)
    expect(get().wires).toHaveLength(0)
  })

  it('clears terminal wireId references after removal', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    const wireId = get().wires[0].id
    get().removeWire(wireId)
    expect(get().connectors[0].terminals[0].wireId).toBeNull()
    expect(get().connectors[1].terminals[0].wireId).toBeNull()
  })
})

// ── Cables ────────────────────────────────────────────────────────────────────

describe('addCable / assignWireToCable', () => {
  it('creates a cable that is collapsed by default', () => {
    get().addCable()
    expect(get().cables[0].collapsed).toBe(true)
  })

  it('assigns a wire to a cable', () => {
    get().addCable()
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    const cableId = get().cables[0].id
    const wireId = get().wires[0].id
    get().assignWireToCable(wireId, cableId)
    expect(get().wires[0].cableId).toBe(cableId)
    expect(get().cables[0].wireIds).toContain(wireId)
  })

  it('unassigning a wire removes it from the cable', () => {
    get().addCable()
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const [cA, cB] = get().connectors
    get().addWire(cA.terminals[0].id, cB.terminals[0].id)
    const cableId = get().cables[0].id
    const wireId = get().wires[0].id
    get().assignWireToCable(wireId, cableId)
    get().assignWireToCable(wireId, null)
    expect(get().wires[0].cableId).toBeNull()
    expect(get().cables[0].wireIds).not.toContain(wireId)
  })
})

describe('toggleCableCollapsed', () => {
  it('toggles collapsed state', () => {
    get().addCable()
    const id = get().cables[0].id
    expect(get().cables[0].collapsed).toBe(true)
    get().toggleCableCollapsed(id)
    expect(get().cables[0].collapsed).toBe(false)
    get().toggleCableCollapsed(id)
    expect(get().cables[0].collapsed).toBe(true)
  })

  it('does NOT push a history entry (view-only state)', () => {
    get().addCable()
    const historyLenBefore = get().past.length
    get().toggleCableCollapsed(get().cables[0].id)
    expect(get().past.length).toBe(historyLenBefore)
  })
})

// ── Splices & Grounds ─────────────────────────────────────────────────────────

describe('addSplice / removeSplice', () => {
  it('adds and removes a splice', () => {
    get().addSplice({ x: 0, y: 0 })
    expect(get().splices).toHaveLength(1)
    get().removeSplice(get().splices[0].id)
    expect(get().splices).toHaveLength(0)
  })

  it('removing a splice also removes its connected wires', () => {
    get().addSplice({ x: 0, y: 0 })
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const splice = get().splices[0]
    const terminal = get().connectors[0].terminals[0]
    get().addWire(terminal.id, `${splice.id}_0`)
    expect(get().wires).toHaveLength(1)
    get().removeSplice(splice.id)
    expect(get().wires).toHaveLength(0)
  })
})

describe('addGround', () => {
  it('auto-grows handle count when a wire connects to it', () => {
    get().addGround({ x: 0, y: 0 })
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const ground = get().grounds[0]
    const terminal = get().connectors[0].terminals[0]
    const initialHandles = ground.handleCount
    get().addWire(terminal.id, `${ground.id}_gnd_0`)
    expect(get().grounds[0].handleCount).toBe(initialHandles + 1)
  })
})

// ── Undo / Redo ───────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  it('canUndo is false on an empty store', () => {
    expect(get().canUndo()).toBe(false)
  })

  it('canUndo is true after an action', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    expect(get().canUndo()).toBe(true)
  })

  it('undo reverses an addConnector', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().undo()
    expect(get().connectors).toHaveLength(0)
  })

  it('redo re-applies the action', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().undo()
    expect(get().canRedo()).toBe(true)
    get().redo()
    expect(get().connectors).toHaveLength(1)
  })

  it('new action clears the redo stack', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().undo()
    get().addConnector('B', 'DTM-4', 4, 5, 'BOOT', 0.5)  // new action
    expect(get().canRedo()).toBe(false)
  })

  it('history does not exceed MAX_HISTORY (50) entries', () => {
    for (let i = 0; i < 60; i++) {
      get().addConnector(`C${i}`, 'DTM-2', 2, 5, 'BOOT', 0.5)
    }
    expect(get().past.length).toBeLessThanOrEqual(50)
  })

  it('undo/redo across multiple actions', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    get().addConnector('B', 'DTM-4', 4, 5, 'BOOT', 0.5)
    get().addConnector('C', 'DTM-6', 6, 5, 'BOOT', 0.5)
    expect(get().connectors).toHaveLength(3)
    get().undo()
    expect(get().connectors).toHaveLength(2)
    get().undo()
    expect(get().connectors).toHaveLength(1)
    get().redo()
    expect(get().connectors).toHaveLength(2)
  })
})

// ── Selection ─────────────────────────────────────────────────────────────────

describe('select', () => {
  it('sets selectedId and selectedType', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    get().select(id, 'connector')
    expect(get().selectedId).toBe(id)
    expect(get().selectedType).toBe('connector')
  })

  it('clears selection when called with null', () => {
    get().addConnector('A', 'DTM-2', 2, 5, 'BOOT', 0.5)
    const id = get().connectors[0].id
    get().select(id, 'connector')
    get().select(null, null)
    expect(get().selectedId).toBeNull()
    expect(get().selectedType).toBeNull()
  })
})
