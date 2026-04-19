import { useEffect } from 'react'
import { HarnessCanvas } from './components/canvas/HarnessCanvas'
import { Sidebar } from './components/sidebar/Sidebar'
import { PropertiesPanel } from './components/properties/PropertiesPanel'
import { BomPanel } from './components/bom/BomPanel'
import { useHarnessStore } from './store'
import { useShallow } from 'zustand/react/shallow'

export default function App() {
  const { undo, redo, canUndo, canRedo, saveToFile, loadFromFile, projectName, setProjectName } = useHarnessStore(
    useShallow((s) => ({
      undo: s.undo, redo: s.redo, canUndo: s.canUndo, canRedo: s.canRedo,
      saveToFile: s.saveToFile, loadFromFile: s.loadFromFile,
      projectName: s.projectName, setProjectName: s.setProjectName,
      // Subscribe to lengths so the component re-renders when history changes,
      // ensuring canUndo() / canRedo() are re-evaluated on each render.
      _pastLen: s.past.length,
      _futureLen: s.future.length,
    }))
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (mod && e.key === 's') { e.preventDefault(); saveToFile() }
      if (mod && e.key === 'o') { e.preventDefault(); loadFromFile() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, saveToFile, loadFromFile])

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__logo">⚡ Wireman</span>
        <div className="app-header__divider" />
        <input
          className="app-header__project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          title="Project name — used as default save filename"
        />
        <div className="app-header__actions">
          <button className="app-header__btn" onClick={undo} disabled={!canUndo()} title="Undo (Cmd+Z)">↩ Undo</button>
          <button className="app-header__btn" onClick={redo} disabled={!canRedo()} title="Redo (Cmd+Shift+Z)">↪ Redo</button>
          <div className="app-header__divider" />
          <button className="app-header__btn" onClick={saveToFile} title="Save (Cmd+S)">Save</button>
          <button className="app-header__btn" onClick={loadFromFile} title="Open (Cmd+O)">Open</button>
        </div>
        <span className="app-header__hint">
          Drag terminals to wire · Click to select · Delete removes selected · Cmd+Z undo
        </span>
      </header>
      <div className="app-body">
        <Sidebar />
        <main className="app-canvas">
          <HarnessCanvas />
        </main>
        <PropertiesPanel />
      </div>
      <BomPanel />
    </div>
  )
}
