import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useHarnessStore } from '../../store'
import { WIRE_COLORS, AWG_DIAMETERS, WireColor, CONNECTOR_PRESETS, ConnectorNode } from '../../models'

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
        {CONNECTOR_PRESETS.map((p) => (
          <option key={p.model} value={p.model}>{p.model} ({p.terminalCount}-pin)</option>
        ))}
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

export function PropertiesPanel() {
  const {
    connectors, wires, cables, splices, grounds,
    selectedId, selectedType,
    updateWire, updateConnector, updateCable, updateSplice, updateGround,
    removeWire, removeConnector, removeCable, removeSplice, removeGround,
    assignWireToCable
  } = useHarnessStore(
    useShallow((s) => ({
      connectors: s.connectors, wires: s.wires, cables: s.cables,
      splices: s.splices, grounds: s.grounds,
      selectedId: s.selectedId, selectedType: s.selectedType,
      updateWire: s.updateWire, updateConnector: s.updateConnector,
      updateCable: s.updateCable, updateSplice: s.updateSplice, updateGround: s.updateGround,
      removeWire: s.removeWire, removeConnector: s.removeConnector,
      removeCable: s.removeCable, removeSplice: s.removeSplice, removeGround: s.removeGround,
      assignWireToCable: s.assignWireToCable
    }))
  )

  if (!selectedId) {
    return (
      <aside className="properties-panel properties-panel--empty">
        <p>Click a connector, wire, splice, or cable to inspect it.</p>
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

        <p className="properties-panel__hint">
          Assign wires to this bundle via the wire's properties panel.
        </p>

        <button className="properties-panel__btn properties-panel__btn--danger"
          onClick={() => removeCable(cable.id)}>Delete Cable</button>
      </aside>
    )
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
