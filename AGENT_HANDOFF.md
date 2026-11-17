# 🏝️ Dynamic Island Copilot — Agent Handoff & Project Context

## Overview
Dynamic Island Copilot is an ambient top-bar desktop power tool built with **Tauri v2 + Rust** and a minimal **Vite + Tailwind CSS** frontend. It runs natively on **Windows 11** (minimal centered pill) and **macOS** (MacBook Air / Pro notch integration).

---

## 🏗️ Interaction Architecture & Physics

The island transitions across stages with dynamic window resizing and true click-through:
1. **Stage 1: Idle Pill** (`96x32px` Win / `210x34px` Mac)
   - Centered at the top screen edge (`offset_y: 8px`).
   - Pure black (`#0a0a0a`) squircle pill with ambient white glyph.
2. **Stage 2: Peek Top-Nav** (`320x36px` Win / `330x36px` Mac)
   - Triggers on mouse enter with debounced hover physics.
   - Displays quick-action icon glyphs (AI Chat, Search Lens, Notes, New Note `+`, Settings `•••`).
3. **Stage 3: Expanded Modal** (`600x420px`)
   - Expands smoothly on click or shortcut.
   - Fixed header with tab navigation (AI, Search, Notes, Settings) and close button.
   - Collapses automatically when clicking outside or losing window focus (`blur`).
4. **Stage 4 & 5: Drag & Drop Vortex & Action Chooser**
   - Dragging any file over the island triggers a magnetic glow (`380x160px`).
   - Dropping presents 4 clean routing actions (`480x200px`): *Ask AI*, *Append to Note*, *Save to PC*, *Share*.

---

## ⚡ Core Features & Implementation Details

### 1. Multi-Provider AI Copilot (`src-tauri/src/ollama.rs` & `src/main.js`)
- **Native Rust HTTP Client**: Bypasses browser CORS restrictions.
- **Supported Providers**:
  - **Local Ollama** (`http://localhost:11434`, default model `llama3.2`)
  - **Google Gemini** (`gemini-2.0-flash`, `gemini-2.0-flash-lite`, etc. via Generative Language API)
  - **OpenAI** (`gpt-4o-mini`, etc.)
  - **OpenRouter** (`meta-llama/llama-3.3-70b-instruct`, etc.)
  - **Anthropic Claude**
  - **Custom Local Endpoints** (LM Studio, vLLM, text-generation-webui)
- **Live Visual Feedback**: ASCII Braille spinning frames (`⠋ ⠙ ⠹ ...`) during AI generation.

### 2. Instant In-Island Web Search (`src-tauri/src/ollama.rs`)
- **Instant Math**: Detects arithmetic expressions (e.g., `24 * 7 + 10`) and solves them instantly in-island.
- **Top 4 Real Search Results**: Queries DuckDuckGo Instant Answer API with Wikipedia OpenSearch fallback to return 4 rich result cards (title, domain, snippet).
- **One-Click Browser Launch**: Click any result or press Enter to open in default Windows browser.

### 3. Continuous Notes & Local Folder Sync (`src-tauri/src/notes.rs`)
- Auto-saves note history in real-time.
- Directly syncs `.md` files to `%USERPROFILE%\Documents\IslandNotes\`.
- `<kbd>Ctrl</kbd> + <kbd>S</kbd>` quick save shortcut.
- "Open Notes Folder" button opens `%USERPROFILE%\Documents\IslandNotes\` in Windows Explorer.

### 4. True Click-Through & Window Bounds (`src-tauri/src/window.rs`)
- Uses Tauri's native `set_size` and `set_position` coupled with Win32 `SetWindowPos` (`0x0054: SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW`).
- Uses Tauri's `set_shadow(false)` instead of raw `DwmSetWindowAttribute(DWMNCRP_DISABLED)`, ensuring Windows 10 DWM does not suppress window composition.

---

## 🛠️ Build & Management Scripts

- `clean-and-rebuild.bat`:
  1. Kills any running `dynamic-island-copilot.exe`.
  2. Verifies npm dependencies.
  3. Cleans `dist\` and previous binary.
  4. Runs `npx @tauri-apps/cli build` to produce both release binary and installers (`.msi`, `.exe`).
  5. Launches the updated app.
- `run-windows.bat`: Dev mode launcher with Vite hot reload (`npm run tauri dev`).
- `launch-app.bat`: Quickly launches the compiled release or debug binary on your interactive desktop.
- `close-app.bat`: Kills any running instances of the app.

---

## 📝 Recent Fixes & Verified Status

- **Fixed Rust FFI Signatures in `window.rs`**: Updated `SetWindowPos` to accept `*mut std::ffi::c_void` matching Tauri v2's `HWND.0` raw pointer.
- **Fixed `lib.rs` Drag-Drop Window Resolution**: Resolved `tauri::Window` vs `tauri::WebviewWindow` mismatch by calling `window.app_handle().get_webview_window(window.label())`.
- **Fixed Windows 10 DWM Blackout & Visibility**:
  - Removed `DwmSetWindowAttribute` with `DWMNCRP_DISABLED (1)` which caused Windows 10 DWM to suppress composition for transparent windows.
  - Added explicit `window.show()` in `setup` and `resize_island`.
  - Added `SWP_SHOWWINDOW (0x0040)` to `SetWindowPos` and preserved Tauri's native `set_size`/`set_position` calls so the WebView2 controller is kept in sync.
- **Added CSS Fallbacks in `src/styles.css`**: Standalone CSS rules ensure the idle pill and icon render immediately without dependency on external CDN initialization.
- **Desktop Session Note**: Background terminal commands run in an isolated agent desktop (`exebox-...`), so to view the GUI interactively on your monitor, launch the app directly via `launch-app.bat` or `run-windows.bat` on the user's desktop.
- **Fluid Spring Animations & Physics**:
  - Replaced abrupt stage cutoffs with `--spring-curve` (`cubic-bezier(0.16, 1, 0.3, 1)`) and `--ease-out-smooth` transitions.
  - Hover enter buffer tuned to `70ms` and leave buffer tuned to `220ms` to prevent twitching when brushing past the island.
  - Added smooth animated collapse in `collapseIsland()` before resizing native window.
  - Tab switching now applies `.tab-content-enter` for fluid content transitions.
- **In-Island Deep Web Research & Gaming Intent Engine**:
  - Solved empty searches on complex gaming queries like `"Sett runes league of legends"`: added intelligent champion/runes/build intent recognition generating deep links directly to `U.GG`, `OP.GG`, and `Mobafire`.
  - Added Google AutoComplete suggestion cards and direct search fallback cards so complex search queries always return actionable top 4 results.
- **Search Clearing Race Condition & 200ms Debounce**:
  - Eliminated the stuck "r" bug when rapidly backspacing or clearing with Delete key.
  - Implemented monotonic `searchSequence` tracking and immediate reset when the input is emptied (`!q`), discarding stale in-flight responses.
  - Added `200ms` debounce delay as requested.
- **Rich Markdown Engine for AI Responses**:
  - Implemented full client-side Markdown parser in `formatMarkdown()`:
    - Fenced code blocks with language labels and interactive 1-click **Copy** button.
    - Headers (`#`, `##`, `###`), blockquotes, horizontal dividers, unordered/ordered lists, links, inline code, bold, and italics.
    - Automatic HTML escaping to preserve security while cleanly rendering code snippets.
- **Modern Gemini & Settings Refinements**:
  - Updated Gemini default and suggestions from `gemini-2.0-flash` to latest `gemini-2.5-flash`.
  - Updated OpenAI (`gpt-4o`) and Anthropic Claude (`claude-3-7-sonnet-20250219`) placeholders.
  - Dynamic top-right status badge: dynamically updates between `● Local AI (Provider)` and `✦ Cloud API (Provider)` depending on whether a local engine or cloud API is selected.
- **Zero White Outlines on Click**:
  - Eliminated the default WebView2/browser rectangular focus outline and tap highlights across all buttons, textareas, inputs, and elements (`*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }`).
- **Full Markdown Headings & Code Support**:
  - Expanded `formatMarkdown()` to recognize `h1` through `h6` (`#### step 1`, `##### sub-steps`, etc.) and code fences (` ``` ` and ` ~~~ `), ensuring technical AI outputs render with proper typography and interactive Copy buttons.
- **Organic Web Search Engine & Working Deep Links**:
  - Replaced hardcoded gaming filters with real DuckDuckGo HTML scraping (`https://html.duckduckgo.com/html/?q=...`) with decoded `uddg` URLs for genuine top organic results for any query.
  - Attached search opener to global window scope (`window.handleOpenSearchResult` / `window.openBrowserUrlNative`), fixing the issue where clicking suggestions didn't launch the browser.
  - Pressing Enter in the search input directly launches the browser or opens the top organic result.
- **Minimal Notes Tab & "Open Folder" Integration**:
  - Redesigned "New Note" button with a sleek minimal border (`border border-white/15 hover:border-white/25`) and soft background (`bg-white/[0.03]`).
  - Redesigned active note item in the sidebar to use a minimal lighter border (`border-white/25 bg-white/[0.04]`) instead of a solid gray block.
  - Replaced the redundant "Save" button with an "Open Folder" button that directly opens `%USERPROFILE%\Documents\IslandNotes\` in Windows Explorer.
- **AI Completion Notifications (Visual Pulse + Dual-Tone Chime / Custom MP3)**:
  - Added an island visual pulse (`island-notify-pulse`) that gently bounces and glows emerald when the AI finishes a long/local query.
  - Implemented a Web Audio API dual-tone harmonious chime (D5 587.33Hz -> A5 880Hz) that requires zero external assets.
  - Added Settings controls to mute/unmute, preview/test sound, upload custom audio files (`.mp3`, `.wav`), or reset back to default.
- **Fixed Notes Layout & Open Folder Button**:
  - Made the "Open Folder" button strictly horizontal inline (`inline-flex flex-row items-center whitespace-nowrap shrink-0`) preventing vertical line wraps.
  - Fixed title input layout with `flex-1 min-w-0` to guarantee enough room for header controls.
- **Eliminated Note Typing Flicker & Resizing**:
  - Replaced full sidebar DOM teardown (`innerHTML = ''`) with in-place title updates (`updateSidebarNoteTitle`).
  - Debounced disk autosave operations (350ms) to avoid blocking the UI thread on every keystroke.
  - Locked `#note-autosave-indicator` width to `w-14 text-right shrink-0` so transitions between "Saving..." and "Autosaved" never trigger layout shifts.
- **Plain Text (`.txt`) Default & Markdown (`.md`) Support**:
  - Notes default to standard `.txt` plain text files for universal compatibility.
  - Added format dropdown in Settings (Section 3) allowing users to switch between `.txt` and `.md`.
  - Updated Rust IPC backend (`save_note_file`) to support custom file extensions seamlessly.
- **Notification LED Indicator**:
  - Integrated a pulsing emerald LED indicator dot (`#idle-notify-led`, `#peek-notify-led`, `#tab-notify-led`) that lights up when AI finishes responding in the background.
  - Clears automatically when the user views/switches to the AI tab.
- **Clean Standalone Backup & Distribution Archive**:
  - Created `C:\Users\crub\Desktop\dynamic-island-copilot.zip` (~3.5 MB).
  - Contains complete source code, configs, batch build scripts, and the compiled ready-to-run `dynamic-island-copilot.exe` at the root.
  - Excludes heavy `node_modules` and `target` build caches for easy copy to USB or upload to GitHub.

