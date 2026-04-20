import { useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useHarnessStore } from '../../store'
import { WIRE_COLORS, AWG_DIAMETERS, WireColor, CONNECTOR_PRESETS, ConnectorNode, FuseBlock, powerRailPosHandle, powerRailNegHandle, powerBusInHandle, powerBusOutHandle, cableBranchHandleId } from '../../models'

function ConnectorReconfig({ connector }: { connector: ConnectorNode }) {
  const changeConnectorModel = useHarnessStore((s) => s.changeConnectorModel)

  const [model, setModel] = useState(connector.model)
  const [terminalCount, setTerminalCount] = useState(connector.terminals.length)
  const [costUsd, setCostUsd] = useState(connector.costUsd)
  const [bootModel, setBootModel] = useState(connector.bootModel)
  const [bootCostUsd, setBootCostUsd] = useState(connector.bootCostUsd)
  const [error, setError] = useState<string | null>(null)

  const isCustom = !CONNECTOR_PRESETS.find((p) => p.model === model)

  function applyPreset(value: string) {
    const preset = CONNECTOR_PRESETS.find((p) => p.model === value)
    if (preset) {
      setModel(preset.model)
      setTerminalCount(preset.terminalCount)
      setCostUsd(preset.costUsd)
      setBootModel(preset.bootModel)
      setBootCostUsd(preset.bootCostUsd)
    } else {
      setModel('')
    }
    setError(null)
  }

  function handleApply() {
    const err = changeConnectorModel(connector.id, model, terminalCount, costUsd, bootModel, bootCostUsd)
    setError(err)
  }

  return (
    <div className="properties-panel__reconfig">
      <h4 className="properties-panel__subtitle">Change Model</h4>

      <label className="properties-panel__label">Preset</label>
      <select className="properties-panel__select"
        value={isCustom ? '__custom__' : model}
        onChange={(e) => applyPreset(e.target.value)}>
        {Array.from(
          CONNECTOR_PRESETS.reduce((map, p) => {
            const fam = p.family ?? 'Other'
            if (!map.has(fam)) map.set(fam, [])
            map.get(fam)!.push(p)
            return map
          }, new Map<string, typeof CONNECTOR_PRESETS>()),
          ([family, presets]) => (
            <optgroup key={family} label={family}>
              {presets.map((p) => (
                <option key={p.model} value={p.model}>{p.model} ({p.terminalCount}-pin)</option>
              ))}
            </optgroup>
          )
        )}
        <option value="__custom__">Custom…</option>
      </select>

      {isCustom && (
        <>
          <label className="properties-panel__label">Part #</label>
          <input className="properties-panel__input" value={model}
            placeholder="Connector part number"
            onChange={(e) => { setModel(e.target.value); setError(null) }} />
          <label className="properties-panel__label">Pin Count</label>
          <input className="properties-panel__input" type="number" min={1} max={64}
            value={terminalCount}
            onChange={(e) => { setTerminalCount(parseInt(e.target.value) || 1); setError(null) }} />
          <div className="properties-panel__row">
            <div>
              <label className="properties-panel__label">Conn. ($)</label>
              <input className="properties-panel__input" type="number" step="0.01" value={costUsd}
                onChange={(e) => setCostUsd(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="properties-panel__label">Boot ($)</label>
              <input className="properties-panel__input" type="number" step="0.01" value={bootCostUsd}
                onChange={(e) => setBootCostUsd(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <label className="properties-panel__label">Boot Part #</label>
          <input className="properties-panel__input" value={bootModel}
            onChange={(e) => setBootModel(e.target.value)} />
        </>
      )}

      {error && <p className="properties-panel__error">{error}</p>}

      <button className="properties-panel__btn properties-panel__btn--secondary"
        onClick={handleApply}>
        Apply Change
      </button>
    </div>
  )
}

// ── CableBranch sub-panel ──────────────────────────────────────────────────────

import type { CableBranch, Cable as CableType } from '../../models'

type ArmWireEntry = {
  id: string; name: string; color: string
  cableName: string | null
  /** true = branch handle is this wire's startTerminalId (wire exits branch toward dest) */
  isStart: boolean
}
type ArmEntry = { handleIdx: number; wires: ArmWireEntry[] }

function CableBranchPanel({
  branch, cables, armEntries, updateCableBranch, injectCableThroughBranch, removeCableBranch
}: {
  branch: CableBranch
  cables: CableType[]
  armEntries: ArmEntry[]
  updateCableBranch: (id: string, patch: Partial<Omit<CableBranch, 'id'>>) => void
  injectCableThroughBranch: (branchId: string, cableId: string) => void
  removeCableBranch: (id: string) => void
}) {
  const [injectCableId, setInjectCableId] = useState('')

  const handleInject = useCallback(() => {
    if (!injectCableId) return
    injectCableThroughBranch(branch.id, injectCableId)
    setInjectCableId('')
  }, [branch.id, injectCableId, injectCableThroughBranch])

  return (
    <aside className="properties-panel">
      <h3 className="properties-panel__title">⑂ Cable Branch</h3>
      <p className="properties-panel__hint">
        Mechanical routing split/merge point. Each arm connects two wire segments —
        one from the main cable, one from a sub-cable — that share the same branch
        handle to form a continuous circuit path.
      </p>

      <label className="properties-panel__label">Label</label>
      <input className="properties-panel__input" value={branch.label}
        onChange={(e) => updateCableBranch(branch.id, { label: e.target.value })} />

      {/* ── Inject workflow ─────────────────────────── */}
      <h4 className="properties-panel__subtitle" style={{ marginTop: 12 }}>
        Inject Cable Through Branch
      </h4>
      <p className="properties-panel__hint">
        Pick a cable and click <strong>Inject</strong>. Each wire is cut here:
        the entry segment stays in the original cable; an exit stub is automatically
        created and added to a new outgoing cable named after its destination.
      </p>
      <label className="properties-panel__label">Cable to split</label>
      <select className="properties-panel__select"
        value={injectCableId}
        onChange={(e) => setInjectCableId(e.target.value)}>
        <option value="">— pick a cable —</option>
        {cables.map((ca) => (
          <option key={ca.id} value={ca.id}>{ca.name} ({ca.wireIds.length} wires)</option>
        ))}
      </select>
      <button
        className="properties-panel__btn properties-panel__btn--secondary"
        onClick={handleInject}
        disabled={!injectCableId}
        title="Split the selected cable at this branch. Entry segments stay in the original cable; exit stubs get their own outgoing cable per destination.">
        ⑂ Inject
      </button>

      {/* ── Per-arm through-connection display ──────── */}
      {armEntries.length > 0 && (
        <div className="properties-panel__terminals" style={{ marginTop: 12 }}>
          <h4 className="properties-panel__subtitle">Arms</h4>
          {armEntries.map(({ handleIdx, wires }) => {
            const isThrough = wires.length === 2
            return (
              <div key={handleIdx} className="branch-arm-row">
                <div className="branch-arm-row__header">
                  <span>Arm {handleIdx}</span>
                  <span className={isThrough ? 'branch-arm-row__badge--through' : 'branch-arm-row__badge--stub'}>
                    {isThrough ? '↔ through' : '○ stub'}
                  </span>
                </div>
                {isThrough ? (
                  // Show the two wires as a connected pair
                  <div className="branch-arm-row__through">
                    {wires.map((w, i) => (
                      <span key={w.id}>
                        <span className="terminal-row__wire"
                          style={{ borderLeftColor: WIRE_COLORS[w.color as keyof typeof WIRE_COLORS] ?? '#718096' }}>
                          {w.name}{w.cableName ? ` [${w.cableName}]` : ''}
                        </span>
                        {i === 0 && <span className="branch-arm-row__arrow">↔</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  // Single stub
                  wires.map((w) => (
                    <div key={w.id} className="terminal-row">
                      <span className="terminal-row__wire"
                        style={{ borderLeftColor: WIRE_COLORS[w.color as keyof typeof WIRE_COLORS] ?? '#718096' }}>
                        {w.name}{w.cableName ? ` [${w.cableName}]` : ''}
                      </span>
                      <span className="terminal-row__empty">open end</span>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      <button className="properties-panel__btn properties-panel__btn--danger"
        onClick={() => removeCableBranch(branch.id)}>Delete Branch</button>
    </aside>
  )
}

export function PropertiesPanel() {
  const {
    connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches,
    selectedId, selectedType,
    updateWire, updateConnector, updateCable, updateSplice, updateGround, updateFuseBlock, updatePowerRail, updatePowerBus, updateCableBranch,
    removeWire, removeConnector, removeCable, removeSplice, removeGround, removeFuseBlock, removePowerRail, removePowerBus, removeCableBranch,
    injectCableThroughBranch,
    assignWireToCable, toggleCableCollapsed
  } = useHarnessStore(
    useShallow((s) => ({
      connectors: s.connectors, wires: s.wires, cables: s.cables,
      splices: s.splices, grounds: s.grounds,
      fuseBlocks: s.fuseBlocks, powerRails: s.powerRails, powerBuses: s.powerBuses,
      cableBranches: s.cableBranches,
      selectedId: s.selectedId, selectedType: s.selectedType,
      updateWire: s.updateWire, updateConnector: s.updateConnector,
      updateCable: s.updateCable, updateSplice: s.updateSplice, updateGround: s.updateGround,
      updateFuseBlock: s.updateFuseBlock, updatePowerRail: s.updatePowerRail, updatePowerBus: s.updatePowerBus,
      updateCableBranch: s.updateCableBranch,
      removeWire: s.removeWire, removeConnector: s.removeConnector,
      removeCable: s.removeCable, removeSplice: s.removeSplice, removeGround: s.removeGround,
      removeFuseBlock: s.removeFuseBlock, removePowerRail: s.removePowerRail, removePowerBus: s.removePowerBus,
      removeCableBranch: s.removeCableBranch,
      injectCableThroughBranch: s.injectCableThroughBranch,
      assignWireToCable: s.assignWireToCable, toggleCableCollapsed: s.toggleCableCollapsed
    }))
  )

  if (!selectedId) {
    return (
      <aside className="properties-panel properties-panel--empty">
        <p>Click a node or wire to inspect it.</p>
        <p className="properties-panel__hint" style={{ marginTop: 8 }}>
          <strong>Connector</strong> — multi-pin plug or socket.<br/>
          <strong>Wire</strong> — single conductor between two pins.<br/>
          <strong>Cable</strong> — bundle of wires sharing one length.<br/>
          <strong>Cable Branch</strong> — mechanical split/merge point; wires route through without electrical joining.<br/>
          <strong>Splice</strong> — electrical crimp/solder junction.<br/>
          <strong>Ground</strong> — chassis ground reference.<br/>
          <strong>Fuse Block</strong> — fused distribution block.<br/>
          <strong>Battery</strong> — power source (+/−).<br/>
          <strong>Power Rail</strong> — multi-tap distribution bus.
        </p>
      </aside>
    )
  }

  // ── Wire ──────────────────────────────────────────────────────────────────

  if (selectedType === 'wire') {
    const wire = wires.find((w) => w.id === selectedId)
    if (!wire) return null

    const allTerminals = connectors.flatMap((c) => c.terminals)
    const startTerminal = allTerminals.find((t) => t.id === wire.startTerminalId)
    const endTerminal = allTerminals.find(
      (t) => t.id === wire.endTerminalId || `${t.id}__t` === wire.endTerminalId
    )
    const startConnector = connectors.find((c) => c.terminals.some((t) => t.id === wire.startTerminalId))
    const endConnector = connectors.find((c) =>
      c.terminals.some((t) => t.id === wire.endTerminalId || `${t.id}__t` === wire.endTerminalId)
    )
    const assignedCable = wire.cableId ? cables.find((c) => c.id === wire.cableId) : null

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">Wire</h3>

        <label className="properties-panel__label">Name</label>
        <input className="properties-panel__input" value={wire.name}
          onChange={(e) => updateWire(wire.id, { name: e.target.value })} />

        <label className="properties-panel__label">Color</label>
        <div className="color-picker">
          {(Object.keys(WIRE_COLORS) as WireColor[]).map((color) => (
            <button key={color}
              className={`color-swatch${wire.color === color ? ' color-swatch--active' : ''}`}
              style={{ background: WIRE_COLORS[color] }} title={color}
              onClick={() => updateWire(wire.id, { color })} />
          ))}
        </div>

        <label className="properties-panel__label">
          Length (in) {assignedCable && <span className="properties-panel__tag">via {assignedCable.name}</span>}
        </label>
        <input className="properties-panel__input" type="number" min={0} step={0.5}
          value={wire.lengthInches} disabled={!!assignedCable}
          onChange={(e) => updateWire(wire.id, { lengthInches: parseFloat(e.target.value) || 0 })} />

        <label className="properties-panel__label">Gauge (AWG)</label>
        <select className="properties-panel__select" value={wire.awg}
          onChange={(e) => updateWire(wire.id, { awg: e.target.value })}>
          {Object.keys(AWG_DIAMETERS).map((awg) => (
            <option key={awg} value={awg}>{awg} AWG</option>
          ))}
        </select>

        <label className="properties-panel__label">Cable / Bundle</label>
        <select className="properties-panel__select"
          value={wire.cableId ?? ''}
          onChange={(e) => assignWireToCable(wire.id, e.target.value || null)}>
          <option value="">— None (loose wire) —</option>
          {cables.map((ca) => (
            <option key={ca.id} value={ca.id}>{ca.name}</option>
          ))}
        </select>

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Start</span>
            <span>{startConnector ? `${startConnector.name} / ${startTerminal?.name ?? '?'}` : 'Unconnected'}</span>
          </div>
          <div className="properties-panel__info-row">
            <span>End</span>
            <span>{endConnector ? `${endConnector.name} / ${endTerminal?.name ?? '?'}` : 'Unconnected'}</span>
          </div>
        </div>

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeWire(wire.id)}>Delete Wire</button>
      </aside>
    )
  }

  // ── Connector ──────────────────────────────────────────────────────────────

  if (selectedType === 'connector') {
    const connector = connectors.find((c) => c.id === selectedId)
    if (!connector) return null
    const connected = connector.terminals.filter((t) => t.wireId !== null).length

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">Connector</h3>

        <label className="properties-panel__label">Name</label>
        <input className="properties-panel__input" value={connector.name}
          onChange={(e) => updateConnector(connector.id, { name: e.target.value })} />

        <label className="properties-panel__label">Model / Part #</label>
        <input className="properties-panel__input" value={connector.model}
          onChange={(e) => updateConnector(connector.id, { model: e.target.value })} />

        <div className="properties-panel__row">
          <div>
            <label className="properties-panel__label">Conn. ($)</label>
            <input className="properties-panel__input" type="number" step="0.01"
              value={connector.costUsd}
              onChange={(e) => updateConnector(connector.id, { costUsd: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="properties-panel__label">Boot ($)</label>
            <input className="properties-panel__input" type="number" step="0.01"
              value={connector.bootCostUsd}
              onChange={(e) => updateConnector(connector.id, { bootCostUsd: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row"><span>Pins</span><span>{connector.terminals.length}</span></div>
          <div className="properties-panel__info-row">
            <span>Connected</span><span>{connected} / {connector.terminals.length}</span>
          </div>
        </div>

        <div className="properties-panel__terminals">
          <h4 className="properties-panel__subtitle">Pins</h4>
          {connector.terminals.map((t, i) => {
            const wire = t.wireId ? wires.find((w) => w.id === t.wireId) : null
            return (
              <div key={t.id} className="terminal-row">
                <span className="terminal-row__index">{i + 1}</span>
                <input className="terminal-row__input" value={t.name}
                  onChange={(e) => {
                    updateConnector(connector.id, {
                      terminals: connector.terminals.map((term) =>
                        term.id === t.id ? { ...term, name: e.target.value } : term
                      )
                    } as any)
                  }} />
                {wire ? (
                  <span className="terminal-row__wire"
                    style={{ borderLeftColor: WIRE_COLORS[wire.color] ?? '#718096' }}>
                    {wire.name}
                  </span>
                ) : (
                  <span className="terminal-row__empty">—</span>
                )}
              </div>
            )
          })}
        </div>

        <ConnectorReconfig connector={connector} />

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeConnector(connector.id)}>Delete Connector</button>
      </aside>
    )
  }

  // ── Splice ─────────────────────────────────────────────────────────────────

  if (selectedType === 'splice') {
    const splice = splices.find((s) => s.id === selectedId)
    if (!splice) return null

    const connectedWires = wires.filter((w) =>
      Array.from({ length: splice.handleCount }, (_, i) => `${splice.id}_${i}`)
        .some((hid) => w.startTerminalId === hid || w.endTerminalId === hid)
    )

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">Splice / Junction</h3>

        <label className="properties-panel__label">Label</label>
        <input className="properties-panel__input" value={splice.label}
          onChange={(e) => updateSplice(splice.id, { label: e.target.value })} />

        <label className="properties-panel__label">Handle Count</label>
        <input className="properties-panel__input" type="number" min={2} max={12}
          value={splice.handleCount}
          onChange={(e) => updateSplice(splice.id, { handleCount: parseInt(e.target.value) || 2 })} />

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Connected Wires</span><span>{connectedWires.length}</span>
          </div>
        </div>

        {connectedWires.length > 0 && (
          <div className="properties-panel__terminals">
            <h4 className="properties-panel__subtitle">Wires</h4>
            {connectedWires.map((w) => (
              <div key={w.id} className="terminal-row">
                <span className="terminal-row__wire"
                  style={{ borderLeftColor: WIRE_COLORS[w.color] ?? '#718096' }}>
                  {w.name}
                </span>
              </div>
            ))}
          </div>
        )}

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeSplice(splice.id)}>Delete Splice</button>
      </aside>
    )
  }

  // ── Cable ──────────────────────────────────────────────────────────────────

  if (selectedType === 'cable') {
    const cable = cables.find((c) => c.id === selectedId)
    if (!cable) return null
    const cableWires = wires.filter((w) => w.cableId === cable.id)

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">Cable / Bundle</h3>

        <label className="properties-panel__label">Name</label>
        <input className="properties-panel__input" value={cable.name}
          onChange={(e) => updateCable(cable.id, { name: e.target.value })} />

        <label className="properties-panel__label">Shared Length (in)</label>
        <input className="properties-panel__input" type="number" min={0} step={0.5}
          value={cable.lengthInches}
          onChange={(e) => updateCable(cable.id, { lengthInches: parseFloat(e.target.value) || 0 })} />

        <label className="properties-panel__label">Cable Color</label>
        <div className="color-picker">
          {(Object.keys(WIRE_COLORS) as WireColor[]).map((color) => (
            <button key={color}
              className={`color-swatch${cable.color === WIRE_COLORS[color] ? ' color-swatch--active' : ''}`}
              style={{ background: WIRE_COLORS[color] }} title={color}
              onClick={() => updateCable(cable.id, { color: cable.color === WIRE_COLORS[color] ? undefined : WIRE_COLORS[color] })} />
          ))}
        </div>
        <p className="properties-panel__hint">Cable color overrides individual wire colors on the canvas.</p>

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Wires in bundle</span><span>{cableWires.length}</span>
          </div>
          <div className="properties-panel__info-row">
            <span>Length each</span><span>{cable.lengthInches}"</span>
          </div>
        </div>

        {cableWires.length > 0 && (
          <div className="properties-panel__terminals">
            <h4 className="properties-panel__subtitle">Bundled Wires</h4>
            {cableWires.map((w) => (
              <div key={w.id} className="terminal-row">
                <span className="terminal-row__wire"
                  style={{ borderLeftColor: WIRE_COLORS[w.color] ?? '#718096' }}>
                  {w.name}
                </span>
                <span className="terminal-row__empty">{w.awg} AWG</span>
              </div>
            ))}
          </div>
        )}

        <button
          className="properties-panel__btn properties-panel__btn--secondary"
          onClick={() => toggleCableCollapsed(cable.id)}
          title={cable.collapsed
            ? 'Show individual wire edges on the canvas'
            : 'Collapse wires into a single cable edge on the canvas'}
        >
          {cable.collapsed ? '⊞ Expand on Canvas' : '⊟ Collapse on Canvas'}
        </button>

        {cable.collapsed && cableWires.length === 0 && (
          <p className="properties-panel__hint">
            No wires assigned yet — expand and assign wires first.
          </p>
        )}

        <p className="properties-panel__hint">
          Assign wires to this bundle via the wire's properties panel.
        </p>

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeCable(cable.id)}>Delete Cable</button>
      </aside>
    )
  }

  // ── Fuse Block ─────────────────────────────────────────────────────────────

  if (selectedType === 'fuseBlock') {
    const fb = fuseBlocks.find((f) => f.id === selectedId)
    if (!fb) return null

    const allHandles = [
      `${fb.id}_in`,
      ...Array.from({ length: fb.circuits }, (_, i) => `${fb.id}_out_${i}`)
    ]
    const connectedWires = wires.filter((w) =>
      allHandles.some((hid) => w.startTerminalId === hid || w.endTerminalId === hid)
    )

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">⚡ Fuse Block</h3>

        <label className="properties-panel__label">Label</label>
        <input className="properties-panel__input" value={fb.label}
          onChange={(e) => updateFuseBlock(fb.id, { label: e.target.value })} />

        <label className="properties-panel__label">Circuits</label>
        <input className="properties-panel__input" type="number" min={1} max={12}
          value={fb.circuits}
          onChange={(e) => updateFuseBlock(fb.id, { circuits: Math.max(1, Math.min(12, parseInt(e.target.value) || 1)) })} />

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Connected Wires</span><span>{connectedWires.length}</span>
          </div>
        </div>

        <div className="properties-panel__terminals">
          <h4 className="properties-panel__subtitle">Circuit Amp Ratings</h4>
          {Array.from({ length: fb.circuits }, (_, i) => (
            <div key={i} className="terminal-row">
              <span className="terminal-row__index">{i + 1}</span>
              <input
                className="terminal-row__input"
                type="number" min={1} max={100} step={5}
                value={fb.ampRatings[i] ?? 10}
                onChange={(e) => {
                  const ratings = [...fb.ampRatings]
                  ratings[i] = parseInt(e.target.value) || 10
                  updateFuseBlock(fb.id, { ampRatings: ratings } as Partial<Omit<FuseBlock, 'id'>>)
                }}
              />
              <span className="terminal-row__empty">A</span>
            </div>
          ))}
        </div>

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeFuseBlock(fb.id)}>Delete Fuse Block</button>
      </aside>
    )
  }

  // ── Power Rail ─────────────────────────────────────────────────────────────

  if (selectedType === 'powerRail') {
    const pr = powerRails.find((r) => r.id === selectedId)
    if (!pr) return null

    const posId = powerRailPosHandle(pr.id)
    const negId = powerRailNegHandle(pr.id)
    const connectedWires = wires.filter((w) =>
      w.startTerminalId === posId || w.endTerminalId === posId ||
      w.startTerminalId === negId || w.endTerminalId === negId
    )

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">⚑ Battery</h3>

        <label className="properties-panel__label">Label</label>
        <input className="properties-panel__input" value={pr.label}
          onChange={(e) => updatePowerRail(pr.id, { label: e.target.value })} />

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Wires connected</span><span>{connectedWires.length}</span>
          </div>
        </div>

        {connectedWires.length > 0 && (
          <div className="properties-panel__terminals">
            <h4 className="properties-panel__subtitle">Connected Wires</h4>
            {connectedWires.map((w) => (
              <div key={w.id} className="terminal-row">
                <span className="terminal-row__wire"
                  style={{ borderLeftColor: WIRE_COLORS[w.color] ?? '#718096' }}>
                  {w.name}
                </span>
                <span className="terminal-row__empty">{w.awg} AWG</span>
              </div>
            ))}
          </div>
        )}

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removePowerRail(pr.id)}>Delete Battery</button>
      </aside>
    )
  }

  // ── Power Bus ──────────────────────────────────────────────────────────────

  if (selectedType === 'powerBus') {
    const pb = powerBuses.find((b) => b.id === selectedId)
    if (!pb) return null

    const allHandles = [
      powerBusInHandle(pb.id),
      ...Array.from({ length: pb.outputCount }, (_, i) => powerBusOutHandle(pb.id, i))
    ]
    const connectedWires = wires.filter((w) =>
      allHandles.some((hid) => w.startTerminalId === hid || w.endTerminalId === hid)
    )

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">⚡ Power Rail</h3>

        <label className="properties-panel__label">Label</label>
        <input className="properties-panel__input" value={pb.label}
          onChange={(e) => updatePowerBus(pb.id, { label: e.target.value })} />

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Outputs</span><span>{pb.outputCount}</span>
          </div>
          <div className="properties-panel__info-row">
            <span>Wires connected</span><span>{connectedWires.length}</span>
          </div>
        </div>

        {connectedWires.length > 0 && (
          <div className="properties-panel__terminals">
            <h4 className="properties-panel__subtitle">Connected Wires</h4>
            {connectedWires.map((w) => (
              <div key={w.id} className="terminal-row">
                <span className="terminal-row__wire"
                  style={{ borderLeftColor: WIRE_COLORS[w.color] ?? '#718096' }}>
                  {w.name}
                </span>
                <span className="terminal-row__empty">{w.awg} AWG</span>
              </div>
            ))}
          </div>
        )}

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removePowerBus(pb.id)}>Delete Power Rail</button>
      </aside>
    )
  }

  // ── Cable Branch ───────────────────────────────────────────────────────────

  if (selectedType === 'cableBranch') {
    const branch = cableBranches.find((b) => b.id === selectedId)
    if (!branch) return null

    // Build per-handle arm entries: for each handle that has ≥1 wire, record which wires touch it
    const armEntries: ArmEntry[] = []
    for (let i = 0; i < branch.handleCount; i++) {
      const hid = cableBranchHandleId(branch.id, i)
      const hw = wires.filter((w) => w.startTerminalId === hid || w.endTerminalId === hid)
      if (hw.length === 0) continue  // spare handle, skip
      armEntries.push({
        handleIdx: i,
        wires: hw.map((w) => ({
          id: w.id, name: w.name, color: w.color,
          cableName: w.cableId ? (cables.find((c) => c.id === w.cableId)?.name ?? null) : null,
          isStart: w.startTerminalId === hid,
        })),
      })
    }

    return <CableBranchPanel
      branch={branch}
      cables={cables}
      armEntries={armEntries}
      updateCableBranch={updateCableBranch}
      injectCableThroughBranch={injectCableThroughBranch}
      removeCableBranch={removeCableBranch}
    />
  }

  // ── Ground ─────────────────────────────────────────────────────────────────

  if (selectedType === 'ground') {
    const ground = grounds.find((g) => g.id === selectedId)
    if (!ground) return null

    const groundHandles = Array.from({ length: ground.handleCount }, (_, i) => `${ground.id}_gnd_${i}`)
    const connectedWires = wires.filter((w) =>
      groundHandles.some((hid) => w.startTerminalId === hid || w.endTerminalId === hid)
    )

    return (
      <aside className="properties-panel">
        <h3 className="properties-panel__title">⏚ Ground Point</h3>

        <label className="properties-panel__label">Label</label>
        <input className="properties-panel__input" value={ground.label}
          onChange={(e) => updateGround(ground.id, { label: e.target.value })} />

        <div className="properties-panel__info-block">
          <div className="properties-panel__info-row">
            <span>Wires connected</span><span>{connectedWires.length}</span>
          </div>
        </div>

        {connectedWires.length > 0 && (
          <div className="properties-panel__terminals">
            <h4 className="properties-panel__subtitle">Connected Wires</h4>
            {connectedWires.map((w) => (
              <div key={w.id} className="terminal-row">
                <span className="terminal-row__wire"
                  style={{ borderLeftColor: WIRE_COLORS[w.color] ?? '#718096' }}>
                  {w.name}
                </span>
                <span className="terminal-row__empty">{w.awg} AWG</span>
              </div>
            ))}
          </div>
        )}

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeGround(ground.id)}>Delete Ground</button>
      </aside>
    )
  }

  return null
}
