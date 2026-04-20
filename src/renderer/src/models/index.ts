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
  // TE Superseal 1.5
  'SS1.5-1': [[1, null]],
  'SS1.5-2': [[1, 2]],
  'SS1.5-3': [[1, 2], [3, null]],
  'SS1.5-4': [[1, 2], [3, 4]],
  'SS1.5-6': [[1, 4], [2, 5], [3, 6]],
  // Molex Micro-Fit 3.0
  'MF3-2':  [[1, 2]],
  'MF3-4':  [[1, 2], [3, 4]],
  'MF3-6':  [[1, 2], [3, 4], [5, 6]],
  'MF3-8':  [[1, 2], [3, 4], [5, 6], [7, 8]],
  'MF3-12': [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
  // TE Weather Pack
  'WP-1': [[1, null]],
  'WP-2': [[1, 2]],
  'WP-3': [[1, 2], [3, null]],
  'WP-4': [[1, 2], [3, 4]],
  // Relay (5-pin ISO 280 / Bosch standard: 30,85,86,87,87a → pins 1-5)
  'RELAY-5': [[1, 2], [3, 4], [5, null]],
  // Terminal blocks
  'TB-2':  [[1, 2]],
  'TB-4':  [[1, 2], [3, 4]],
  'TB-6':  [[1, 2], [3, 4], [5, 6]],
  'TB-8':  [[1, 2], [3, 4], [5, 6], [7, 8]],
  'TB-12': [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
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
  family?: string
}

export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  // ── Deutsch DTM ──────────────────────────────────────────────────────────
  { family: 'Deutsch DTM', model: 'DTM-2',  terminalCount: 2,  costUsd: 3.50,  bootModel: 'HTAT-16-2',  bootCostUsd: 0.15 },
  { family: 'Deutsch DTM', model: 'DTM-4',  terminalCount: 4,  costUsd: 5.00,  bootModel: 'HTAT-16-4',  bootCostUsd: 0.18 },
  { family: 'Deutsch DTM', model: 'DTM-6',  terminalCount: 6,  costUsd: 6.50,  bootModel: 'HTAT-16-6',  bootCostUsd: 0.20 },
  { family: 'Deutsch DTM', model: 'DTM-8',  terminalCount: 8,  costUsd: 8.00,  bootModel: 'HTAT-16-8',  bootCostUsd: 0.22 },
  { family: 'Deutsch DTM', model: 'DTM-12', terminalCount: 12, costUsd: 11.00, bootModel: 'HTAT-16-12', bootCostUsd: 0.28 },
  // ── Deutsch DT ───────────────────────────────────────────────────────────
  { family: 'Deutsch DT', model: 'DT-2',   terminalCount: 2,  costUsd: 2.50,  bootModel: 'WP-2',  bootCostUsd: 0.10 },
  { family: 'Deutsch DT', model: 'DT-4',   terminalCount: 4,  costUsd: 4.00,  bootModel: 'WP-4',  bootCostUsd: 0.12 },
  { family: 'Deutsch DT', model: 'DT-6',   terminalCount: 6,  costUsd: 5.50,  bootModel: 'WP-6',  bootCostUsd: 0.15 },
  { family: 'Deutsch DT', model: 'DT-8',   terminalCount: 8,  costUsd: 7.00,  bootModel: 'WP-8',  bootCostUsd: 0.18 },
  { family: 'Deutsch DT', model: 'DT-12',  terminalCount: 12, costUsd: 9.50,  bootModel: 'WP-12', bootCostUsd: 0.24 },
  // ── TE Superseal 1.5 ─────────────────────────────────────────────────────
  { family: 'TE Superseal 1.5', model: 'SS1.5-1', terminalCount: 1,  costUsd: 2.00, bootModel: 'SS-SEAL-1', bootCostUsd: 0.14 },
  { family: 'TE Superseal 1.5', model: 'SS1.5-2', terminalCount: 2,  costUsd: 2.60, bootModel: 'SS-SEAL-2', bootCostUsd: 0.16 },
  { family: 'TE Superseal 1.5', model: 'SS1.5-3', terminalCount: 3,  costUsd: 3.10, bootModel: 'SS-SEAL-3', bootCostUsd: 0.18 },
  { family: 'TE Superseal 1.5', model: 'SS1.5-4', terminalCount: 4,  costUsd: 3.60, bootModel: 'SS-SEAL-4', bootCostUsd: 0.20 },
  { family: 'TE Superseal 1.5', model: 'SS1.5-6', terminalCount: 6,  costUsd: 4.60, bootModel: 'SS-SEAL-6', bootCostUsd: 0.24 },
  // ── Molex Micro-Fit 3.0 ──────────────────────────────────────────────────
  { family: 'Molex Micro-Fit 3.0', model: 'MF3-2',  terminalCount: 2,  costUsd: 1.50, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Molex Micro-Fit 3.0', model: 'MF3-4',  terminalCount: 4,  costUsd: 2.00, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Molex Micro-Fit 3.0', model: 'MF3-6',  terminalCount: 6,  costUsd: 2.60, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Molex Micro-Fit 3.0', model: 'MF3-8',  terminalCount: 8,  costUsd: 3.10, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Molex Micro-Fit 3.0', model: 'MF3-12', terminalCount: 12, costUsd: 4.10, bootModel: '', bootCostUsd: 0.00 },
  // ── TE Weather Pack ───────────────────────────────────────────────────────
  { family: 'TE Weather Pack', model: 'WP-1', terminalCount: 1, costUsd: 1.50, bootModel: 'WP-SEAL-1', bootCostUsd: 0.12 },
  { family: 'TE Weather Pack', model: 'WP-2', terminalCount: 2, costUsd: 2.00, bootModel: 'WP-SEAL-2', bootCostUsd: 0.15 },
  { family: 'TE Weather Pack', model: 'WP-3', terminalCount: 3, costUsd: 2.50, bootModel: 'WP-SEAL-3', bootCostUsd: 0.18 },
  { family: 'TE Weather Pack', model: 'WP-4', terminalCount: 4, costUsd: 3.00, bootModel: 'WP-SEAL-4', bootCostUsd: 0.20 },
  // ── Relay ─────────────────────────────────────────────────────────────────
  // Pins: 1=30(common), 2=85(coil−), 3=86(coil+), 4=87(NO), 5=87a(NC)
  { family: 'Relay', model: 'RELAY-5', terminalCount: 5, costUsd: 0.85, bootModel: '', bootCostUsd: 0.00 },
  // ── Terminal Blocks ───────────────────────────────────────────────────────
  { family: 'Terminal Block', model: 'TB-2',  terminalCount: 2,  costUsd: 1.20, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Terminal Block', model: 'TB-4',  terminalCount: 4,  costUsd: 2.00, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Terminal Block', model: 'TB-6',  terminalCount: 6,  costUsd: 2.80, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Terminal Block', model: 'TB-8',  terminalCount: 8,  costUsd: 3.50, bootModel: '', bootCostUsd: 0.00 },
  { family: 'Terminal Block', model: 'TB-12', terminalCount: 12, costUsd: 5.00, bootModel: '', bootCostUsd: 0.00 },
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

/** Fuse/relay distribution block. Each circuit slot has one output handle; there is one shared power-input handle. */
export interface FuseBlock extends Record<string, unknown> {
  id: string
  label: string
  circuits: number
  ampRatings: number[]
  position: { x: number; y: number }
}

/** Battery / power source node with two fixed terminals: positive and negative. */
export interface PowerRail extends Record<string, unknown> {
  id: string
  label: string
  position: { x: number; y: number }
}

/**
 * Power distribution bus — one power-feed input, N auto-growing output taps.
 * Unlike FuseBlock there are no per-output amp ratings; unlike Battery there
 * is more than one output tap.
 */
export interface PowerBus extends Record<string, unknown> {
  id: string
  label: string
  /** Total output tap slots. Grows automatically as outputs are connected. */
  outputCount: number
  position: { x: number; y: number }
}

/**
 * Cable branch / split point — a mechanical routing junction where one cable
 * bundle divides into multiple outgoing cables (or vice-versa for a merge).
 * This is NOT an electrical splice; wires pass through without being joined.
 * Handle count auto-grows so there is always at least one spare connection.
 */
export interface CableBranch extends Record<string, unknown> {
  id: string
  label: string
  /** Grows automatically as wires connect — always keep at least 1 spare */
  handleCount: number
  position: { x: number; y: number }
}

export function createFuseBlock(position: { x: number; y: number }): FuseBlock {
  return { id: nanoid(8), label: 'FUSE', circuits: 4, ampRatings: [10, 10, 10, 10], position }
}

export function createPowerRail(position: { x: number; y: number }): PowerRail {
  return { id: nanoid(8), label: 'Battery', position }
}

export function createPowerBus(position: { x: number; y: number }): PowerBus {
  return { id: nanoid(8), label: 'PWR', outputCount: 2, position }
}

export function createCableBranch(position: { x: number; y: number }): CableBranch {
  return { id: nanoid(8), label: 'SPLIT', handleCount: 3, position }
}

export function cableBranchHandleId(branchId: string, idx: number): string {
  return `${branchId}_br_${idx}`
}

export function fuseBlockInHandle(fuseId: string): string { return `${fuseId}_in` }
export function fuseBlockOutHandle(fuseId: string, idx: number): string { return `${fuseId}_out_${idx}` }
export function powerRailPosHandle(railId: string): string { return `${railId}_pos` }
export function powerRailNegHandle(railId: string): string { return `${railId}_neg` }
export function powerBusInHandle(busId: string): string { return `${busId}_bus_in` }
export function powerBusOutHandle(busId: string, idx: number): string { return `${busId}_bus_${idx}` }

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
  category: 'connector' | 'boot' | 'wire' | 'splice' | 'fuse' | 'heatshrink'
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

function heatShrinkSizeFor(awg: string): { size: string; partNumber: string; costPer: number } {
  const n = parseInt(awg)
  if (n >= 22) return { size: '3/16"', partNumber: 'HSHRK-3/16', costPer: 0.05 }
  if (n >= 18) return { size: '1/4"',  partNumber: 'HSHRK-1/4',  costPer: 0.07 }
  if (n >= 14) return { size: '3/8"',  partNumber: 'HSHRK-3/8',  costPer: 0.10 }
  return           { size: '1/2"',  partNumber: 'HSHRK-1/2',  costPer: 0.12 }
}

export function generateBom(
  connectors: ConnectorNode[], wires: Wire[],
  cables: Cable[], splices: SpliceNode[], grounds: GroundNode[],
  fuseBlocks: FuseBlock[] = [], powerRails: PowerRail[] = [], powerBuses: PowerBus[] = [],
  cableBranches: CableBranch[] = []
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

  // Fuse blocks
  if (fuseBlocks.length > 0) {
    const fbGroups = new Map<number, number>()
    let totalFuses = 0
    for (const fb of fuseBlocks) {
      fbGroups.set(fb.circuits, (fbGroups.get(fb.circuits) ?? 0) + 1)
      totalFuses += fb.circuits
    }
    for (const [circuits, qty] of fbGroups.entries()) {
      const unitCost = circuits <= 4 ? 8.00 : circuits <= 8 ? 12.00 : 18.00
      lines.push({ description: `Fuse Block – ${circuits}-Circuit`, partNumber: `FBLOCK-${circuits}C`,
        qty, unitCostUsd: unitCost, totalCostUsd: qty * unitCost, category: 'fuse' })
    }
    lines.push({ description: 'Mini Blade Fuse (assorted)', partNumber: 'FUSE-MINI',
      qty: totalFuses, unitCostUsd: 0.35, totalCostUsd: totalFuses * 0.35, category: 'fuse' })
  }

  // Power rails / batteries (stud / ring terminal per rail)
  if (powerRails.length > 0) {
    lines.push({ description: 'Power Distribution Stud', partNumber: 'TERM-POWER',
      qty: powerRails.length, unitCostUsd: 0.50, totalCostUsd: powerRails.length * 0.50,
      category: 'fuse' })
  }

  // Power buses (distribution bus bar per node)
  if (powerBuses.length > 0) {
    lines.push({ description: 'Power Distribution Bus', partNumber: 'BUS-DIST',
      qty: powerBuses.length, unitCostUsd: 5.00, totalCostUsd: powerBuses.length * 5.00,
      category: 'fuse' })
  }

  // Cable branch wraps — one split-loom / tape wrap per branch point
  if (cableBranches.length > 0) {
    lines.push({ description: 'Cable Branch Wrap', partNumber: 'BRANCH-WRAP',
      qty: cableBranches.length, unitCostUsd: 0.50,
      totalCostUsd: cableBranches.length * 0.50, category: 'heatshrink' })
  }

  // Heat shrink — 2 pieces per connected wire end, grouped by size
  const hshrinkGroups = new Map<string, { size: string; qty: number; costPer: number }>()
  for (const w of wires) {
    if (!w.startTerminalId || !w.endTerminalId) continue
    const { size, partNumber, costPer } = heatShrinkSizeFor(w.awg)
    if (!hshrinkGroups.has(partNumber)) hshrinkGroups.set(partNumber, { size, qty: 0, costPer })
    hshrinkGroups.get(partNumber)!.qty += 2
  }
  for (const [partNumber, { size, qty, costPer }] of hshrinkGroups.entries()) {
    lines.push({ description: `Heat Shrink ${size}`, partNumber,
      qty, unitCostUsd: costPer, totalCostUsd: qty * costPer, category: 'heatshrink' })
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

// ── Build Steps ────────────────────────────────────────────────────────────

function fmtLen(inches: number): string {
  const ft = Math.floor(inches / 12)
  const inn = inches % 12
  if (ft === 0) return `${inn}"`
  if (inn === 0) return `${ft}'`
  return `${ft}' ${inn}"`
}

function box(text: string): string {
  const border = '='.repeat(text.length + 2)
  return `${border}\n ${text}\n${border}`
}

export function generateBuildSteps(
  connectors: ConnectorNode[], wires: Wire[],
  cables: Cable[], splices: SpliceNode[], grounds: GroundNode[],
  projectName: string,
  fuseBlocks: FuseBlock[] = [], powerRails: PowerRail[] = [], powerBuses: PowerBus[] = [],
  cableBranches: CableBranch[] = []
): string {
  const lines: string[] = []

  // Index terminals and nodes for destination lookups
  const terminalMap = new Map<string, { connectorName: string; terminalName: string }>()
  for (const c of connectors) {
    for (const t of c.terminals) {
      terminalMap.set(t.id, { connectorName: c.name, terminalName: t.name })
    }
  }
  // Splice handles: spliceId_idx
  const spliceHandleMap = new Map<string, string>()
  for (const s of splices) {
    for (let i = 0; i < s.handleCount; i++) {
      spliceHandleMap.set(`${s.id}_${i}`, s.label || 'Splice')
    }
  }
  // Ground handles: groundId_gnd_idx
  const groundHandleMap = new Map<string, string>()
  for (const g of grounds) {
    for (let i = 0; i < g.handleCount; i++) {
      groundHandleMap.set(`${g.id}_gnd_${i}`, g.label || 'GND')
    }
  }
  // Fuse block handles: fuseId_in and fuseId_out_i
  const fuseHandleMap = new Map<string, string>()
  for (const fb of fuseBlocks) {
    fuseHandleMap.set(fuseBlockInHandle(fb.id), `${fb.label} PWR-IN`)
    for (let i = 0; i < fb.circuits; i++) {
      fuseHandleMap.set(fuseBlockOutHandle(fb.id, i), `${fb.label} Circuit ${i + 1}`)
    }
  }
  // Battery handles: _pos and _neg
  const powerRailHandleMap = new Map<string, string>()
  for (const pr of powerRails) {
    powerRailHandleMap.set(powerRailPosHandle(pr.id), `${pr.label} (+)`)
    powerRailHandleMap.set(powerRailNegHandle(pr.id), `${pr.label} (−)`)
  }
  // Power bus handles: _bus_in and _bus_0, _bus_1, ...
  const powerBusHandleMap = new Map<string, string>()
  for (const pb of powerBuses) {
    powerBusHandleMap.set(powerBusInHandle(pb.id), `${pb.label} PWR-IN`)
    for (let i = 0; i < pb.outputCount; i++) {
      powerBusHandleMap.set(powerBusOutHandle(pb.id, i), `${pb.label} Out ${i + 1}`)
    }
  }
  // Cable branch handles: branchId_br_0, branchId_br_1, ...
  const branchHandleMap = new Map<string, string>()
  for (const br of cableBranches) {
    for (let i = 0; i < br.handleCount; i++) {
      branchHandleMap.set(cableBranchHandleId(br.id, i), br.label || 'SPLIT')
    }
  }

  function resolveEndpoint(handleId: string | null, excludeWireId?: string): string {
    if (!handleId) return 'unconnected'
    const t = terminalMap.get(handleId)
    if (t) return `${t.connectorName} – ${t.terminalName}`
    const s = spliceHandleMap.get(handleId)
    if (s) return s
    const g = groundHandleMap.get(handleId)
    if (g) return g
    const f = fuseHandleMap.get(handleId)
    if (f) return f
    const p = powerRailHandleMap.get(handleId)
    if (p) return p
    const b = powerBusHandleMap.get(handleId)
    if (b) return b
    const br = branchHandleMap.get(handleId)
    if (br) {
      // Follow through-connections: find partner wire(s) sharing this branch handle
      const partners = wires.filter(
        (w) => w.id !== excludeWireId &&
          (w.startTerminalId === handleId || w.endTerminalId === handleId)
      )
      const destinations = partners
        .map((w) => {
          const otherEnd = w.startTerminalId === handleId ? w.endTerminalId : w.startTerminalId
          return resolveEndpoint(otherEnd, w.id)
        })
        .filter((d) => d !== 'unconnected')
      if (destinations.length > 0) return `${destinations.join(' / ')} via ${br}`
      return `${br} (branch)`
    }
    return 'unconnected'
  }

  lines.push(`Project: ${projectName}`)
  lines.push(`Generated: ${new Date().toLocaleDateString()}`)
  lines.push('')

  // One section per connector
  for (const c of connectors) {
    lines.push(box(`${c.name} – ${c.model}`))
    lines.push('')

    const connectorWireIds = new Set(c.terminals.map((t) => t.wireId).filter(Boolean) as string[])
    const connectorWires = wires.filter((w) => connectorWireIds.has(w.id))

    for (const t of c.terminals) {
      if (!t.wireId) {
        lines.push(`  ${t.name} – [empty]`)
        continue
      }
      const w = wires.find((w) => w.id === t.wireId)
      if (!w) { lines.push(`  ${t.name} – [empty]`); continue }

      const cable = w.cableId ? cables.find((cab) => cab.id === w.cableId) : null
      const len = cable ? cable.lengthInches : w.lengthInches

      // Destination: the other end of this wire (pass wire id to avoid self-loops at branch handles)
      const otherEndId = w.startTerminalId === t.id ? w.endTerminalId : w.startTerminalId
      const dest = resolveEndpoint(otherEndId, w.id)

      const cableNote = cable ? ` [${cable.name}]` : ''
      lines.push(`  ${t.name} – ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${dest}${cableNote}`)
    }

    // Cable groupings for wires on this connector
    const cableIds = new Set(connectorWires.map((w) => w.cableId).filter(Boolean) as string[])
    if (cableIds.size > 0) {
      lines.push('')
      lines.push('  Cable groups:')
      for (const cid of cableIds) {
        const cable = cables.find((cab) => cab.id === cid)
        if (!cable) continue
        const names = connectorWires.filter((w) => w.cableId === cid).map((w) => w.name)
        lines.push(`    ${cable.name} (${fmtLen(cable.lengthInches)}): ${names.join(', ')}`)
      }
    }

    lines.push('')
  }

  // Splices
  for (const s of splices) {
    lines.push(box(`Splice – ${s.label || 'SP'}`))
    lines.push('')
    const spliceWires = wires.filter(
      (w) =>
        (w.startTerminalId && spliceHandleMap.has(w.startTerminalId)) ||
        (w.endTerminalId && spliceHandleMap.has(w.endTerminalId))
    )
    for (const w of spliceWires) {
      const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
      const len = cable ? cable.lengthInches : w.lengthInches
      const otherEndId = spliceHandleMap.has(w.startTerminalId ?? '')
        ? w.endTerminalId
        : w.startTerminalId
      lines.push(`  ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEndId)}`)
    }
    lines.push('')
  }

  // Fuse blocks
  for (const fb of fuseBlocks) {
    lines.push(box(`Fuse Block – ${fb.label} (${fb.circuits}-Circuit)`))
    lines.push('')
    lines.push(`  Power In (${fuseBlockInHandle(fb.id)})`)
    const inWires = wires.filter(
      (w) => w.startTerminalId === fuseBlockInHandle(fb.id) || w.endTerminalId === fuseBlockInHandle(fb.id)
    )
    for (const w of inWires) {
      const otherEnd = w.startTerminalId === fuseBlockInHandle(fb.id) ? w.endTerminalId : w.startTerminalId
      const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
      const len = cable ? cable.lengthInches : w.lengthInches
      lines.push(`    ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEnd)}`)
    }
    lines.push('')
    for (let i = 0; i < fb.circuits; i++) {
      const hid = fuseBlockOutHandle(fb.id, i)
      const circuitWires = wires.filter((w) => w.startTerminalId === hid || w.endTerminalId === hid)
      const ampLabel = `Circuit ${i + 1} (${fb.ampRatings[i] ?? 10}A)`
      if (circuitWires.length === 0) {
        lines.push(`  ${ampLabel} – [empty]`)
      } else {
        for (const w of circuitWires) {
          const otherEnd = w.startTerminalId === hid ? w.endTerminalId : w.startTerminalId
          const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
          const len = cable ? cable.lengthInches : w.lengthInches
          lines.push(`  ${ampLabel} – ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEnd)}`)
        }
      }
    }
    lines.push('')
  }

  // Power buses
  for (const pb of powerBuses) {
    lines.push(box(`Power Bus – ${pb.label}`))
    lines.push('')
    const inHid = powerBusInHandle(pb.id)
    lines.push(`  Power Feed In`)
    const inWires = wires.filter((w) => w.startTerminalId === inHid || w.endTerminalId === inHid)
    for (const w of inWires) {
      const otherEnd = w.startTerminalId === inHid ? w.endTerminalId : w.startTerminalId
      const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
      const len = cable ? cable.lengthInches : w.lengthInches
      lines.push(`    ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEnd)}`)
    }
    if (inWires.length === 0) lines.push(`    [unconnected]`)
    lines.push('')
    for (let i = 0; i < pb.outputCount; i++) {
      const hid = powerBusOutHandle(pb.id, i)
      const outWires = wires.filter((w) => w.startTerminalId === hid || w.endTerminalId === hid)
      if (outWires.length === 0) {
        lines.push(`  Out ${i + 1} – [empty]`)
      } else {
        for (const w of outWires) {
          const otherEnd = w.startTerminalId === hid ? w.endTerminalId : w.startTerminalId
          const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
          const len = cable ? cable.lengthInches : w.lengthInches
          lines.push(`  Out ${i + 1} – ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEnd)}`)
        }
      }
    }
    lines.push('')
  }

  // Batteries / power rails
  for (const pr of powerRails) {
    lines.push(box(`Battery – ${pr.label}`))
    lines.push('')
    for (const [hid, termLabel] of [[powerRailPosHandle(pr.id), '(+)'], [powerRailNegHandle(pr.id), '(−)']] as const) {
      const termWires = wires.filter((w) => w.startTerminalId === hid || w.endTerminalId === hid)
      if (termWires.length === 0) {
        lines.push(`  ${termLabel} – [unconnected]`)
      } else {
        for (const w of termWires) {
          const otherEnd = w.startTerminalId === hid ? w.endTerminalId : w.startTerminalId
          const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
          const len = cable ? cable.lengthInches : w.lengthInches
          lines.push(`  ${termLabel} – ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEnd)}`)
        }
      }
    }
    lines.push('')
  }

  // Grounds
  for (const g of grounds) {
    lines.push(box(`Ground – ${g.label || 'GND'}`))
    lines.push('')
    const groundWires = wires.filter(
      (w) =>
        (w.startTerminalId && groundHandleMap.has(w.startTerminalId)) ||
        (w.endTerminalId && groundHandleMap.has(w.endTerminalId))
    )
    for (const w of groundWires) {
      const cable = w.cableId ? cables.find((c) => c.id === w.cableId) : null
      const len = cable ? cable.lengthInches : w.lengthInches
      const otherEndId = groundHandleMap.has(w.startTerminalId ?? '')
        ? w.endTerminalId
        : w.startTerminalId
      lines.push(`  ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEndId)}`)
    }
    lines.push('')
  }

  // Cable branch points
  for (const br of cableBranches) {
    lines.push(box(`Cable Branch – ${br.label || 'SPLIT'}`))
    lines.push('')
    const brWires = wires.filter(
      (w) =>
        (w.startTerminalId && branchHandleMap.has(w.startTerminalId)) ||
        (w.endTerminalId && branchHandleMap.has(w.endTerminalId))
    )
    // Group wires by cable to show bundle membership
    const byArm = new Map<string, typeof brWires>()
    for (const w of brWires) {
      const key = w.cableId ?? '__loose__'
      if (!byArm.has(key)) byArm.set(key, [])
      byArm.get(key)!.push(w)
    }
    for (const [cableId, armWires] of byArm.entries()) {
      const cable = cableId !== '__loose__' ? cables.find((c) => c.id === cableId) : null
      const armLabel = cable ? `  [${cable.name}, ${fmtLen(cable.lengthInches)}]` : '  [loose wires]'
      lines.push(armLabel)
      for (const w of armWires) {
        const len = cable ? cable.lengthInches : w.lengthInches
        const otherEndId = branchHandleMap.has(w.startTerminalId ?? '')
          ? w.endTerminalId
          : w.startTerminalId
        lines.push(`    ${w.name}, ${w.color}, ${w.awg} AWG, ${fmtLen(len)} → ${resolveEndpoint(otherEndId)}`)
      }
    }
    if (brWires.length === 0) lines.push('  [no wires connected]')
    lines.push('')
  }

  return lines.join('\n')
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
}

export function validateHarness(
  connectors: ConnectorNode[], wires: Wire[], splices: SpliceNode[], grounds: GroundNode[],
  fuseBlocks: FuseBlock[] = [], powerRails: PowerRail[] = [], powerBuses: PowerBus[] = [],
  cableBranches: CableBranch[] = [], cables: Cable[] = []
): ValidationIssue[] {
  void fuseBlocks; void powerRails; void powerBuses // reserved for future circuit validation
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

  // Check cables for multi-destination wires (physically requires a Cable Branch)
  if (cables.length > 0) {
    const branchIds = new Set(cableBranches.map((b) => b.id))

    // Build handleToNode so we can resolve wire endpoints to node IDs
    const h2n = new Map<string, string>()
    for (const c of connectors) { for (const t of c.terminals) h2n.set(t.id, c.id) }
    for (const s of splices) { for (let i = 0; i < s.handleCount; i++) h2n.set(`${s.id}_${i}`, s.id) }
    for (const g of grounds) { for (let i = 0; i < g.handleCount; i++) h2n.set(`${g.id}_gnd_${i}`, g.id) }
    for (const b of cableBranches) { for (let i = 0; i < b.handleCount; i++) h2n.set(`${b.id}_br_${i}`, b.id) }
    for (const fb of fuseBlocks) {
      h2n.set(`${fb.id}_in`, fb.id)
      for (let i = 0; i < fb.circuits; i++) h2n.set(`${fb.id}_out_${i}`, fb.id)
    }
    for (const pr of powerRails) { h2n.set(`${pr.id}_pwr_0`, pr.id); h2n.set(`${pr.id}_pwr_1`, pr.id) }
    for (const pb of powerBuses) {
      h2n.set(`${pb.id}_bus_in`, pb.id)
      for (let i = 0; i < pb.outputCount; i++) h2n.set(`${pb.id}_bus_${i}`, pb.id)
    }

    for (const cable of cables) {
      const cableWires = wires.filter((w) => w.cableId === cable.id && w.startTerminalId && w.endTerminalId)
      if (cableWires.length === 0) continue

      const nonBranchNodes = new Set<string>()
      for (const w of cableWires) {
        const src = h2n.get(w.startTerminalId!)
        const tgt = h2n.get(w.endTerminalId!)
        if (src && !branchIds.has(src)) nonBranchNodes.add(src)
        if (tgt && !branchIds.has(tgt)) nonBranchNodes.add(tgt)
      }

      if (nonBranchNodes.size > 2) {
        // A CableBranch in the cable legitimises the fork — only flag if no branch is present
        const hasBranch = cableWires.some((w) => {
          const src = h2n.get(w.startTerminalId!)
          const tgt = h2n.get(w.endTerminalId!)
          return (src && branchIds.has(src)) || (tgt && branchIds.has(tgt))
        })
        if (!hasBranch) {
          issues.push({
            severity: 'error',
            message: `Cable "${cable.name}" has wires going to ${nonBranchNodes.size} different endpoints — split into separate cables or route through a Cable Branch.`,
          })
        }
      }
    }
  }

  return issues
}
