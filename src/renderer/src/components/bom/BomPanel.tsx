import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useHarnessStore } from '../../store'
import { generateBom } from '../../models'

function exportCsv(rows: { description: string; partNumber: string; qty: number; unitCostUsd: number; totalCostUsd: number }[]) {
  const header = ['Description', 'Part Number', 'Qty', 'Unit Cost ($)', 'Total Cost ($)']
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        `"${r.description}"`,
        `"${r.partNumber}"`,
        r.qty,
        r.unitCostUsd.toFixed(2),
        r.totalCostUsd.toFixed(2)
      ].join(',')
    )
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'wireman-bom.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

export function BomPanel() {
  const [open, setOpen] = useState(false)
  const { connectors, wires, cables, splices, grounds } = useHarnessStore(
    useShallow((s) => ({
      connectors: s.connectors, wires: s.wires, cables: s.cables,
      splices: s.splices, grounds: s.grounds,
    }))
  )
  const bom = generateBom(connectors, wires, cables, splices, grounds)

  if (!open) {
    return (
      <div className="bom-bar">
        <button className="bom-bar__toggle" onClick={() => setOpen(true)}>
          Bill of Materials ↑ &nbsp;
          <span className="bom-bar__total">
            Material: ${bom.totalMaterialCostUsd.toFixed(2)} · Build: {formatTime(bom.estimatedLaborMin)} · Est. Sale: ${bom.estimatedSalePriceUsd.toFixed(2)}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="bom-panel">
      <div className="bom-panel__header">
        <h3 className="bom-panel__title">Bill of Materials</h3>
        <div className="bom-panel__actions">
          <button className="bom-btn" onClick={() => exportCsv(bom.lines)}>
            Export CSV
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
                <td>{line.qty}</td>
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
