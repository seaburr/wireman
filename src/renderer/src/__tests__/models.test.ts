import { describe, it, expect } from 'vitest'
import {
  getPinLayout, getLayoutCols,
  generateBom, generateBuildSteps, validateHarness,
  createConnector, createWire, createCable, createSplice, createGround,
  createFuseBlock, createPowerRail, createPowerBus,
  fuseBlockInHandle, fuseBlockOutHandle, powerRailPosHandle, powerRailNegHandle,
  powerBusInHandle, powerBusOutHandle,
  CONNECTOR_PRESETS, WIRE_COLORS,
} from '../models'
import type { ConnectorNode, Wire, Cable, SpliceNode, GroundNode, FuseBlock, PowerRail } from '../models'

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

// ── Build Steps ───────────────────────────────────────────────────────────────

describe('generateBuildSteps', () => {
  const noSplices: SpliceNode[] = []
  const noGrounds: GroundNode[] = []

  function connectedPair() {
    const a = createConnector('ECU', 'DTM-2', 2, 5, 'BOOT', 0.5, { x: 0, y: 0 })
    const b = createConnector('Sensor', 'DTM-2', 2, 5, 'BOOT', 0.5, { x: 100, y: 0 })
    const w1: Wire = {
      ...createWire('Wire 1'), color: 'GREEN', awg: '22', lengthInches: 36,
      startTerminalId: a.terminals[0].id, endTerminalId: b.terminals[0].id, cableId: null,
    }
    const w2: Wire = {
      ...createWire('Wire 2'), color: 'RED', awg: '22', lengthInches: 36,
      startTerminalId: a.terminals[1].id, endTerminalId: b.terminals[1].id, cableId: null,
    }
    a.terminals[0].wireId = w1.id
    a.terminals[1].wireId = w2.id
    b.terminals[0].wireId = w1.id
    b.terminals[1].wireId = w2.id
    return { a, b, wires: [w1, w2] }
  }

  it('includes a header section for each connector', () => {
    const { a, b, wires } = connectedPair()
    const out = generateBuildSteps([a, b], wires, [], noSplices, noGrounds, 'My Harness')
    expect(out).toContain('ECU')
    expect(out).toContain('Sensor')
    expect(out).toContain('DTM-2')
  })

  it('lists each pin with wire name, color, AWG, and length', () => {
    const { a, b, wires } = connectedPair()
    const out = generateBuildSteps([a, b], wires, [], noSplices, noGrounds, 'Test')
    expect(out).toContain('Wire 1')
    expect(out).toContain('GREEN')
    expect(out).toContain('22 AWG')
    expect(out).toContain("3'")  // 36 inches = 3 feet
  })

  it('annotates each pin with the destination connector and pin', () => {
    const { a, b, wires } = connectedPair()
    const out = generateBuildSteps([a, b], wires, [], noSplices, noGrounds, 'Test')
    // ECU section should point to Sensor
    expect(out).toContain('→ Sensor')
    // Sensor section should point back to ECU
    expect(out).toContain('→ ECU')
  })

  it('shows [empty] for unconnected terminals', () => {
    const c = createConnector('ECU', 'DTM-4', 4, 5, 'BOOT', 0.5, { x: 0, y: 0 })
    const out = generateBuildSteps([c], [], [], noSplices, noGrounds, 'Test')
    expect(out).toMatch(/\[empty\]/)
  })

  it('includes cable group summary when wires share a cable', () => {
    const { a, b, wires } = connectedPair()
    const cable: Cable = { ...createCable('Loom A'), lengthInches: 48, wireIds: [wires[0].id, wires[1].id] }
    wires[0].cableId = cable.id
    wires[1].cableId = cable.id
    const out = generateBuildSteps([a, b], wires, [cable], noSplices, noGrounds, 'Test')
    expect(out).toContain('Loom A')
    expect(out).toContain('Cable groups')
  })

  it('uses cable length instead of wire length when wire belongs to a cable', () => {
    const { a, b, wires } = connectedPair()
    const cable: Cable = { ...createCable('Loom A'), lengthInches: 60, wireIds: [wires[0].id] }
    wires[0].cableId = cable.id
    wires[0].lengthInches = 12  // should be overridden by cable (60" = 5')
    const out = generateBuildSteps([a, b], wires, [cable], noSplices, noGrounds, 'Test')
    expect(out).toContain("5'")
  })

  it('includes a splice section when splices exist', () => {
    const sp = createSplice({ x: 0, y: 0 })
    sp.label = 'SP1'
    const out = generateBuildSteps([], [], [], [sp], noGrounds, 'Test')
    expect(out).toContain('SP1')
  })

  it('includes a ground section when grounds exist', () => {
    const g = createGround({ x: 0, y: 0 })
    g.label = 'GND'
    const out = generateBuildSteps([], [], [], noSplices, [g], 'Test')
    expect(out).toContain('GND')
  })

  it('includes the project name in the header', () => {
    const out = generateBuildSteps([], [], [], noSplices, noGrounds, 'My Race Car')
    expect(out).toContain('My Race Car')
  })
})

// ── Connector Presets ─────────────────────────────────────────────────────────

describe('CONNECTOR_PRESETS', () => {
  it('all presets have a family field', () => {
    expect(CONNECTOR_PRESETS.every((p) => typeof p.family === 'string')).toBe(true)
  })

  it('includes new connector families', () => {
    const families = new Set(CONNECTOR_PRESETS.map((p) => p.family))
    expect(families).toContain('TE Superseal 1.5')
    expect(families).toContain('Molex Micro-Fit 3.0')
    expect(families).toContain('TE Weather Pack')
    expect(families).toContain('Relay')
    expect(families).toContain('Terminal Block')
  })

  it('SS1.5 presets have non-zero boot cost', () => {
    const ss = CONNECTOR_PRESETS.filter((p) => p.family === 'TE Superseal 1.5')
    expect(ss.length).toBeGreaterThan(0)
    expect(ss.every((p) => p.bootCostUsd > 0)).toBe(true)
  })

  it('Molex Micro-Fit presets have no boot (latching housing)', () => {
    const mf = CONNECTOR_PRESETS.filter((p) => p.family === 'Molex Micro-Fit 3.0')
    expect(mf.every((p) => p.bootCostUsd === 0)).toBe(true)
  })

  it('terminal block presets have no boot', () => {
    const tb = CONNECTOR_PRESETS.filter((p) => p.family === 'Terminal Block')
    expect(tb.every((p) => p.bootCostUsd === 0)).toBe(true)
  })

  it('RELAY-5 preset has 5 terminals', () => {
    const relay = CONNECTOR_PRESETS.find((p) => p.model === 'RELAY-5')
    expect(relay).toBeDefined()
    expect(relay!.terminalCount).toBe(5)
  })

  it('getPinLayout returns correct layout for new families', () => {
    expect(getPinLayout('SS1.5-4', 4)).toEqual([[1, 2], [3, 4]])
    expect(getPinLayout('MF3-6', 6)).toEqual([[1, 2], [3, 4], [5, 6]])
    expect(getPinLayout('WP-2', 2)).toEqual([[1, 2]])
    expect(getPinLayout('TB-8', 8)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]])
    expect(getPinLayout('RELAY-5', 5)).toEqual([[1, 2], [3, 4], [5, null]])
  })
})

// ── FuseBlock & PowerRail factories and helpers ───────────────────────────────

describe('createFuseBlock', () => {
  it('creates a fuse block with 4 default circuits', () => {
    const fb = createFuseBlock({ x: 0, y: 0 })
    expect(fb.circuits).toBe(4)
    expect(fb.ampRatings).toHaveLength(4)
    expect(fb.ampRatings.every((a) => a === 10)).toBe(true)
  })

  it('has a unique id', () => {
    const a = createFuseBlock({ x: 0, y: 0 })
    const b = createFuseBlock({ x: 0, y: 0 })
    expect(a.id).not.toBe(b.id)
  })
})

describe('createPowerRail', () => {
  it('creates a battery with default label Battery', () => {
    const pr = createPowerRail({ x: 0, y: 0 })
    expect(pr.label).toBe('Battery')
  })

  it('has a unique id', () => {
    const a = createPowerRail({ x: 0, y: 0 })
    const b = createPowerRail({ x: 0, y: 0 })
    expect(a.id).not.toBe(b.id)
  })
})

describe('handle ID helpers', () => {
  it('fuseBlockInHandle returns {id}_in', () => {
    expect(fuseBlockInHandle('abc')).toBe('abc_in')
  })

  it('fuseBlockOutHandle returns {id}_out_{i}', () => {
    expect(fuseBlockOutHandle('abc', 0)).toBe('abc_out_0')
    expect(fuseBlockOutHandle('abc', 3)).toBe('abc_out_3')
  })

  it('powerRailPosHandle returns {id}_pos', () => {
    expect(powerRailPosHandle('xyz')).toBe('xyz_pos')
  })

  it('powerRailNegHandle returns {id}_neg', () => {
    expect(powerRailNegHandle('xyz')).toBe('xyz_neg')
  })
})

// ── BOM: fuse blocks, power rails, heat shrink ────────────────────────────────

describe('generateBom — fuse blocks', () => {
  it('adds a fuse block housing line', () => {
    const fb = createFuseBlock({ x: 0, y: 0 })
    const bom = generateBom([], [], [], [], [], [fb])
    expect(bom.lines.some((l) => l.category === 'fuse' && l.partNumber === 'FBLOCK-4C')).toBe(true)
  })

  it('adds a fuse line for each circuit', () => {
    const fb = createFuseBlock({ x: 0, y: 0 })  // 4 circuits
    const bom = generateBom([], [], [], [], [], [fb])
    const fuseLine = bom.lines.find((l) => l.partNumber === 'FUSE-MINI')!
    expect(fuseLine.qty).toBe(4)
  })

  it('groups multiple fuse blocks of the same circuit count', () => {
    const fb1 = createFuseBlock({ x: 0, y: 0 })
    const fb2 = createFuseBlock({ x: 100, y: 0 })
    const bom = generateBom([], [], [], [], [], [fb1, fb2])
    const housing = bom.lines.find((l) => l.partNumber === 'FBLOCK-4C')!
    expect(housing.qty).toBe(2)
  })

  it('adds a power distribution stud line for power rails', () => {
    const pr = createPowerRail({ x: 0, y: 0 })
    const bom = generateBom([], [], [], [], [], [], [pr])
    expect(bom.lines.some((l) => l.partNumber === 'TERM-POWER')).toBe(true)
  })
})

describe('generateBom — heat shrink', () => {
  function connectedWire(awg: string): Wire {
    return { ...createWire('W'), awg, startTerminalId: 'a', endTerminalId: 'b' }
  }

  it('adds heat shrink lines for connected wires', () => {
    const w = connectedWire('22')
    const bom = generateBom([], [w], [], [], [])
    expect(bom.lines.some((l) => l.category === 'heatshrink')).toBe(true)
  })

  it('adds 2 pieces per connected wire', () => {
    const w = connectedWire('22')
    const bom = generateBom([], [w], [], [], [])
    const hs = bom.lines.find((l) => l.partNumber === 'HSHRK-3/16')!
    expect(hs.qty).toBe(2)
  })

  it('groups heat shrink by size class, not AWG', () => {
    const w22 = connectedWire('22')  // 3/16"
    const w24 = connectedWire('24')  // 3/16" — same class
    const bom = generateBom([], [w22, w24], [], [], [])
    const hs = bom.lines.filter((l) => l.category === 'heatshrink')
    expect(hs).toHaveLength(1)  // both go into HSHRK-3/16
    expect(hs[0].qty).toBe(4)   // 2 wires × 2 ends each
  })

  it('separates heat shrink sizes for different AWG classes', () => {
    const w22 = connectedWire('22')   // 3/16"
    const w18 = connectedWire('18')   // 1/4"
    const bom = generateBom([], [w22, w18], [], [], [])
    const hs = bom.lines.filter((l) => l.category === 'heatshrink')
    expect(hs).toHaveLength(2)
  })

  it('does not add heat shrink for unconnected wires', () => {
    const w = createWire('W')  // startTerminalId and endTerminalId are null
    const bom = generateBom([], [w], [], [], [])
    expect(bom.lines.some((l) => l.category === 'heatshrink')).toBe(false)
  })
})

describe('createPowerBus', () => {
  it('creates a power bus with default outputCount of 2', () => {
    const pb = createPowerBus({ x: 0, y: 0 })
    expect(pb.outputCount).toBe(2)
    expect(pb.label).toBe('PWR')
  })

  it('has a unique id', () => {
    const a = createPowerBus({ x: 0, y: 0 })
    const b = createPowerBus({ x: 0, y: 0 })
    expect(a.id).not.toBe(b.id)
  })
})

describe('powerBus handle ID helpers', () => {
  it('powerBusInHandle returns {id}_bus_in', () => {
    expect(powerBusInHandle('abc')).toBe('abc_bus_in')
  })

  it('powerBusOutHandle returns {id}_bus_{i}', () => {
    expect(powerBusOutHandle('abc', 0)).toBe('abc_bus_0')
    expect(powerBusOutHandle('abc', 3)).toBe('abc_bus_3')
  })
})

describe('generateBom — power bus', () => {
  it('adds a Power Distribution Bus line for each power bus', () => {
    const pb = createPowerBus({ x: 0, y: 0 })
    const bom = generateBom([], [], [], [], [], [], [], [pb])
    expect(bom.lines.some((l) => l.partNumber === 'BUS-DIST')).toBe(true)
  })

  it('groups multiple power buses into one BOM line', () => {
    const pb1 = createPowerBus({ x: 0, y: 0 })
    const pb2 = createPowerBus({ x: 100, y: 0 })
    const bom = generateBom([], [], [], [], [], [], [], [pb1, pb2])
    const line = bom.lines.find((l) => l.partNumber === 'BUS-DIST')!
    expect(line.qty).toBe(2)
  })
})

describe('generateBuildSteps — power bus', () => {
  it('includes a Power Bus section for each bus', () => {
    const pb = createPowerBus({ x: 0, y: 0 })
    const out = generateBuildSteps([], [], [], [], [], 'Test', [], [], [pb])
    expect(out).toContain('Power Bus')
    expect(out).toContain('PWR')
  })

  it('shows output rows and feed-in in the bus section', () => {
    const pb = createPowerBus({ x: 0, y: 0 })
    const out = generateBuildSteps([], [], [], [], [], 'Test', [], [], [pb])
    expect(out).toContain('Power Feed In')
    expect(out).toContain('[unconnected]')
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
