# Wireman — Claude Code Context

## What this project is

A desktop Electron app for designing automotive wiring harnesses. Users place connector nodes on a canvas, draw wires between pins, group wires into cable bundles, and get a live bill of materials with cost and labor estimates.

## Running the app

```bash
npm install       # first time only
npm run dev       # launches Electron with hot-reload
npm run package   # builds distributable DMG/EXE/AppImage → dist/
npm run typecheck # type-check only, no build
npm test          # run vitest unit tests
```

## Testing requirements

**Every feature addition must include unit tests.** Tests live in `src/renderer/src/__tests__/`:

- `models.test.ts` — pure functions: factories, BOM, build steps, validation, layouts
- `store.test.ts` — Zustand actions: add/remove/update/cascade behavior, undo/redo

Coverage expectations per feature type:
- **New node type** (e.g. FuseBlock, PowerRail): factory creates correct defaults, handle ID helpers return correct strings, store add/remove/cascade/undo, BOM lines generated correctly
- **New connector preset family**: appears in `CONNECTOR_PRESETS` with correct `family`, layout is registered in `LAYOUTS` or auto-generates correctly, pricing is non-zero
- **New BOM category**: quantity calculation, grouping logic, edge cases (zero items, unconnected wires)
- **New export function**: output contains key strings, handles empty harness, includes new node types

Run `npm run typecheck && npm test` before considering any feature complete.

## Architecture

```
src/main/          Electron main process
src/preload/       Context bridge (window.api → IPC)
src/renderer/src/
  models/index.ts  All domain types, factories, BOM, validation
  store/index.ts   Zustand store — single source of truth
  components/
    canvas/        React Flow nodes + HarnessCanvas
    sidebar/       Add-connector form, entity lists, validation
    properties/    PropertiesPanel (per-selected-type editor)
    bom/           BomPanel + CSV export
  App.tsx          Header, keyboard shortcuts, project name
  index.css        All styles — dark theme, component blocks
```

## Key architectural decisions

**React Flow + Zustand sync**: Store is the source of truth. Canvas nodes/edges are derived in `useMemo` and synced to RF via `useEffect`. RF internal state (`useNodesState`/`useEdgesState`) is required for proper controlled mode.

**ConnectionMode.Loose**: Each connector pin has ONE handle (no source/target split). Any handle connects to any other. This is how `addWire` works too — no direction enforced.

**Handle positioning**: Connector node handles are absolutely positioned on the outer left/right edges of the node. Their Y coordinate is computed in JS using `useLayoutEffect` to measure the face div's `offsetTop` after mount — do NOT use the old `HDR` constant approach (it was wrong). The correct node width formula is `(FACE_MARGIN + PAD) * 2 + cols * CELL + (cols - 1) * GAP` where `FACE_MARGIN = 8` (from CSS `.connector-face { margin: 6px 8px 2px }`).

**Undo/redo**: Every mutating store action calls `pushHistory()` before mutating. History stores snapshots of `{connectors, wires, cables, splices, grounds, fuseBlocks, powerRails}`. Max 50 steps. Move actions (position-only drag) do NOT push history.

**File format**: `.wireman` JSON, `version: 1`. Load accepts any version ≤ `FILE_VERSION` (older files fine), warns on newer. New optional fields use `?? default` — no version bump needed for additions.

**Ground nodes**: Auto-grow handle count — each time a wire connects, `handleCount` increments so there's always a spare. This mirrors the Python `UnionConnector`.

## Domain model (models/index.ts)

- `ConnectorNode` — extends `Record<string, unknown>` (React Flow requirement)
- `Terminal` — `{ id, name, connectorId, wireId | null }`
- `Wire` — connects two terminal IDs; optional `cableId`
- `Cable` — groups wires with a shared `lengthInches`
- `SpliceNode` — junction with N handles (`${spliceId}_${i}`)
- `GroundNode` — chassis ground with auto-growing handles (`${groundId}_gnd_${i}`)
- `FuseBlock` — distribution block with one power-in handle (`${fuseId}_in`) and N circuit-out handles (`${fuseId}_out_${i}`); stores `ampRatings[]` per circuit
- `PowerRail` — positive supply rail, mirrors GroundNode with auto-growing handles (`${railId}_pwr_${i}`)
- `CONNECTOR_PRESETS` — grouped by `family`: Deutsch DTM/DT, TE Superseal 1.5, Molex Micro-Fit 3.0, TE Weather Pack, Relay (5-pin ISO-280), Terminal Block

## Pitfalls to avoid

- **Never use `useHarnessStore(s => ({a: s.a, b: s.b}))` without `useShallow`** — causes infinite re-renders because the selector returns a new object every call.
- **BOM must subscribe to raw data, not `getBom`** — `getBom` is a function reference; subscribing to it doesn't trigger re-renders when connectors/wires change. Subscribe to `{connectors, wires, cables, splices, grounds}` and call `generateBom` directly.
- **Don't hardcode HDR** — the header height can't be reliably predicted from CSS alone; use `faceRef.current.offsetTop` measured in `useLayoutEffect`.
- **`changeConnectorModel` preserves terminal IDs** — it slices existing terminals and appends new ones. Don't rebuild all terminals or wire connections will break.

## CSS conventions

Single `index.css` — no CSS modules. Component styles are in clearly labelled blocks. Dark theme via CSS custom properties on `:root`. All React Flow overrides use `!important` and are in the "React Flow canvas" section at the bottom.

## IPC surface (window.api)

```typescript
window.api.saveHarness(json: string, projectName: string) → { ok, filePath? }
window.api.loadHarness() → { ok, json | null }
```

Defined in `src/preload/index.ts`, typed in `src/renderer/src/env.d.ts`, handled in `src/main/index.ts`.
