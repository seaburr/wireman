import { describe, it, expect } from 'vitest'
import {
  getPinLayout, getLayoutCols,
  generateBom, validateHarness,
  createConnector, createWire, createCable, createSplice, createGround,
  WIRE_COLORS,
} from '../models'
import type { ConnectorNode, Wire, Cable, SpliceNode, GroundNode } from '../models'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConnector(model: string, pins: number): ConnectorNode {
  return createConnector('C', model, pins, 5, 'BOOT', 0.5, { x: 0, y: 0 })
}

function makeWire(overrides: Partial<Wire> = {}): Wire {
  return { ...createWire('W'), ...overrides }
}

// ── Pin layouts ───────────────────────────────────────────────────────────────

describe('getPinLayout', () => {
  it('returns 2-column layout for DTM-6', () => {
    const layout = getPinLayout('DTM-6', 6)
    expect(layout).toEqual([[1, 4], [2, 5], [3, 6]])
  })

  it('returns 2-column layout for DTM-8', () => {
    const layout = getPinLayout('DTM-8', 8)
    expect(layout).toEqual([[1, 5], [2, 6], [3, 7], [4, 8]])
  })

  it('returns 2-column layout for DTM-12', () => {
    const layout = getPinLayout('DTM-12', 12)
    expect(layout).toEqual([[1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12]])
  })

  it('returns single row for DTM-2', () => {
    expect(getPinLayout('DTM-2', 2)).toEqual([[1, 2]])
  })

  it('returns 2-row 2-column for DTM-4', () => {
    expect(getPinLayout('DTM-4', 4)).toEqual([[1, 2], [3, 4]])
  })

  it('auto-generates a grid layout for unknown models', () => {
    const layout = getPinLayout('CUSTOM-9', 9)
    const allPins = layout.flat().filter((p) => p !== null)
    expect(allPins).toHaveLength(9)
    expect(allPins).toContain(1)
    expect(allPins).toContain(9)
  })

  it('auto-generated layout has 2 columns for a 4-pin custom connector', () => {
    const layout = getPinLayout('CUSTOM-4', 4)
    expect(getLayoutCols(layout)).toBe(2)
  })
})

describe('getLayoutCols', () => {
  it('returns the width of the widest row', () => {
    expect(getLayoutCols([[1, 4], [2, 5], [3, 6]])).toBe(2)
    expect(getLayoutCols([[1, 2, 3], [4, 5, 6]])).toBe(3)
    expect(getLayoutCols([[1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12]])).toBe(2)
  })
})

// ── BOM generation ────────────────────────────────────────────────────────────

describe('generateBom', () => {
  const empty: ConnectorNode[] = []
  const noWires: Wire[] = []
  const noCables: Cable[] = []
  const noSplices: SpliceNode[] = []
  const noGrounds: GroundNode[] = []

  it('returns zero costs for an empty harness', () => {
    const bom = generateBom(empty, noWires, noCables, noSplices, noGrounds)
    expect(bom.totalMaterialCostUsd).toBe(0)
    expect(bom.estimatedLaborMin).toBe(0)
    expect(bom.lines).toHaveLength(0)
  })

  it('groups same-model connectors into one line', () => {
    const c1 = makeConnector('DTM-4', 4)
    const c2 = makeConnector('DTM-4', 4)
    const bom = generateBom([c1, c2], noWires, noCables, noSplices, noGrounds)
    const connLine = bom.lines.find((l) => l.category === 'connector')!
    expect(connLine.qty).toBe(2)
    expect(connLine.totalCostUsd).toBeCloseTo(c1.costUsd * 2)
  })

  it('different connector models produce separate BOM lines', () => {
    const c1 = makeConnector('DTM-4', 4)
    const c2 = makeConnector('DTM-6', 6)
    const bom = generateBom([c1, c2], noWires, noCables, noSplices, noGrounds)
    const connLines = bom.lines.filter((l) => l.category === 'connector')
    expect(connLines).toHaveLength(2)
  })

  it('groups wires by AWG gauge — single line per gauge summing total feet', () => {
    const w1 = makeWire({ awg: '22', lengthInches: 24 })  // 2 ft
    const w2 = makeWire({ awg: '22', lengthInches: 12 })  // 1 ft  → total 3 ft
    const w3 = makeWire({ awg: '18', lengthInches: 36 })  // 3 ft  → separate gauge
    const bom = generateBom(empty, [w1, w2, w3], noCables, noSplices, noGrounds)
    const wireLines = bom.lines.filter((l) => l.category === 'wire')
    expect(wireLines).toHaveLength(2)
    const line22 = wireLines.find((l) => l.partNumber === 'WIRE-22AWG')!
    expect(line22.qty).toBeCloseTo(3)   // 3 ft total
  })

  it('uses cable length for wires assigned to a cable', () => {
    const cable: Cable = { ...createCable('C1'), lengthInches: 60 }  // 5 ft
    const w = makeWire({ awg: '22', lengthInches: 12, cableId: cable.id })
    const bom = generateBom(empty, [w], [cable], noSplices, noGrounds)
    const wireLine = bom.lines.find((l) => l.category === 'wire')!
    expect(wireLine.qty).toBeCloseTo(5)   // cable length overrides wire length
  })

  it('adds a splice line when splices exist', () => {
    const sp = createSplice({ x: 0, y: 0 })
    const bom = generateBom(empty, noWires, noCables, [sp], noGrounds)
    const spliceLine = bom.lines.find((l) => l.category === 'splice' && l.partNumber === 'SPLICE-BUTT')!
    expect(spliceLine.qty).toBe(1)
  })

  it('adds a ring terminal line when grounds exist', () => {
    const g = createGround({ x: 0, y: 0 })
    const bom = generateBom(empty, noWires, noCables, noSplices, [g])
    expect(bom.lines.some((l) => l.partNumber === 'TERM-RING-GND')).toBe(true)
  })

  it('calculates labor based on total terminal count', () => {
    const c = makeConnector('DTM-4', 4)  // 4 terminals
    const bom = generateBom([c], noWires, noCables, noSplices, noGrounds)
    expect(bom.estimatedLaborMin).toBe(4 * 10)  // MIN_PER_TERMINAL = 10
  })

  it('sale price is greater than material cost', () => {
    const c = makeConnector('DTM-4', 4)
    const w = makeWire({ awg: '22', lengthInches: 24 })
    const bom = generateBom([c], [w], noCables, noSplices, noGrounds)
    expect(bom.estimatedSalePriceUsd).toBeGreaterThan(bom.totalMaterialCostUsd)
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('validateHarness', () => {
  it('returns no issues for a fully connected harness', () => {
    const c = makeConnector('DTM-2', 2)
    // Mark both terminals as connected
    c.terminals.forEach((t) => { t.wireId = 'some-wire' })
    const w: Wire = { ...createWire('W'), startTerminalId: 'a', endTerminalId: 'b' }
    const issues = validateHarness([c], [w], [], [])
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('errors on wires with no start connection', () => {
    const w = makeWire({ startTerminalId: null, endTerminalId: 'b' })
    const issues = validateHarness([], [w], [], [])
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('no start'))).toBe(true)
  })

  it('errors on wires with no end connection', () => {
    const w = makeWire({ startTerminalId: 'a', endTerminalId: null })
    const issues = validateHarness([], [w], [], [])
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('no end'))).toBe(true)
  })

  it('warns on connectors with unconnected pins', () => {
    const c = makeConnector('DTM-4', 4)  // all terminals have wireId: null
    const issues = validateHarness([c], [], [], [])
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('unconnected'))).toBe(true)
  })

  it('accumulates multiple issues', () => {
    const c = makeConnector('DTM-2', 2)
    const w1 = makeWire({ startTerminalId: null, endTerminalId: null })
    const w2 = makeWire({ startTerminalId: 'x', endTerminalId: null })
    const issues = validateHarness([c], [w1, w2], [], [])
    expect(issues.length).toBeGreaterThanOrEqual(3)  // 2 wire errors + 1 connector warning
  })
})

// ── Factories ─────────────────────────────────────────────────────────────────

describe('createConnector', () => {
  it('creates the right number of terminals', () => {
    const c = makeConnector('DTM-6', 6)
    expect(c.terminals).toHaveLength(6)
  })

  it('all terminals start with wireId null', () => {
    const c = makeConnector('DTM-4', 4)
    expect(c.terminals.every((t) => t.wireId === null)).toBe(true)
  })

  it('all terminal ids are unique', () => {
    const c = makeConnector('DTM-12', 12)
    const ids = c.terminals.map((t) => t.id)
    expect(new Set(ids).size).toBe(12)
  })
})

describe('createWire', () => {
  it('defaults to WHITE color and 22 AWG', () => {
    const w = createWire('W')
    expect(w.color).toBe('WHITE')
    expect(w.awg).toBe('22')
  })

  it('starts unconnected', () => {
    const w = createWire('W')
    expect(w.startTerminalId).toBeNull()
    expect(w.endTerminalId).toBeNull()
    expect(w.cableId).toBeNull()
  })
})

describe('createCable', () => {
  it('defaults to collapsed: true', () => {
    const c = createCable('Cable 1')
    expect(c.collapsed).toBe(true)
  })

  it('starts with no wires', () => {
    const c = createCable('Cable 1')
    expect(c.wireIds).toHaveLength(0)
  })
})

describe('WIRE_COLORS', () => {
  it('contains expected colors', () => {
    expect(WIRE_COLORS).toHaveProperty('RED')
    expect(WIRE_COLORS).toHaveProperty('BLACK')
    expect(WIRE_COLORS).toHaveProperty('WHITE')
  })

  it('all values are valid hex colors', () => {
    for (const color of Object.values(WIRE_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
