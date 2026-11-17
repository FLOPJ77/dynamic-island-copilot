# 🏝️ Dynamic Island Copilot (Windows 11 & macOS)

An open-source, ultra-lightweight Dynamic Island desktop app built with **Tauri v2 + Rust** for **Windows 11** and **macOS** (MacBook Air / Pro M2+ notch integration).

Beyond notification badges, it acts as an ambient top-bar power tool:
1. **Local AI Copilot**: Native Ollama (`localhost:11434`) client, custom AI endpoints, or cloud API keys with ASCII Braille spinning feedback.
2. **Instant In-Island Web Search**: Fast inline web search, instant math calculations, and translations directly inside the island without opening full-screen browser tabs.
3. **Continuous Notes & Local Folder Sync**: Autosaves every keystroke in real-time, maintains note history, and syncs `.md` files directly to `~/Documents/IslandNotes/` (or `%USERPROFILE%\Documents\IslandNotes`). Includes `<kbd>Ctrl</kbd> + <kbd>S</kbd>` quick save and direct "Open in Explorer" shortcut.
4. **Drag & Drop Action Chooser**: Drag any file onto the island to trigger a magnetic glow, dropping opens 4 clean action routes (*Ask AI*, *Append to Note*, *Save to PC*, *Share*).
5. **Monochrome Minimal Aesthetic**: Obsidian, zinc, and crisp white glyphs inspired by modern minimal desktop design.
6. **Dynamic Window Resizing (True Click-Through)**: The frameless transparent native window dynamically shrinks to the island's dimensions (`90x42` idle, `275x46` peek, `540x410` expanded). Clicks outside the island immediately pass through to your background applications with zero lag.

---

## 🚀 Testing in Your Windows 11 VM

### Quick Start (One-Click)
Double-click `run-windows.bat` or run:

```cmd
run-windows.bat
```

### Manual Steps
1. **Prerequisites** in the Windows VM:
   - **Node.js** (v18+): [nodejs.org](https://nodejs.org)
   - **Rust & Cargo**: [rustup.rs](https://rustup.rs) (ensure *C++ Build Tools* are installed via Visual Studio installer)
   - **WebView2 Runtime**: Pre-installed on Windows 11 by default.
2. **Install frontend dependencies**:
   ```cmd
   npm install
   ```
3. **Launch in development mode**:
   ```cmd
   npm run tauri dev
   ```
   The island pill will appear centered at the top of your screen!

### Building Production Release (.exe / installer)
Run:
```cmd
build-windows.bat
```
or:
```cmd
npm run tauri build
```
Compiled outputs:
- Portable executable: `src-tauri\target\release\dynamic-island-copilot.exe`
- Windows Installer: `src-tauri\target\release\bundle\msi\`

---

## 💻 Interaction Architecture

The island transitions across three fluid states with spring physics:

```
[ Stage 1: Idle Pill ] (90x42px Win / 206x40px Mac Notch)
        │
        ▼ (Hover mouse near top)
[ Stage 2: Peek Top-Nav ] (275x46px Win / 290x46px Mac)
   ├── ⊚ AI Chat
   ├── 🔍 Inline Web Search
   ├── 📝 Continuous Notes
   ├── ➕ Quick Note Instant Add
   └── ••• Preferences & Models Modal
        │
        ▼ (Click any icon or press Alt+Space)
[ Stage 3: Expanded Modal ] (540x410px)
```

- **Collapse**: Click anywhere outside the island, press `Escape`, or toggle `Alt + Space`.

---

## 🗂️ Project Structure

```
├── run-windows.bat          # 1-click launcher for Windows VM dev
├── build-windows.bat        # 1-click production release packager
├── index.html               # Frameless transparent desktop webview root
├── package.json             # Tauri v2 CLI & Vite scripts
├── vite.config.js           # Tauri v2 port 1420 & strictPort config
├── src/
│   ├── main.js              # State machine, keyboard shortcuts, autosave loop
│   ├── styles.css           # Squircle physics, custom scrollbars, transparent windowing
│   └── tauri-bridge.js      # Safe IPC invoke bridge with browser fallbacks
├── src-tauri/
│   ├── Cargo.toml           # Rust v2 dependencies (tauri, reqwest, tokio, dirs)
│   ├── build.rs             # Tauri build script
│   ├── tauri.conf.json      # Transparent, frameless, always-on-top window config
│   ├── capabilities/
│   │   └── default.json     # Tauri v2 window security capabilities
│   ├── icons/               # Monochrome island desktop icons (ICO & PNG)
│   └── src/
│       ├── main.rs          # Windows subsystem entrypoint
│       ├── lib.rs           # Plugin & command registry, launch center hook
│       ├── window.rs        # Dynamic screen bounds calculation & physical resizing
│       ├── notes.rs         # Local file I/O (~/Documents/IslandNotes/*.md)
│       └── ollama.rs        # Native async HTTP client for Ollama /api/generate
└── prototype/
    ├── index.html           # Standalone zero-dependency prototype
    └── server.js            # Node HTTP preview server
```

---

## ⚡ Local Ollama & AI Setup

1. Start Ollama locally:
   ```cmd
   ollama serve
   ```
2. Pull your favorite model:
   ```cmd
   ollama run llama3.2
   # or
   ollama run mistral
   # or
   ollama run deepseek-r1
   ```
3. In the Dynamic Island, click `•••` (Preferences):
   - Set **Ollama Host URL** (`http://localhost:11434`).
   - Select or type your local model.
4. If Ollama is offline, the app provides simulated streaming so you can test interactions immediately.
