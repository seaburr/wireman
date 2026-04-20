import { useState } from 'react'
import { toPng } from 'html-to-image'
import { useShallow } from 'zustand/react/shallow'
import { useHarnessStore } from '../../store'
import { generateBom, generateBuildSteps, BomLine } from '../../models'

function toKebab(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'wireman'
}

function exportCsv(rows: BomLine[], projectName: string) {
  const header = ['Description', 'Part Number', 'Qty', 'Unit Cost ($)', 'Total Cost ($)']
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        `"${r.description}"`,
        `"${r.partNumber}"`,
        r.category === 'wire' ? `${r.qty} ft` : r.qty,
        r.unitCostUsd.toFixed(2),
        r.totalCostUsd.toFixed(2)
      ].join(',')
    )
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${toKebab(projectName)}-bom.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

function exportBuildSteps(
  connectors: Parameters<typeof generateBuildSteps>[0],
  wires: Parameters<typeof generateBuildSteps>[1],
  cables: Parameters<typeof generateBuildSteps>[2],
  splices: Parameters<typeof generateBuildSteps>[3],
  grounds: Parameters<typeof generateBuildSteps>[4],
  projectName: string,
  fuseBlocks: Parameters<typeof generateBuildSteps>[6],
  powerRails: Parameters<typeof generateBuildSteps>[7],
  powerBuses: Parameters<typeof generateBuildSteps>[8],
  cableBranches: Parameters<typeof generateBuildSteps>[9]
) {
  const text = generateBuildSteps(connectors, wires, cables, splices, grounds, projectName, fuseBlocks, powerRails, powerBuses, cableBranches)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${toKebab(projectName)}-build-steps.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportImage(projectName: string) {
  const canvas = document.querySelector('.app-canvas') as HTMLElement | null
  if (!canvas) return
  try {
    const dataUrl = await toPng(canvas, { backgroundColor: '#1a202c', pixelRatio: 2 })
    const base64 = dataUrl.replace('data:image/png;base64,', '')
    await window.api.exportImage(base64, projectName)
  } catch (e) {
    console.error('Export image failed', e)
  }
}

export function BomPanel() {
  const [open, setOpen] = useState(false)
  const { connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses, cableBranches, projectName } = useHarnessStore(
    useShallow((s) => ({
      connectors: s.connectors, wires: s.wires, cables: s.cables,
      splices: s.splices, grounds: s.grounds,
      fuseBlocks: s.fuseBlocks, powerRails: s.powerRails, powerBuses: s.powerBuses,
      cableBranches: s.cableBranches,
      projectName: s.projectName,
    }))
  )
  const bom = generateBom(connectors, wires, cables, splices, grounds, fuseBlocks, powerRails, powerBuses)

  if (!open) {
    return (
      <div className="bom-bar">
        <button className="bom-bar__toggle" onClick={() => setOpen(true)}>
          Bill of Materials ↑ &nbsp;
          <span className="bom-bar__total">
            Material: ${bom.totalMaterialCostUsd.toFixed(2)} · Build: {formatTime(bom.estimatedLaborMin)} · Est. Sale: ${bom.estimatedSalePriceUsd.toFixed(2)}
          </span>
        </button>
        <div className="bom-bar__exports">
          <button className="bom-btn" onClick={() => exportImage(projectName)}>
            Export Image
          </button>
          <button className="bom-btn" onClick={() => exportBuildSteps(connectors, wires, cables, splices, grounds, projectName, fuseBlocks, powerRails, powerBuses, cableBranches)}>
            Export Build Steps
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bom-panel">
      <div className="bom-panel__header">
        <h3 className="bom-panel__title">Bill of Materials</h3>
        <div className="bom-panel__actions">
          <button className="bom-btn" onClick={() => exportCsv(bom.lines, projectName)}>
            Export CSV
          </button>
          <button className="bom-btn" onClick={() => exportImage(projectName)}>
            Export Image
          </button>
          <button className="bom-btn" onClick={() => exportBuildSteps(connectors, wires, cables, splices, grounds, projectName, fuseBlocks, powerRails, powerBuses, cableBranches)}>
            Export Build Steps
          </button>
          <button className="bom-btn bom-btn--close" onClick={() => setOpen(false)}>
            ↓ Collapse
          </button>
        </div>
      </div>

      <div className="bom-panel__table-wrap">
        <table className="bom-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Part Number</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.length === 0 && (
              <tr>
                <td colSpan={5} className="bom-table__empty">
                  Add connectors and wires to generate a BOM.
                </td>
              </tr>
            )}
            {bom.lines.map((line, i) => (
              <tr key={i}>
                <td>{line.description}</td>
                <td className="bom-table__pn">{line.partNumber}</td>
                <td>{line.category === 'wire' ? `${line.qty} ft` : line.qty}</td>
                <td>${line.unitCostUsd.toFixed(2)}</td>
                <td>${line.totalCostUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bom-table__summary-row">
              <td colSpan={4}>Material Cost</td>
              <td>${bom.totalMaterialCostUsd.toFixed(2)}</td>
            </tr>
            <tr className="bom-table__summary-row">
              <td colSpan={4}>Est. Build Time</td>
              <td>{formatTime(bom.estimatedLaborMin)}</td>
            </tr>
            <tr className="bom-table__summary-row bom-table__summary-row--total">
              <td colSpan={4}>Est. Sale Price (30% margin + labor)</td>
              <td>${bom.estimatedSalePriceUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
