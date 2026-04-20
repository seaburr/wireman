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
    addConnector, addCable, addSplice, addGround, addFuseBlock, addPowerRail, addPowerBus, addCableBranch,
    connectors, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches, wires,
    removeConnector, removeCable, removeSplice, removeGround, removeFuseBlock, removePowerRail, removePowerBus, removeCableBranch,
    selectedId, select
  } = useHarnessStore(
    useShallow((s) => ({
      addConnector: s.addConnector, addCable: s.addCable, addSplice: s.addSplice, addGround: s.addGround,
      addFuseBlock: s.addFuseBlock, addPowerRail: s.addPowerRail, addPowerBus: s.addPowerBus,
      addCableBranch: s.addCableBranch,
      connectors: s.connectors, cables: s.cables, splices: s.splices, grounds: s.grounds,
      fuseBlocks: s.fuseBlocks, powerRails: s.powerRails, powerBuses: s.powerBuses,
      cableBranches: s.cableBranches, wires: s.wires,
      removeConnector: s.removeConnector, removeCable: s.removeCable,
      removeSplice: s.removeSplice, removeGround: s.removeGround,
      removeFuseBlock: s.removeFuseBlock, removePowerRail: s.removePowerRail, removePowerBus: s.removePowerBus,
      removeCableBranch: s.removeCableBranch,
      selectedId: s.selectedId, select: s.select
    }))
  )

  const [form, setForm] = useState(DEFAULT_FORM)

  const issues = validateHarness(connectors, wires, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches, cables)
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
          {Array.from(
            PRESETS.reduce((map, p) => {
              const fam = p.family ?? 'Other'
              if (!map.has(fam)) map.set(fam, [])
              map.get(fam)!.push(p)
              return map
            }, new Map<string, typeof PRESETS>()),
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
          title={!form.name.trim() ? 'Enter a name first' : 'Add a connector to the canvas. Connectors represent physical multi-pin connectors (plugs, sockets, headers). Each pin becomes a handle you can draw wires to.'}>
          + Add Connector
        </button>
      </div>

      {/* ── Add Splice / Ground / Fuse / Power ─────────── */}
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addSplice()}
          title="Splice: an electrical junction where two or more wires are permanently joined (crimped or soldered). Use for wire-to-wire connections that share the same circuit.">
          ⊕ Splice
        </button>
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addGround()}
          title="Ground point: a chassis ground connection. Attach multiple wires to create a common ground reference. Each wire gets its own handle slot.">
          ⏚ Ground
        </button>
      </div>
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addFuseBlock()}
          title="Fuse block: a distribution block that protects each circuit with a blade fuse. One power input, multiple fused outputs. Set amp ratings per circuit in the properties panel.">
          ⚡ Fuse Block
        </button>
        <button className="sidebar__btn sidebar__btn--secondary sidebar__btn--half"
          onClick={() => addPowerRail()}
          title="Battery / power source: provides positive (+) and negative (−) supply terminals. Connect power wires to these terminals.">
          ⚑ Battery
        </button>
      </div>
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary"
          style={{ width: '100%' }}
          onClick={() => addPowerBus()}
          title="Power rail / distribution bus: one power input feeds multiple output taps. Ideal for distributing a single supply (e.g. 12V ignition) to many devices. Outputs grow automatically.">
          ⚡ Power Rail
        </button>
      </div>
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary"
          style={{ width: '100%' }}
          onClick={() => addCable()}
          title="Cable bundle: groups multiple wires into a single physical cable with a shared length. Assign wires to a cable via each wire's properties panel. Bundles can be collapsed to a single edge on the canvas.">
          ⌬ Add Cable Bundle
        </button>
      </div>
      <div className="sidebar__section sidebar__row--gap">
        <button className="sidebar__btn sidebar__btn--secondary"
          style={{ width: '100%' }}
          onClick={() => addCableBranch()}
          title="Cable branch: a mechanical split/merge point where one cable bundle divides into multiple outgoing cables (or vice-versa). NOT an electrical splice — wires pass through without being joined. Use to model Y-splits in a harness route.">
          ⑂ Cable Branch
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

      {/* ── Fuse Blocks ─────────────────────────────────── */}
      {fuseBlocks.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Fuse Blocks ({fuseBlocks.length})</h3>
          {fuseBlocks.map((fb) => (
            <div key={fb.id} className={`sidebar__item${selectedId === fb.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(fb.id, 'fuseBlock')}>
              <div>
                <div className="sidebar__item-name">⚡ {fb.label}</div>
                <div className="sidebar__item-meta">{fb.circuits}-circuit</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removeFuseBlock(fb.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Power Rails ──────────────────────────────────── */}
      {powerRails.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Batteries ({powerRails.length})</h3>
          {powerRails.map((pr) => (
            <div key={pr.id} className={`sidebar__item${selectedId === pr.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(pr.id, 'powerRail')}>
              <div>
                <div className="sidebar__item-name">⚑ {pr.label}</div>
                <div className="sidebar__item-meta">+/− terminals</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removePowerRail(pr.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Power Buses ─────────────────────────────────── */}
      {powerBuses.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Power Rails ({powerBuses.length})</h3>
          {powerBuses.map((pb) => (
            <div key={pb.id} className={`sidebar__item${selectedId === pb.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(pb.id, 'powerBus')}>
              <div>
                <div className="sidebar__item-name">⚡ {pb.label}</div>
                <div className="sidebar__item-meta">{pb.outputCount} outputs</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removePowerBus(pb.id) }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Cable Branches ──────────────────────────────── */}
      {cableBranches.length > 0 && (
        <div className="sidebar__section sidebar__section--list">
          <h3 className="sidebar__title">Cable Branches ({cableBranches.length})</h3>
          {cableBranches.map((br) => (
            <div key={br.id} className={`sidebar__item${selectedId === br.id ? ' sidebar__item--active' : ''}`}
              onClick={() => select(br.id, 'cableBranch')}>
              <div>
                <div className="sidebar__item-name">⑂ {br.label}</div>
                <div className="sidebar__item-meta">{br.handleCount - 1} wire(s) routed</div>
              </div>
              <button className="sidebar__btn--icon" title="Remove"
                onClick={(e) => { e.stopPropagation(); removeCableBranch(br.id) }}>×</button>
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
