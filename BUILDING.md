# Building Wireman

## Prerequisites

- **Node.js** 18+ and **npm** 8+
- **macOS** (for DMG), **Windows** (for NSIS installer), or **Linux** (for AppImage)

## Quick start — run in development

This is the fastest way to launch and test the app. It opens the window with hot-reload on save.

```bash
cd wireman-app
npm install        # first time only
npm run dev
```

The app window opens automatically. Changes to renderer source files (components, store, CSS) reload instantly without restarting.

## Type-check only (no build)

```bash
npm run typecheck
```

## Build a distributable binary

This compiles everything and packages it into a native installer.

```bash
npm run package
```

Output lands in `dist/`:

| Platform | Output |
|----------|--------|
| macOS    | `dist/Wireman-<version>-arm64.dmg` (or `x64.dmg` on Intel) |
| Windows  | `dist/Wireman Setup <version>.exe` |
| Linux    | `dist/Wireman-<version>.AppImage` |

### macOS — install from the DMG

1. Open `dist/Wireman-*.dmg`
2. Drag **Wireman** into `/Applications`
3. First launch: right-click → Open (macOS Gatekeeper will block an unsigned app on first double-click)

### Windows — run the installer

Double-click `dist/Wireman Setup *.exe` and follow the prompts. The app installs to `%LocalAppData%\Programs\Wireman` and adds a Start Menu shortcut.

## Build without packaging (just compile)

If you only want the compiled JS output without running electron-builder:

```bash
npm run build
```

Output goes to `out/`. You can then launch it with:

```bash
npx electron out/main/index.js
```

## Folder structure

```
wireman-app/
├── src/
│   ├── main/         Electron main process (window, IPC, file dialogs)
│   ├── preload/      Context bridge — exposes window.api to the renderer
│   └── renderer/src/ React app (components, store, models, CSS)
├── out/              Compiled JS (after npm run build)
└── dist/             Packaged installer (after npm run package)
```

## Troubleshooting

**App window is blank / white screen**
Run `npm run dev` and open DevTools from the View menu → Toggle Developer Tools. Check the Console tab for errors.

**`npm run package` fails on macOS with code-signing errors**
The app is unsigned. Add this to `package.json` under `"build" → "mac"` to skip signing:
```json
"identity": null
```

**Port already in use**
If the dev server fails to start, kill any leftover process:
```bash
lsof -ti:5173 | xargs kill -9
```
