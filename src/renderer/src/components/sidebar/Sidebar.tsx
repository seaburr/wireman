import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useHarnessStore } from '../../store'
import { validateHarness, CONNECTOR_PRESETS } from '../../models'

const PRESETS = CONNECTOR_PRESETS

const DEFAULT_FORM = {
  name: '', model: PRESETS[1].model,
  terminalCount: PRESETS[1].terminalCount, costUsd: PRESETS[1].costUsd,
  bootModel: PRESETS[1].bootModel, bootCostUsd: PRESETS[1].bootCostUsd
}

export function Sidebar() {
  const {
    addConnector, addCable, addSplice, addGround,
    connectors, cables, splices, grounds, wires,
    removeConnector, removeCable, removeSplice, removeGround,
    selectedId, select
  } = useHarnessStore(
    useShallow((s) => ({
      addConnector: s.addConnector, addCable: s.addCable, addSplice: s.addSplice, addGround: s.addGround,
      connectors: s.connectors, cables: s.cables, splices: s.splices, grounds: s.grounds, wires: s.wires,
      removeConnector: s.removeConnector, removeCable: s.removeCable, removeSplice: s.removeSplice, removeGround: s.removeGround,
      selectedId: s.selectedId, select: s.select
    }))
  )

  const [form, setForm] = useState(DEFAULT_FORM)

  const issues = validateHarness(connectors, wires, splices, grounds)
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  function applyPreset(model: string) {
    const preset = PRESETS.find((p) => p.model === model)
    if (preset) setForm((f) => ({ ...f, ...preset }))
    else setForm((f) => ({ ...f, model }))
  }

  function handleAddConnector() {
    if (!form.name.trim()) return
    addConnector(form.name.trim(), form.model, form.terminalCount,
      form.costUsd, form.bootModel, form.bootCostUsd)
    setForm({ ...DEFAULT_FORM, name: '' })
  }

  const isCustom = !PRESETS.find((p) => p.model === form.model)

  return (
    <aside className="sidebar">

      {/* ── Add Connector ───────────────────────────────── */}
      <div className="sidebar__section">
        <h3 className="sidebar__title">Add Connector</h3>

        <label className="sidebar__label">Name *</label>
        <input className="sidebar__input" placeholder="e.g. ECU, Sensor A"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && handleAddConnector()} />

        <label className="sidebar__label">Model Preset</label>
        <select className="sidebar__select" value={form.model}
          onChange={(e) => applyPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.model} value={p.model}>{p.model} ({p.terminalCount}-pin)</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>

        {isCustom && (
          <>
            <label className="sidebar__label">Part #</label>
            <input className="sidebar__input" value={form.model === '__custom__' ? '' : form.model}
              placeholder="Connector part number"
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
            <label className="sidebar__label">Pin Count</label>
            <input className="sidebar__input" type="number" min={1} max={64}
              value={form.terminalCount}
              onChange={(e) => setForm((f) => ({ ...f, terminalCount: parseInt(e.target.value) || 1 }))} />
            <div className="sidebar__row">
              <div>
                <label className="sidebar__label">Conn. ($)</label>
                <input className="sidebar__input" type="number" step="0.01" value={form.costUsd}
                  onChange={(e) => setForm((f) => ({ ...f, costUsd: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="sidebar__label">Boot ($)</label>
                <input className="sidebar__input" type="number" step="0.01" value={form.bootCostUsd}
                  onChange={(e) => setForm((f) => ({ ...f, bootCostUsd: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <label className="sidebar__label">Boot Part #</label>
            <input className="sidebar__input" value={form.bootModel}
              onChange={(e) => setForm((f) => ({ ...f, bootModel: e.target.value }))} />
          </>
        )}

        <button className="sidebar__btn sidebar__btn--primary"
          onClick={handleAddConnector}
          disabled={!form.name.trim()}
          title={!form.name.trim() ? 'Enter a name first' : ''}>
          + Add Connector
        </button>
      </div>

      {/* ── Add Splice / Cable ──────────────────────────── */}
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addSplice()}>
          ⊕ Splice
        </button>
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addGround()}>
          ⏚ Ground
        </button>
      </div>
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary"
          style={{ width: '100%' }}
          onClick={() => addCable()}>
          ⌬ Add Cable Bundle
        </button>
      </div>

      {/* ── Connector list ──────────────────────────────── */}
      <div className="sidebar__section sidebar__section--list">
        <h3 className="sidebar__title">Connectors ({connectors.length})</h3>
        {connectors.length === 0 && <p className="sidebar__empty">None yet.</p>}
        {connectors.map((c) => (
          <div key={c.id} className={`sidebar__item${selectedId === c.id ? ' sidebar__item--active' : ''}`}
            onClick={() => select(c.id, 'connector')}>
            <div>
              <div className="sidebar__item-name">{c.name}</div>
              <div className="sidebar__item-meta">{c.model} · {c.terminals.length} pins</div>
            </div>
            <button className="sidebar__btn--icon" title="Remove"
              onClick={(e) => { e.stopPropagation(); removeConnector(c.id) }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Splices ─────────────────────────────────────── */}
      {splices.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Splices ({splices.length})</h3>
          {splices.map((sp) => (
            <div key={sp.id} className={`sidebar__item${selectedId === sp.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(sp.id, 'splice')}>
              <div>
                <div className="sidebar__item-name">{sp.label}</div>
                <div className="sidebar__item-meta">{sp.handleCount} handles</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removeSplice(sp.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Grounds ─────────────────────────────────────── */}
      {grounds.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Grounds ({grounds.length})</h3>
          {grounds.map((g) => (
            <div key={g.id} className={`sidebar__item${selectedId === g.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(g.id, 'ground')}>
              <div>
                <div className="sidebar__item-name">⏚ {g.label}</div>
                <div className="sidebar__item-meta">{g.handleCount - 1} wire(s)</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removeGround(g.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Cables ──────────────────────────────────────── */}
      {cables.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Cables ({cables.length})</h3>
          {cables.map((ca) => (
            <div key={ca.id} className={`sidebar__item${selectedId === ca.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(ca.id, 'cable')}>
              <div>
                <div className="sidebar__item-name">{ca.name}</div>
                <div className="sidebar__item-meta">{ca.wireIds.length} wires · {ca.lengthInches}"</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removeCable(ca.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Validation ──────────────────────────────────── */}
      {issues.length > 0 && (
        <div className="sidebar__section">
          <h3 className="sidebar__title">Validation</h3>
          {errors.map((i, idx) => (
            <div key={idx} className="validation-item validation-item--error">✕ {i.message}</div>
          ))}
          {warnings.map((i, idx) => (
            <div key={idx} className="validation-item validation-item--warning">⚠ {i.message}</div>
          ))}
        </div>
      )}
    </aside>
  )
}
