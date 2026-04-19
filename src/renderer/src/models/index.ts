import { nanoid } from 'nanoid'

// ── AWG / color constants ──────────────────────────────────────────────────

export const AWG_DIAMETERS: Record<string, number> = {
  '12': 0.0808, '14': 0.0641, '16': 0.0508, '18': 0.0403,
  '20': 0.0320, '22': 0.0253, '24': 0.0201, '26': 0.0159
}

export const WIRE_COLORS: Record<string, string> = {
  BLACK: '#2d2d2d', RED: '#e53e3e', BLUE: '#3182ce', GREEN: '#38a169',
  WHITE: '#cbd5e0', YELLOW: '#d69e2e', ORANGE: '#dd6b20', PURPLE: '#805ad5',
  BROWN: '#744210', PINK: '#d53f8c', GRAY: '#718096', VIOLET: '#6b46c1'
}
export type WireColor = keyof typeof WIRE_COLORS

// ── Pin layout library ─────────────────────────────────────────────────────

/** 2-D grid of 1-based pin numbers. null = empty cell (no pin). */
export type PinLayout = (number | null)[][]

// All connectors use a 2-column (left / right) layout for the schematic diagram.
// Left column pins get left-edge handles; right column pins get right-edge handles.
// Numbering follows the physical connector face; the diagram layout groups the
// first half of pins on the left and the second half on the right.
const LAYOUTS: Record<string, PinLayout> = {
  // Deutsch DTM series
  'DTM-2':  [[1, 2]],
  'DTM-4':  [[1, 2], [3, 4]],
  'DTM-6':  [[1, 4], [2, 5], [3, 6]],
  'DTM-8':  [[1, 5], [2, 6], [3, 7], [4, 8]],
  'DTM-12': [[1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12]],
  // Deutsch DT series
  'DT-2':  [[1, 2]],
  'DT-4':  [[1, 2], [3, 4]],
  'DT-6':  [[1, 4], [2, 5], [3, 6]],
  'DT-8':  [[1, 5], [2, 6], [3, 7], [4, 8]],
  'DT-12': [[1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12]],
}

export function getPinLayout(model: string, terminalCount: number): PinLayout {
  if (LAYOUTS[model]) return LAYOUTS[model]
  // Auto-generate grid for unknown models
  const cols = Math.ceil(Math.sqrt(terminalCount))
  const rows = Math.ceil(terminalCount / cols)
  const layout: PinLayout = []
  let pin = 1
  for (let r = 0; r < rows; r++) {
    const row: (number | null)[] = []
    for (let c = 0; c < cols; c++) {
      row.push(pin <= terminalCount ? pin++ : null)
    }
    layout.push(row)
  }
  return layout
}

export function getLayoutCols(layout: PinLayout): number {
  return layout.reduce((max, row) => Math.max(max, row.length), 0)
}

// ── Domain types ───────────────────────────────────────────────────────────

export interface Wire {
  id: string
  name: string
  color: WireColor
  lengthInches: number
  awg: string
  startTerminalId: string | null
  endTerminalId: string | null
  /** If set, lengthInches is overridden by the owning cable's length */
  cableId: string | null
}

export interface Terminal {
  id: string
  name: string
  connectorId: string
  wireId: string | null
}

export interface ConnectorNode extends Record<string, unknown> {
  id: string
  name: string
  model: string
  costUsd: number
  bootModel: string
  bootCostUsd: number
  terminals: Terminal[]
  position: { x: number; y: number }
}

/** A cable groups wires into a bundle — they share one physical length. */
export interface Cable {
  id: string
  name: string
  /** Optional hex color for the cable sheath. Tints all wire edges in this bundle. */
  color?: string
  /** When true the canvas shows one thick cable edge instead of individual wire edges. */
  collapsed?: boolean
  lengthInches: number
  wireIds: string[]
}

/** A splice/junction node on the canvas where wires can branch or merge. */
export interface SpliceNode extends Record<string, unknown> {
  id: string
  label: string
  /** Number of available connection handles */
  handleCount: number
  position: { x: number; y: number }
}

/**
 * Ground node — a chassis/common ground point.
 * Maps to the original Python UnionConnector: one connection point,
 * unlimited wires. Each wire gets its own handle slot.
 */
export interface GroundNode extends Record<string, unknown> {
  id: string
  label: string
  /** Grows automatically as wires connect — always keep at least 1 spare */
  handleCount: number
  position: { x: number; y: number }
}

// ── Connector presets ──────────────────────────────────────────────────────

export interface ConnectorPreset {
  model: string
  terminalCount: number
  costUsd: number
  bootModel: string
  bootCostUsd: number
}

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  { model: 'DTM-2',  terminalCount: 2,  costUsd: 3.50,  bootModel: 'HTAT-16-2',  bootCostUsd: 0.15 },
  { model: 'DTM-4',  terminalCount: 4,  costUsd: 5.00,  bootModel: 'HTAT-16-4',  bootCostUsd: 0.18 },
  { model: 'DTM-6',  terminalCount: 6,  costUsd: 6.50,  bootModel: 'HTAT-16-6',  bootCostUsd: 0.20 },
  { model: 'DTM-8',  terminalCount: 8,  costUsd: 8.00,  bootModel: 'HTAT-16-8',  bootCostUsd: 0.22 },
  { model: 'DTM-12', terminalCount: 12, costUsd: 11.00, bootModel: 'HTAT-16-12', bootCostUsd: 0.28 },
  { model: 'DT-2',   terminalCount: 2,  costUsd: 2.50,  bootModel: 'WP-2',       bootCostUsd: 0.10 },
  { model: 'DT-4',   terminalCount: 4,  costUsd: 4.00,  bootModel: 'WP-4',       bootCostUsd: 0.12 },
  { model: 'DT-6',   terminalCount: 6,  costUsd: 5.50,  bootModel: 'WP-6',       bootCostUsd: 0.15 },
]

// ── Factories ──────────────────────────────────────────────────────────────

export function createTerminal(connectorId: string, index: number): Terminal {
  return { id: nanoid(8), name: `Pin ${index + 1}`, connectorId, wireId: null }
}

export function createConnector(
  name: string, model: string, terminalCount: number,
  costUsd: number, bootModel: string, bootCostUsd: number,
  position: { x: number; y: number }
): ConnectorNode {
  const id = nanoid(8)
  const terminals = Array.from({ length: terminalCount }, (_, i) => createTerminal(id, i))
  return { id, name, model, costUsd, bootModel, bootCostUsd, terminals, position }
}

export function createWire(name: string): Wire {
  return { id: nanoid(8), name, color: 'WHITE', lengthInches: 12, awg: '22',
    startTerminalId: null, endTerminalId: null, cableId: null }
}

export function createCable(name: string): Cable {
  return { id: nanoid(8), name, collapsed: true, lengthInches: 24, wireIds: [] }
}

export function createSplice(position: { x: number; y: number }): SpliceNode {
  return { id: nanoid(8), label: 'SP', handleCount: 4, position }
}

export function createGround(position: { x: number; y: number }): GroundNode {
  return { id: nanoid(8), label: 'GND', handleCount: 2, position }
}

export function groundHandleId(groundId: string, idx: number): string {
  return `${groundId}_gnd_${idx}`
}

/** Splice handle IDs follow the pattern `<spliceId>_<idx>` */
export function spliceHandleId(spliceId: string, idx: number): string {
  return `${spliceId}_${idx}`
}

export function isSpliceHandle(handleId: string, splices: SpliceNode[]): boolean {
  return splices.some((s) =>
    Array.from({ length: s.handleCount }, (_, i) => spliceHandleId(s.id, i)).includes(handleId)
  )
}

// ── BOM ────────────────────────────────────────────────────────────────────

export interface BomLine {
  description: string
  partNumber: string
  qty: number
  unitCostUsd: number
  totalCostUsd: number
  category: 'connector' | 'boot' | 'wire' | 'splice'
}

export interface Bom {
  lines: BomLine[]
  totalMaterialCostUsd: number
  estimatedLaborMin: number
  estimatedSalePriceUsd: number
}

const WIRE_COST_PER_FOOT: Record<string, number> = {
  '12': 0.35, '14': 0.28, '16': 0.18, '18': 0.14,
  '20': 0.11, '22': 0.09, '24': 0.07, '26': 0.06
}
const LABOR_RATE = 70
const MATERIAL_MARGIN = 0.30
const MIN_PER_TERMINAL = 10
const SPLICE_COST = 0.25

export function generateBom(
  connectors: ConnectorNode[], wires: Wire[],
  cables: Cable[], splices: SpliceNode[], grounds: GroundNode[]
): Bom {
  const lines: BomLine[] = []

  // Connectors
  const connGroups = new Map<string, { c: ConnectorNode; count: number }>()
  for (const c of connectors) {
    const key = `${c.model}|${c.costUsd}`
    if (connGroups.has(key)) connGroups.get(key)!.count++
    else connGroups.set(key, { c, count: 1 })
  }
  for (const { c, count } of connGroups.values()) {
    lines.push({ description: `Connector – ${c.model}`, partNumber: c.model,
      qty: count, unitCostUsd: c.costUsd, totalCostUsd: count * c.costUsd, category: 'connector' })
    if (c.bootCostUsd > 0)
      lines.push({ description: `Boot – ${c.bootModel}`, partNumber: c.bootModel,
        qty: count, unitCostUsd: c.bootCostUsd, totalCostUsd: count * c.bootCostUsd, category: 'boot' })
  }

  // Splices
  if (splices.length > 0) {
    lines.push({ description: 'Wire Splice', partNumber: 'SPLICE-BUTT',
      qty: splices.length, unitCostUsd: SPLICE_COST,
      totalCostUsd: splices.length * SPLICE_COST, category: 'splice' })
  }

  // Grounds (ring terminal per ground point)
  if (grounds.length > 0) {
    lines.push({ description: 'Ring Terminal / Chassis Ground', partNumber: 'TERM-RING-GND',
      qty: grounds.length, unitCostUsd: 0.35,
      totalCostUsd: grounds.length * 0.35, category: 'splice' })
  }

  // Wires — one BOM line per AWG gauge, summing total feet across the whole harness
  const wireGroups = new Map<string, { awg: string; totalInches: number }>()
  for (const w of wires) {
    const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
    const len = cable ? cable.lengthInches : w.lengthInches
    if (!wireGroups.has(w.awg)) wireGroups.set(w.awg, { awg: w.awg, totalInches: 0 })
    wireGroups.get(w.awg)!.totalInches += len
  }
  for (const { awg, totalInches } of wireGroups.values()) {
    const feet = totalInches / 12
    const unitCost = WIRE_COST_PER_FOOT[awg] ?? 0.09
    lines.push({ description: `Wire – ${awg} AWG`, partNumber: `WIRE-${awg}AWG`,
      qty: Math.ceil(feet * 10) / 10, unitCostUsd: unitCost,
      totalCostUsd: feet * unitCost, category: 'wire' })
  }

  const totalMaterialCostUsd = lines.reduce((s, l) => s + l.totalCostUsd, 0)
  const terminalCount = connectors.reduce((s, c) => s + c.terminals.length, 0)
  const estimatedLaborMin = terminalCount * MIN_PER_TERMINAL
  const estimatedSalePriceUsd =
    totalMaterialCostUsd * (1 + MATERIAL_MARGIN) + (estimatedLaborMin / 60) * LABOR_RATE

  return {
    lines,
    totalMaterialCostUsd: r2(totalMaterialCostUsd),
    estimatedLaborMin,
    estimatedSalePriceUsd: r2(estimatedSalePriceUsd)
  }
}

function r2(n: number) { return Math.round(n * 100) / 100 }

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
}

export function validateHarness(
  connectors: ConnectorNode[], wires: Wire[], splices: SpliceNode[], grounds: GroundNode[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const w of wires) {
    if (!w.startTerminalId)
      issues.push({ severity: 'error', message: `Wire "${w.name}" has no start connection.` })
    if (!w.endTerminalId)
      issues.push({ severity: 'error', message: `Wire "${w.name}" has no end connection.` })
    if (w.lengthInches <= 0 && !w.cableId)
      issues.push({ severity: 'warning', message: `Wire "${w.name}" has zero length.` })
  }

  for (const c of connectors) {
    const unconnected = c.terminals.filter((t) => t.wireId === null).length
    if (unconnected > 0)
      issues.push({ severity: 'warning',
        message: `Connector "${c.name}" has ${unconnected} unconnected pin(s).` })
  }

  return issues
}
