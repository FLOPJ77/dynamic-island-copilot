import {
  isTauri,
  resizeNativeWindow,
  saveNoteToDisk,
  queryAiNative,
  openNotesFolderNative,
  exitAppNative,
  openBrowserUrlNative,
  instantWebSearchNative,
  searchWebResultsNative,
  searchYouTubeVideosNative,
  loadAppSettingsNative,
  saveAppSettingsNative,
  getSoulFileContentNative,
  saveSoulFileContentNative,
  resetSoulFileContentNative,
  openSoulFileNative,
  syncWhatsappWebviewNative,
  destroyWhatsappWebviewNative,
  isIslandOrWhatsappFocusedNative
} from './tauri-bridge.js';

// Expose bridge helpers to global window for inline click handlers
window.openBrowserUrlNative = openBrowserUrlNative;
window.handleOpenSearchResult = function(url, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (!url) return;
  openBrowserUrlNative(url);
  if (window.collapseIsland) {
    window.collapseIsland();
  }
};

// Safe storage helper with in-memory fallback
const safeStorage = {
  _mem: {},
  getItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {}
    return this._mem[key] || null;
  },
  setItem(key, val) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch (e) {}
    this._mem[key] = val;
  }
};

const DEFAULT_TOOLS_CONFIG = [
  { id: 'ai', label: 'AI Copilot', desc: 'Local Ollama & Cloud AI chat', enabled: true },
  { id: 'music', label: 'YouTube Music', desc: 'Music player & S25/iPhone mini pill', enabled: true },
  { id: 'search', label: 'Web Search', desc: 'Instant math & top 4 direct web links', enabled: true },
  { id: 'notes', label: 'Quick Notes', desc: 'Continuous autosave markdown notes', enabled: true },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'In-island chats (0 MB RAM when sleeping)', enabled: true }
];

window.state = {
  osMode: safeStorage.getItem('island_os_mode') || 'win11',
  islandState: 'idle', // 'idle' | 'peek' | 'expanded' | 'drag-hover' | 'action-chooser'
  activeTab: safeStorage.getItem('island_last_tab') || 'ai',
  toolsConfig: JSON.parse(JSON.stringify(DEFAULT_TOOLS_CONFIG)),
  currentDroppedFile: null,
  notes: [],
  currentNoteId: null,
  aiRunning: false,
  whatsapp: {
    running: false,
    zoom: parseFloat(safeStorage.getItem('island_wa_zoom')) || 0.72
  },
  music: {
    videoId: null,
    title: '',
    channel: '',
    thumbnail: '',
    playing: false,
    muted: false,
    volume: 80,
    recentTracks: [],
    prefs: {
      showGenreBar: true,
      activeGenreIds: ['dnb', 'classic', 'epic', 'anime', 'movies'],
      customGenres: [],
      activeGenreFilter: ''
    }
  }
};

// DOM references
const island = document.getElementById('dynamic-island');
const stageIdle = document.getElementById('stage-idle');
const stagePeek = document.getElementById('stage-peek');
const stageExpanded = document.getElementById('stage-expanded');
const stageDragHover = document.getElementById('stage-drag-hover');
const stageActionChooser = document.getElementById('stage-action-chooser');
const chatStreamBox = document.getElementById('chat-stream-box');
const promptInput = document.getElementById('ai-prompt-input');
const notesHistoryList = document.getElementById('notes-history-list');
const noteTitleInput = document.getElementById('note-title-input');
const noteBodyInput = document.getElementById('note-body-input');
const noteAutosaveIndicator = document.getElementById('note-autosave-indicator');

// --------------------------------------------------------
// Geometry & Dynamic Window Sizing (Butter-Smooth GPU Morph)
// --------------------------------------------------------
let hoverTimer = null;
let isCollapsing = false;
let isExpandedMorphing = false;
let morphSequence = 0;
let currentNativeCanvas = { width: 320, height: 36 };

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function setActiveStageLayer(activeName) {
  const isMac = state.osMode === 'mac';
  if (stagePeek) {
    stagePeek.style.width = isMac ? '328px' : '318px';
  }
  const map = {
    idle: stageIdle,
    peek: stagePeek,
    expanded: stageExpanded,
    'drag-hover': stageDragHover,
    'action-chooser': stageActionChooser
  };
  Object.entries(map).forEach(([name, el]) => {
    if (!el) return;
    if (name === activeName) {
      el.classList.remove('stage-inactive');
      el.classList.add('stage-active');
    } else {
      el.classList.remove('stage-active');
      el.classList.add('stage-inactive');
    }
  });
}

function syncActiveTabOverlays() {
  if (window.syncYouTubePlayerOverlay) window.syncYouTubePlayerOverlay();
  if (window.syncWhatsappOverlay) window.syncWhatsappOverlay();
}

window.applyDimensions = async function() {
  const isMac = state.osMode === 'mac';
  const hasMusic = Boolean(state.music && state.music.videoId);
  const targetOffsetY = isMac ? 0.0 : 8.0;
  const seq = ++morphSequence;

  if (state.islandState === 'idle') {
    const targetNativeWidth = isMac ? 330 : 320;
    const targetNativeHeight = 36;

    if (hasMusic) {
      island.style.width = isMac ? '248px' : '216px';
      island.style.height = '34px';
    } else {
      island.style.width = isMac ? '210px' : '96px';
      island.style.height = isMac ? '34px' : '32px';
    }
    island.style.borderRadius = isMac ? '0 0 16px 16px' : '9999px';
    island.style.borderTop = isMac ? 'none' : '1px solid rgba(255, 255, 255, 0.16)';
    island.classList.remove('island-drag-glow');

    setActiveStageLayer('idle');
    syncActiveTabOverlays();

    await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
    if (seq === morphSequence) {
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
    }
  } else if (state.islandState === 'peek') {
    const targetNativeWidth = isMac ? 330 : 320;
    const targetNativeHeight = 36;

    island.style.width = isMac ? '330px' : '320px';
    island.style.height = '36px';
    island.style.borderRadius = isMac ? '0 0 16px 16px' : '9999px';
    island.style.borderTop = isMac ? 'none' : '1px solid rgba(255, 255, 255, 0.16)';
    island.classList.remove('island-drag-glow');

    setActiveStageLayer('peek');
    syncActiveTabOverlays();

    await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
    if (seq === morphSequence) {
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
    }
  } else if (state.islandState === 'expanded') {
    const targetNativeWidth = 600;
    const targetNativeHeight = 420;
    const needsCanvasGrow =
      currentNativeCanvas.width < targetNativeWidth ||
      currentNativeCanvas.height < targetNativeHeight;

    if (needsCanvasGrow) {
      isExpandedMorphing = true;
      await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
      await nextAnimationFrame();
      if (seq !== morphSequence || state.islandState !== 'expanded') return;
    } else {
      await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
    }

    island.classList.remove('island-drag-glow');
    island.classList.remove('island-collapsing');
    island.style.width = '600px';
    island.style.height = '420px';
    island.style.borderRadius = isMac ? '0 0 24px 24px' : '24px';
    island.style.borderTop = isMac ? 'none' : '1px solid rgba(255, 255, 255, 0.16)';

    setActiveStageLayer('expanded');

    if (needsCanvasGrow) {
      setTimeout(() => {
        if (seq === morphSequence && state.islandState === 'expanded') {
          isExpandedMorphing = false;
          syncActiveTabOverlays();
        }
      }, 305);
    } else {
      isExpandedMorphing = false;
      syncActiveTabOverlays();
    }
  } else if (state.islandState === 'drag-hover') {
    const targetNativeWidth = 380;
    const targetNativeHeight = 160;
    if (currentNativeCanvas.width < targetNativeWidth || currentNativeCanvas.height < targetNativeHeight) {
      await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
      await nextAnimationFrame();
      if (seq !== morphSequence || state.islandState !== 'drag-hover') return;
    }

    island.style.width = '380px';
    island.style.height = '160px';
    island.style.borderRadius = '24px';
    island.style.borderTop = '1px solid rgba(255, 255, 255, 0.16)';
    island.classList.add('island-drag-glow');

    setActiveStageLayer('drag-hover');
    syncActiveTabOverlays();
  } else if (state.islandState === 'action-chooser') {
    const targetNativeWidth = 480;
    const targetNativeHeight = 200;
    if (currentNativeCanvas.width < targetNativeWidth || currentNativeCanvas.height < targetNativeHeight) {
      await resizeNativeWindow(targetNativeWidth, targetNativeHeight, targetOffsetY);
      currentNativeCanvas = { width: targetNativeWidth, height: targetNativeHeight };
      await nextAnimationFrame();
      if (seq !== morphSequence || state.islandState !== 'action-chooser') return;
    }

    island.style.width = '480px';
    island.style.height = '200px';
    island.style.borderRadius = '24px';
    island.style.borderTop = '1px solid rgba(255, 255, 255, 0.16)';
    island.classList.remove('island-drag-glow');

    setActiveStageLayer('action-chooser');
    syncActiveTabOverlays();
  }
};

window.handleIslandMouseEnter = function() {
  if (isCollapsing) return;
  if (hoverTimer) clearTimeout(hoverTimer);
  if (state.islandState === 'idle') {
    hoverTimer = setTimeout(() => {
      if (state.islandState === 'idle' && !isCollapsing) {
        state.islandState = 'peek';
        window.applyDimensions();
      }
    }, 18);
  }
};

window.handleIslandMouseLeave = function() {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (state.islandState === 'peek') {
    hoverTimer = setTimeout(() => {
      if (state.islandState === 'peek') {
        state.islandState = 'idle';
        window.applyDimensions();
      }
    }, 100);
  }
};

// Ensure mouse leaving the window canvas triggers leave
document.addEventListener('mouseleave', () => {
  if (state.islandState === 'peek') {
    window.handleIslandMouseLeave();
  }
});

window.handleIslandClick = function(e) {
  if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
    return;
  }
  if (state.islandState === 'idle' || state.islandState === 'peek') {
    if (state.islandState === 'idle' && state.music && state.music.videoId) {
      window.openTabDirect('music');
    } else {
      window.openTabDirect(state.activeTab);
    }
  }
};

window.toggleIsland = function(e) {
  if (e) e.stopPropagation();
  if (state.islandState === 'idle' || state.islandState === 'peek' || isCollapsing) {
    window.openTabDirect(state.activeTab);
  } else {
    window.collapseIsland();
  }
};

window.openTabDirect = function(tab, e) {
  if (e) e.stopPropagation();
  if (hoverTimer) clearTimeout(hoverTimer);
  isCollapsing = false;
  island.classList.remove('island-collapsing');
  state.islandState = 'expanded';
  window.switchTab(tab);
  window.applyDimensions();
};

window.collapseIsland = function(e) {
  if (e) e.stopPropagation();
  if (hoverTimer) clearTimeout(hoverTimer);
  if (state.islandState === 'idle' || isCollapsing) return;

  const isMac = state.osMode === 'mac';
  const hasMusic = Boolean(state.music && state.music.videoId);
  const baseNativeW = isMac ? 330 : 320;
  const targetOffsetY = isMac ? 0.0 : 8.0;

  // Immediately park YouTube video & hide WhatsApp overlay so they never clip during collapse animation
  const ytHost = document.getElementById('yt-player-host');
  if (ytHost) ytHost.classList.add('yt-offscreen-keepalive');
  if (state.whatsapp && state.whatsapp.running) {
    syncWhatsappWebviewNative(false, 0, 0, 0, 0, state.whatsapp.zoom);
  }

  // Smooth two-phase collapse from expanded / drag / action-chooser:
  // Phase 1: Crossfade layers with fixed layout (0 reflow) & spring capsule back to idle size
  // Phase 2: Wait for CSS height transition completion + compositor commit before shrinking native OS window
  if (state.islandState === 'expanded' || state.islandState === 'action-chooser' || state.islandState === 'drag-hover') {
    const seq = ++morphSequence;
    isCollapsing = true;
    isExpandedMorphing = false;

    island.classList.remove('island-drag-glow');
    island.classList.add('island-collapsing');
    setActiveStageLayer('idle');

    if (hasMusic) {
      island.style.width = isMac ? '248px' : '216px';
      island.style.height = '34px';
    } else {
      island.style.width = isMac ? '210px' : '96px';
      island.style.height = isMac ? '34px' : '32px';
    }
    island.style.borderRadius = isMac ? '0 0 16px 16px' : '9999px';
    island.style.borderTop = isMac ? 'none' : '1px solid rgba(255, 255, 255, 0.16)';

    let finished = false;
    const finishCollapse = async () => {
      if (finished) return;
      finished = true;
      island.removeEventListener('transitionend', onTransitionEnd);
      if (seq !== morphSequence) return;

      island.classList.remove('island-collapsing');
      state.islandState = 'idle';
      window.clearSearchInput();

      await nextAnimationFrame();
      if (seq !== morphSequence) return;

      await resizeNativeWindow(baseNativeW, 36, targetOffsetY);
      if (seq !== morphSequence) return;
      currentNativeCanvas = { width: baseNativeW, height: 36 };

      await nextAnimationFrame();
      if (seq === morphSequence) {
        isCollapsing = false;
      }
    };

    const onTransitionEnd = (ev) => {
      if (ev.target === island && (ev.propertyName === 'height' || ev.propertyName === 'width')) {
        finishCollapse();
      }
    };
    island.addEventListener('transitionend', onTransitionEnd);
    setTimeout(finishCollapse, 275);
    return;
  }

  // From peek to idle (same 320x36 canvas):
  state.islandState = 'idle';
  window.clearSearchInput();
  window.applyDimensions();
};

// Collapse on blur (clicking desktop or background apps, ignoring clicks inside YouTube iframe or docked WhatsApp webview)
async function checkAndCollapseOnBlur() {
  if (document.activeElement && document.activeElement.id === 'yt-player-iframe') {
    return;
  }
  if (state.whatsapp && state.whatsapp.running && state.activeTab === 'whatsapp') {
    const anyFocused = await isIslandOrWhatsappFocusedNative();
    if (anyFocused) return;
  }
  if (state.islandState === 'expanded' || state.islandState === 'action-chooser') {
    window.collapseIsland();
  }
}

window.addEventListener('blur', () => {
  setTimeout(checkAndCollapseOnBlur, 80);
});

// Collapse on outside click
document.addEventListener('click', (e) => {
  const isInside = e.composedPath().some(el => el.id === 'dynamic-island');
  if (!isInside && (state.islandState === 'expanded' || state.islandState === 'action-chooser')) {
    window.collapseIsland();
  }
});

// --------------------------------------------------------
// Tabs Navigation & Customizable Island Tools Order/Visibility
// --------------------------------------------------------
function getFirstEnabledToolId() {
  const found = (state.toolsConfig || []).find(t => t.enabled);
  return found ? found.id : 'settings';
}

function isToolEnabled(toolId) {
  if (toolId === 'settings') return true;
  const found = (state.toolsConfig || []).find(t => t.id === toolId);
  return found ? Boolean(found.enabled) : true;
}

window.applyIslandToolsLayout = function() {
  const expandedBar = document.getElementById('expanded-tabs-bar');
  const peekBar = document.getElementById('peek-tools-bar');
  const peekSettingsBtn = document.getElementById('peek-btn-settings');

  if (!Array.isArray(state.toolsConfig) || state.toolsConfig.length === 0) {
    state.toolsConfig = JSON.parse(JSON.stringify(DEFAULT_TOOLS_CONFIG));
  }

  state.toolsConfig.forEach(tool => {
    const tabBtn = document.getElementById(`tab-btn-${tool.id}`);
    if (tabBtn && expandedBar) {
      expandedBar.appendChild(tabBtn);
      tabBtn.classList.toggle('hidden', !tool.enabled);
    }

    const peekBtn = document.getElementById(`peek-btn-${tool.id}`);
    if (peekBtn && peekBar) {
      if (peekSettingsBtn && peekSettingsBtn.parentNode === peekBar) {
        peekBar.insertBefore(peekBtn, peekSettingsBtn);
      } else {
        peekBar.appendChild(peekBtn);
      }
      peekBtn.classList.toggle('hidden', !tool.enabled);
    }
  });

  // Hide the tab bar wrapper if all tools were somehow disabled
  if (expandedBar) {
    const anyEnabled = state.toolsConfig.some(t => t.enabled);
    expandedBar.classList.toggle('hidden', !anyEnabled);
  }

  // If current active tab was disabled, switch to the first enabled tool
  if (state.activeTab !== 'settings' && !isToolEnabled(state.activeTab)) {
    state.activeTab = getFirstEnabledToolId();
    safeStorage.setItem('island_last_tab', state.activeTab);
    if (state.islandState === 'expanded') {
      window.switchTab(state.activeTab);
    }
  }

  renderSettingsToolsList();
};

function renderSettingsToolsList() {
  const container = document.getElementById('settings-tools-list');
  if (!container) return;

  const enabledCount = state.toolsConfig.filter(t => t.enabled).length;

  container.innerHTML = state.toolsConfig.map((tool, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === state.toolsConfig.length - 1;
    const isOnlyEnabled = tool.enabled && enabledCount <= 1;

    return `
      <div class="flex items-center justify-between px-2.5 py-1.5 radius-btn border transition ${
        tool.enabled
          ? 'bg-zinc-900/90 border-white/10 text-zinc-100'
          : 'bg-zinc-950/60 border-white/5 text-zinc-500 opacity-65'
      }">
        <div class="flex items-center space-x-2 min-w-0">
          <!-- Up / Down Order Controls -->
          <div class="flex items-center space-x-0.5 shrink-0">
            <button type="button"
                    onclick="moveIslandTool(${idx}, -1, event)"
                    ${isFirst ? 'disabled' : ''}
                    title="Move Left / Up"
                    class="p-1 radius-btn bg-white/5 hover:bg-white/15 border border-white/10 ${
                      isFirst ? 'opacity-25 cursor-not-allowed' : 'text-zinc-300 hover:text-white'
                    } transition flex items-center justify-center">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button type="button"
                    onclick="moveIslandTool(${idx}, 1, event)"
                    ${isLast ? 'disabled' : ''}
                    title="Move Right / Down"
                    class="p-1 radius-btn bg-white/5 hover:bg-white/15 border border-white/10 ${
                      isLast ? 'opacity-25 cursor-not-allowed' : 'text-zinc-300 hover:text-white'
                    } transition flex items-center justify-center">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <div class="min-w-0">
            <div class="text-xs font-medium flex items-center space-x-1.5">
              <span>${escapeHtml(tool.label)}</span>
              <span class="text-[9px] px-1.5 py-0.1 rounded bg-white/5 border border-white/10 text-zinc-400 font-mono">#${idx + 1}</span>
            </div>
            <div class="text-[10px] text-zinc-500 truncate">${escapeHtml(tool.desc)}</div>
          </div>
        </div>

        <label class="flex items-center space-x-1.5 cursor-pointer shrink-0">
          <input type="checkbox"
                 ${tool.enabled ? 'checked' : ''}
                 ${isOnlyEnabled ? 'disabled title="At least one tool must remain enabled"' : ''}
                 onchange="toggleIslandTool('${tool.id}', this.checked, event)"
                 class="rounded bg-zinc-900 border-white/20 text-emerald-500 focus:ring-0 cursor-pointer" />
          <span class="text-[11px] ${tool.enabled ? 'text-emerald-400 font-medium' : 'text-zinc-500'}">
            ${tool.enabled ? 'Active' : 'Hidden'}
          </span>
        </label>
      </div>
    `;
  }).join('');
}

window.moveIslandTool = function(index, direction, e) {
  if (e) e.stopPropagation();
  const targetIdx = index + direction;
  if (targetIdx < 0 || targetIdx >= state.toolsConfig.length) return;

  const temp = state.toolsConfig[index];
  state.toolsConfig[index] = state.toolsConfig[targetIdx];
  state.toolsConfig[targetIdx] = temp;

  window.applyIslandToolsLayout();
  saveSettings();
};

window.toggleIslandTool = function(toolId, enabled, e) {
  if (e) e.stopPropagation();
  const tool = state.toolsConfig.find(t => t.id === toolId);
  if (!tool) return;

  // Ensure at least 1 tool stays enabled
  if (!enabled) {
    const enabledCount = state.toolsConfig.filter(t => t.enabled).length;
    if (enabledCount <= 1) {
      renderSettingsToolsList();
      return;
    }
    if (toolId === 'music' && state.music && state.music.videoId) {
      window.stopMusicPlayback();
    }
    if (toolId === 'whatsapp' && window.stopWhatsappEngine) {
      window.stopWhatsappEngine();
    }
  }

  tool.enabled = Boolean(enabled);
  window.applyIslandToolsLayout();
  saveSettings();
};

window.resetIslandToolsConfig = function(e) {
  if (e) e.stopPropagation();
  state.toolsConfig = JSON.parse(JSON.stringify(DEFAULT_TOOLS_CONFIG));
  window.applyIslandToolsLayout();
  saveSettings();
};

window.switchTab = function(tab, e) {
  if (e) e.stopPropagation();
  if (tab !== 'settings' && !isToolEnabled(tab)) {
    tab = getFirstEnabledToolId();
  }
  state.activeTab = tab;
  safeStorage.setItem('island_last_tab', tab);

  if (tab === 'ai') {
    window.clearNotifyLed();
  }

  const tabs = ['ai', 'music', 'search', 'notes', 'whatsapp', 'settings'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    const enabled = isToolEnabled(t);
    if (content) {
      if (t === tab) {
        content.classList.remove('hidden');
        content.classList.remove('tab-content-enter');
        requestAnimationFrame(() => {
          content.classList.add('tab-content-enter');
        });
        if (btn) {
          if (t === 'settings') {
            btn.className = 'p-1.5 radius-btn bg-white/15 text-white transition';
          } else {
            btn.className = `px-2.5 py-1 radius-btn text-xs font-medium transition flex items-center space-x-1.5 bg-white/10 text-white ${enabled ? '' : 'hidden'}`;
          }
        }
      } else {
        content.classList.add('hidden');
        if (btn) {
          if (t === 'settings') {
            btn.className = 'p-1.5 radius-btn text-zinc-400 hover:text-white hover:bg-white/10 transition';
          } else {
            btn.className = `px-2.5 py-1 radius-btn text-xs font-medium transition flex items-center space-x-1.5 text-zinc-400 hover:text-white hover:bg-white/5 ${enabled ? '' : 'hidden'}`;
          }
        }
      }
    }
  });

  if (window.syncYouTubePlayerOverlay) {
    window.syncYouTubePlayerOverlay();
  }
  if (window.syncWhatsappOverlay) {
    window.syncWhatsappOverlay();
  }

  if (tab === 'ai' && promptInput) {
    setTimeout(() => promptInput.focus(), 100);
  } else if (tab === 'music') {
    setTimeout(() => {
      if (window.syncYouTubePlayerOverlay) window.syncYouTubePlayerOverlay();
      document.getElementById('yt-search-input')?.focus();
    }, 100);
  } else if (tab === 'whatsapp') {
    setTimeout(() => {
      if (window.syncWhatsappOverlay) window.syncWhatsappOverlay();
    }, 110);
  } else if (tab === 'search') {
    updateSearchEngineLabel();
    setTimeout(() => document.getElementById('web-search-input')?.focus(), 100);
  }
};

// --------------------------------------------------------
// In-Island Web Search & Real Top 4 Result Cards
// --------------------------------------------------------
function updateSearchEngineLabel() {
  const provider = document.getElementById('settings-search-provider')?.value || 'google';
  const labelEl = document.getElementById('search-engine-label');
  if (labelEl) {
    if (provider === 'google') {
      labelEl.textContent = 'Google Search • Live Web Results';
    } else if (provider === 'searxng') {
      labelEl.textContent = 'SearXNG • Privacy Search';
    } else if (provider === 'in-island') {
      labelEl.textContent = 'In-Island Quick Answers & Web Results';
    } else {
      labelEl.textContent = 'DuckDuckGo • Instant Answers';
    }
  }
}
window.updateSearchEngineLabel = updateSearchEngineLabel;

let searchDebounce = null;
let searchSequence = 0;

window.handleWebSearchInput = function(query) {
  const currentSeq = ++searchSequence;
  if (searchDebounce) {
    clearTimeout(searchDebounce);
    searchDebounce = null;
  }

  const q = (query || '').trim();
  const clearBtn = document.getElementById('web-search-clear-btn');
  const list = document.getElementById('search-results-list');

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !q);
  }

  // Instantly clear results when input is emptied (e.g. backspaced/deleted)
  if (!q) {
    resetSearchResultsList();
    return;
  }

  // 1. Instant math calculation (safe arithmetic)
  if (/^[0-9+\-*/().%\s^]+$/.test(q) && /[0-9]/.test(q)) {
    try {
      const sanitized = q.replace(/\^/g, '**');
      const val = Function(`'use strict'; return (${sanitized})`)();
      if (typeof val === 'number' && !isNaN(val)) {
        if (list) {
          list.innerHTML = `
            <div class="bg-white/5 p-3 radius-card border border-white/5 space-y-1">
              <div class="text-[10px] text-zinc-400 uppercase tracking-wide">Instant Math Calculation</div>
              <div class="text-white text-base font-mono font-semibold">${escapeHtml(q)} = ${val}</div>
            </div>
          `;
        }
        return;
      }
    } catch (e) {}
  }

  // 2. Minimum query length check (prevent firing on single random keystrokes)
  if (q.length < 2) {
    if (list) {
      list.innerHTML = `
        <div id="search-empty-state" class="py-12 text-center text-zinc-500 text-xs">
          Type to search websites (e.g. Wikipedia, GitHub, Apple)...
        </div>
      `;
    }
    return;
  }

  // 3. Debounced real web search returning top 4 verified cards (280ms delay)
  searchDebounce = setTimeout(async () => {
    if (currentSeq !== searchSequence) return;
    if (list) {
      list.innerHTML = `
        <div class="py-8 text-center text-zinc-400 text-xs flex items-center justify-center space-x-2">
          <svg class="w-3.5 h-3.5 animate-spin text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>Searching for "${escapeHtml(q)}"...</span>
        </div>
      `;
    }

    try {
      const results = await searchWebResultsNative(q);
      // Ensure results are discarded if user typed or deleted while request was in-flight
      if (currentSeq !== searchSequence) return;

      if (results && results.length > 0) {
        const cardsHtml = results.slice(0, 4).map(item => {
          let domain = item.url;
          try {
            const u = new URL(item.url);
            domain = u.hostname.replace(/^www\./, '');
          } catch (e) {}

          return `
            <div class="bg-white/[0.03] hover:bg-white/[0.08] p-2.5 radius-card border border-white/10 hover:border-white/20 transition cursor-pointer group"
                 data-search-url="${escapeHtml(item.url)}"
                 onclick="handleOpenSearchResult('${escapeHtml(item.url)}', event)">
              <div class="flex items-center justify-between space-x-1.5 mb-1">
                <div class="flex items-center space-x-1.5 min-w-0">
                  <span class="text-[9px] px-1.5 py-0.2 radius-btn bg-white/5 border border-white/10 text-emerald-400 font-mono truncate">${escapeHtml(domain)}</span>
                  <span class="text-[10px] text-zinc-500 font-mono truncate max-w-[360px]">${escapeHtml(item.url)}</span>
                </div>
                <svg class="w-3 h-3 text-zinc-500 group-hover:text-white transition shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>
              <div class="font-medium text-white text-xs group-hover:underline mb-1">${escapeHtml(item.title)}</div>
              <div class="text-zinc-400 text-[11px] leading-relaxed line-clamp-2">${escapeHtml(item.snippet)}</div>
            </div>
          `;
        }).join('');

        list.innerHTML = `
          ${cardsHtml}
          <div class="pt-1.5 pb-0.5 text-center text-zinc-500 text-[10px] flex items-center justify-center space-x-1">
            <span>Press</span>
            <kbd class="px-1 py-0.2 bg-white/5 border border-white/10 rounded font-mono text-[9px] text-zinc-400">Enter</kbd>
            <span>to search on Google in browser</span>
          </div>
        `;
      } else {
        list.innerHTML = `
          <div class="bg-white/5 p-3 radius-card border border-white/5 space-y-2">
            <div class="font-medium text-white text-xs">Search for "${escapeHtml(q)}"</div>
            <p class="text-zinc-400 text-xs">Press Enter to launch in default browser.</p>
            <button onclick="handleLaunchWebSearch(event)"
                    class="px-2.5 py-1 radius-btn bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-medium flex items-center space-x-1.5 transition">
              <span>Open in Browser</span>
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
          </div>
        `;
      }
    } catch (e) {
      if (currentSeq !== searchSequence) return;
      if (list) {
        list.innerHTML = `
          <div class="py-6 text-center text-zinc-400 text-xs">
            Press Enter to open search in browser.
          </div>
        `;
      }
    }
  }, 200);
};

window.clearSearchInput = function(e) {
  if (e) e.stopPropagation();
  searchSequence++;
  if (searchDebounce) {
    clearTimeout(searchDebounce);
    searchDebounce = null;
  }
  const input = document.getElementById('web-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('web-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  resetSearchResultsList();
};

function resetSearchResultsList() {
  const list = document.getElementById('search-results-list');
  if (list) {
    list.innerHTML = `
      <div id="search-empty-state" class="py-12 text-center text-zinc-500 text-xs">
        Type a query to search or enter a math formula (e.g. 24 * 7).
      </div>
    `;
  }
}

window.handleWebSearchSubmit = function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('web-search-input');
  const q = input?.value.trim();
  if (!q) return;

  // If there's an active top result in the list, open it directly!
  const list = document.getElementById('search-results-list');
  const firstCard = list?.querySelector('[data-search-url]');
  if (firstCard && firstCard.dataset.searchUrl) {
    window.handleOpenSearchResult(firstCard.dataset.searchUrl, e);
    return;
  }

  window.handleLaunchWebSearch(e);
};

window.handleLaunchWebSearch = function(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('web-search-input');
  const q = input?.value.trim();
  if (!q) return;

  const provider = document.getElementById('settings-search-provider')?.value || 'google';
  let url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  if (provider === 'duckduckgo') {
    url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  } else if (provider === 'searxng') {
    url = `https://searx.be/search?q=${encodeURIComponent(q)}`;
  }

  window.handleOpenSearchResult(url, e);
};

// --------------------------------------------------------
// Notes with Continuous Autosave & PC Folder Export
// --------------------------------------------------------
function initNotes() {
  const saved = safeStorage.getItem('island_notes_list');
  if (saved) {
    try {
      state.notes = JSON.parse(saved);
    } catch (e) { state.notes = []; }
  }
  if (!state.notes || state.notes.length === 0) {
    state.notes = [
      { id: '1', title: 'Quick Notes', body: 'Autosave is active.\nCtrl+S exports directly to local folder.', date: 'Today' }
    ];
  }
  state.currentNoteId = state.notes[0].id;
  renderNotesList();
  loadCurrentNote();
}

function renderNotesList() {
  notesHistoryList.innerHTML = '';
  state.notes.forEach(note => {
    const item = document.createElement('div');
    const isActive = note.id === state.currentNoteId;
    item.dataset.noteId = note.id;
    item.className = `p-1.5 radius-btn cursor-pointer transition truncate flex items-center justify-between group border ${
      isActive
        ? 'border-white/25 bg-white/[0.04] text-white font-medium shadow-sm'
        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] hover:border-white/10'
    }`;
    item.innerHTML = `
      <div class="note-title-text truncate text-[11px] flex-1">${escapeHtml(note.title || 'Untitled')}</div>
      <button class="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 transition shrink-0 ml-1 flex items-center justify-center">
        <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      state.currentNoteId = note.id;
      loadCurrentNote();
      renderNotesList();
    };
    const delBtn = item.querySelector('button');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      window.deleteNote(note.id, e);
    };
    notesHistoryList.appendChild(item);
  });
}

function updateSidebarNoteTitle(id, newTitle) {
  const item = notesHistoryList.querySelector(`[data-note-id="${id}"] .note-title-text`);
  if (item) {
    item.textContent = newTitle || 'Untitled';
  }
}

window.deleteNote = function(id, e) {
  if (e) e.stopPropagation();
  if (state.notes.length <= 1) {
    state.notes = [{ id: String(Date.now()), title: 'New Note', body: '', date: 'Today' }];
  } else {
    state.notes = state.notes.filter(n => n.id !== id);
  }
  state.currentNoteId = state.notes[0].id;
  saveNotes();
  renderNotesList();
  loadCurrentNote();
};

function loadCurrentNote() {
  const note = state.notes.find(n => n.id === state.currentNoteId);
  if (note) {
    noteTitleInput.value = note.title;
    noteBodyInput.value = note.body;
  }
}

let _noteDebounceTimer = null;

window.handleNoteTitleInput = function(val) {
  const note = state.notes.find(n => n.id === state.currentNoteId);
  if (note) {
    note.title = val || 'Untitled Note';
    updateSidebarNoteTitle(note.id, note.title);
    flashAutosave();
    clearTimeout(_noteDebounceTimer);
    _noteDebounceTimer = setTimeout(() => {
      saveNotes();
    }, 350);
  }
};

window.handleNoteBodyInput = function(val) {
  const note = state.notes.find(n => n.id === state.currentNoteId);
  if (note) {
    note.body = val;
    if (note.title === 'New Note' || note.title === 'Untitled' || !note.title) {
      const firstLine = val.trim().split('\n')[0].slice(0, 24);
      if (firstLine && firstLine !== note.title) {
        note.title = firstLine;
        noteTitleInput.value = firstLine;
        updateSidebarNoteTitle(note.id, note.title);
      }
    }
    flashAutosave();
    clearTimeout(_noteDebounceTimer);
    _noteDebounceTimer = setTimeout(() => {
      saveNotes();
    }, 350);
  }
};

function flashAutosave() {
  if (noteAutosaveIndicator) {
    noteAutosaveIndicator.textContent = 'Saving...';
    noteAutosaveIndicator.className = 'inline-block w-14 text-right text-zinc-300 font-mono text-[10px] shrink-0';
    clearTimeout(window._saveTimer);
    window._saveTimer = setTimeout(() => {
      noteAutosaveIndicator.textContent = 'Autosaved';
      noteAutosaveIndicator.className = 'inline-block w-14 text-right text-zinc-500 font-mono text-[10px] shrink-0';
    }, 450);
  }
}

function saveNotes() {
  safeStorage.setItem('island_notes_list', JSON.stringify(state.notes));
  const current = state.notes.find(n => n.id === state.currentNoteId);
  if (current) {
    const fmt = document.getElementById('settings-notes-format')?.value || 'txt';
    saveNoteToDisk(current.id, current.title, current.body, fmt);
  }
}

window.createNewNote = function(e) {
  if (e) e.stopPropagation();
  const newNote = {
    id: String(Date.now()),
    title: 'New Note',
    body: '',
    date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  state.notes.unshift(newNote);
  state.currentNoteId = newNote.id;
  saveNotes();
  renderNotesList();
  loadCurrentNote();
  noteTitleInput.focus();
};

window.createNewNoteDirect = function(e) {
  if (e) e.stopPropagation();
  window.openTabDirect('notes');
  window.createNewNote();
};

window.exportCurrentNoteToFile = async function(e) {
  if (e) e.stopPropagation();
  const note = state.notes.find(n => n.id === state.currentNoteId);
  if (!note) return;
  saveNotes();
  const fmt = document.getElementById('settings-notes-format')?.value || 'txt';
  await saveNoteToDisk(note.id, note.title, note.body, fmt);
};

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (state.activeTab === 'notes') {
      window.exportCurrentNoteToFile();
    }
  }
});

// --------------------------------------------------------
// Real Multi-Provider AI (Modern Gemini, OpenAI, Claude, Ollama)
// --------------------------------------------------------
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

window.startNewChat = function(e) {
  if (e) e.stopPropagation();
  stopBrailleSpinner();
  if (chatStreamBox) {
    chatStreamBox.innerHTML = `
      <div class="flex items-start space-x-2 text-xs">
        <div class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
        </div>
        <div class="flex-1 text-zinc-300 leading-relaxed bg-white/5 p-2 radius-card border border-white/5">
          Ready for quick questions, translations, or code checks.
        </div>
      </div>
    `;
  }
  if (promptInput) {
    promptInput.value = '';
    promptInput.focus();
  }
};

window.handleSendPrompt = async function(e) {
  if (e) e.preventDefault();
  const text = promptInput.value.trim();
  if (!text || state.aiRunning) return;

  appendChatMessage('user', text);
  promptInput.value = '';

  const sel = document.getElementById('settings-provider-select');
  const provider = sel ? sel.value : 'ollama:local';
  const modelInput = document.getElementById('settings-model-input')?.value.trim();
  const model = modelInput || (provider === 'cloud:gemini' ? 'gemini-2.5-flash' : 'llama3.2');
  
  const aiBubble = appendChatMessage('ai', '');
  startBrailleSpinner(aiBubble, model);

  const endpoint = document.getElementById('settings-endpoint-input')?.value.trim() || 'http://localhost:11434';
  const apiKey = document.getElementById('settings-api-key')?.value.trim() || '';

  try {
    const response = await queryAiNative(provider, endpoint, model, apiKey, text);
    stopBrailleSpinner();
    if (response) {
      aiBubble.innerHTML = formatMarkdown(response);
      window.triggerAiResponseNotification();
    } else {
      aiBubble.innerHTML = `<span class="text-zinc-400">No response received.</span>`;
    }
  } catch (err) {
    stopBrailleSpinner();
    const errMsg = String(err);
    aiBubble.innerHTML = `
      <div class="text-zinc-200 space-y-1.5 p-1">
        <div class="text-red-400 font-medium flex items-center space-x-1.5">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Connection Notice</span>
        </div>
        <div class="text-[11px] text-zinc-400 leading-relaxed">${escapeHtml(errMsg)}</div>
        <div class="pt-1">
          <button onclick="openTabDirect('settings', event)"
                  class="px-2 py-1 radius-btn bg-white/10 hover:bg-white/20 text-xs text-zinc-200 transition">
            Open Settings (•••) to configure API Key or Ollama →
          </button>
        </div>
      </div>
    `;
  }
};

let spinnerInterval = null;
function startBrailleSpinner(container, modelName) {
  state.aiRunning = true;
  let frame = 0;
  spinnerInterval = setInterval(() => {
    frame = (frame + 1) % BRAILLE_FRAMES.length;
    container.innerHTML = `<span class="font-mono text-zinc-400 text-xs">${BRAILLE_FRAMES[frame]}</span> <span class="text-zinc-500 text-[11px]">${escapeHtml(modelName)}</span>`;
  }, 70);
}

function stopBrailleSpinner() {
  if (spinnerInterval) clearInterval(spinnerInterval);
  state.aiRunning = false;
}

function appendChatMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = 'flex items-start space-x-2 text-xs';
  if (role === 'user') {
    bubble.innerHTML = `
      <div class="w-4 h-4 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
        <div class="w-1.5 h-1.5 rounded-full bg-zinc-400"></div>
      </div>
      <div class="flex-1 text-zinc-200 bg-zinc-900 p-2.5 radius-card border border-white/5 leading-relaxed">${escapeHtml(text)}</div>
    `;
  } else {
    bubble.innerHTML = `
      <div class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
        <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
      </div>
      <div class="ai-content ai-markdown-body flex-1 text-zinc-300 bg-white/5 p-2.5 radius-card border border-white/5">${escapeHtml(text)}</div>
    `;
  }
  chatStreamBox.appendChild(bubble);
  chatStreamBox.scrollTop = chatStreamBox.scrollHeight;
  return bubble.querySelector('.ai-content') || bubble;
}

// --------------------------------------------------------
// Drag & Drop (Native & Webview Dual Handling)
// --------------------------------------------------------
window.handleFileDrop = function(filename) {
  state.currentDroppedFile = filename || 'document.pdf';
  const nameEl = document.getElementById('dropped-filename');
  if (nameEl) nameEl.textContent = state.currentDroppedFile;
  state.islandState = 'action-chooser';
  window.applyDimensions();
};

window.handleIslandDragOver = function(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
};

window.handleIslandDragLeave = function(e) {};

window.handleIslandDrop = function(e) {
  e.preventDefault();
  let name = 'document.pdf';
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    name = e.dataTransfer.files[0].name;
  }
  window.handleFileDrop(name);
};

window.cancelActionChooser = function(e) {
  if (e) e.stopPropagation();
  window.openTabDirect(state.activeTab);
};

window.executeFileAction = function(action, e) {
  if (e) e.stopPropagation();
  const filename = state.currentDroppedFile || 'document.pdf';

  if (action === 'ai') {
    window.openTabDirect('ai');
    promptInput.value = `Explain and audit "${filename}"`;
    handleSendPrompt(new Event('submit'));
  } else if (action === 'notes') {
    window.openTabDirect('notes');
    const note = state.notes.find(n => n.id === state.currentNoteId);
    if (note) {
      note.body += `\n- [Attached File]: ${filename}`;
      saveNotes();
      loadCurrentNote();
    }
  } else if (action === 'folder') {
    window.collapseIsland();
    window.openNotesFolder();
  } else if (action === 'share') {
    window.collapseIsland();
  }
  state.currentDroppedFile = null;
};

// Global window drag listeners for webview
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (state.islandState !== 'action-chooser') {
    state.islandState = 'drag-hover';
    window.applyDimensions();
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (!e.relatedTarget || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
    if (state.islandState === 'drag-hover') {
      window.collapseIsland();
    }
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  let name = 'document.pdf';
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    name = e.dataTransfer.files[0].name;
  }
  window.handleFileDrop(name);
});

// Tauri Native Window Drag-and-Drop Bridge
if (isTauri) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('island-drag-enter', () => {
      if (state.islandState !== 'action-chooser') {
        currentNativeCanvas = { width: 380, height: 160 };
        state.islandState = 'drag-hover';
        window.applyDimensions();
      }
    });
    listen('island-file-dropped', (event) => {
      currentNativeCanvas = { width: 480, height: 200 };
      const name = event.payload || 'document.pdf';
      window.handleFileDrop(name);
    });
    listen('island-drag-leave', () => {
      if (state.islandState === 'drag-hover') {
        window.collapseIsland();
      }
    });
  }).catch(console.warn);
}

// --------------------------------------------------------
// Settings & Modern Model Configuration
// --------------------------------------------------------
window.onSettingsProviderChange = function(e) {
  const sel = document.getElementById('settings-provider-select');
  const provider = sel.value;
  const modelInput = document.getElementById('settings-model-input');
  
  if (provider === 'cloud:gemini') {
    if (modelInput) {
      modelInput.value = 'gemini-2.5-flash';
      modelInput.placeholder = 'e.g. gemini-2.5-flash, gemini-2.5-pro';
    }
  } else if (provider === 'cloud:openai') {
    if (modelInput) {
      modelInput.value = 'gpt-4o';
      modelInput.placeholder = 'e.g. gpt-4o, gpt-4o-mini';
    }
  } else if (provider === 'cloud:anthropic') {
    if (modelInput) {
      modelInput.value = 'claude-3-7-sonnet-20250219';
      modelInput.placeholder = 'e.g. claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022';
    }
  } else if (provider === 'cloud:openrouter') {
    if (modelInput) {
      modelInput.value = 'meta-llama/llama-3.3-70b-instruct';
      modelInput.placeholder = 'e.g. meta-llama/llama-3.3-70b-instruct';
    }
  } else if (provider === 'ollama:local') {
    if (modelInput) {
      modelInput.value = 'llama3.2';
      modelInput.placeholder = 'e.g. llama3.2, mistral, deepseek-r1:8b';
    }
  } else if (provider === 'custom:local') {
    if (modelInput) {
      modelInput.placeholder = 'e.g. custom-model';
    }
  }
  
  updateActiveModelDisplay();
  saveSettings();
};

function updateActiveModelDisplay() {
  const sel = document.getElementById('settings-provider-select');
  const provValue = sel ? sel.value : 'ollama:local';
  const provText = sel ? sel.options[sel.selectedIndex]?.text : 'Local Ollama';
  const modelVal = document.getElementById('settings-model-input')?.value.trim() || '';
  const display = document.getElementById('active-model-display');
  if (display) {
    display.textContent = modelVal ? `${provText} • ${modelVal}` : provText;
  }

  // Update top-right settings badge dynamically to reflect local vs cloud API
  const badge = document.getElementById('settings-config-badge');
  if (badge) {
    if (provValue && provValue.startsWith('cloud:')) {
      badge.innerHTML = `<span class="inline-flex items-center space-x-1"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg><span>Cloud API (${escapeHtml(provText)})</span></span>`;
      badge.className = 'text-[10px] px-2 py-0.5 radius-btn bg-sky-950/60 border border-sky-400/30 text-sky-300 font-mono';
    } else {
      badge.innerHTML = `<span class="inline-flex items-center space-x-1"><svg class="w-2 h-2 fill-current" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg><span>Local AI (${escapeHtml(provText)})</span></span>`;
      badge.className = 'text-[10px] px-2 py-0.5 radius-btn bg-emerald-950/60 border border-emerald-400/30 text-emerald-300 font-mono';
    }
  }
}

function saveSettings() {
  const soulInput = document.getElementById('settings-soul-input');
  const soulVal = soulInput ? soulInput.value : '';

  const settings = {
    provider: document.getElementById('settings-provider-select')?.value,
    model: document.getElementById('settings-model-input')?.value,
    endpoint: document.getElementById('settings-endpoint-input')?.value,
    apiKey: document.getElementById('settings-api-key')?.value,
    soul: soulVal,
    searchProvider: document.getElementById('settings-search-provider')?.value,
    searchAction: document.getElementById('settings-search-action')?.value,
    notesFolder: document.getElementById('settings-notes-folder')?.value,
    notesFormat: document.getElementById('settings-notes-format')?.value || 'txt',
    soundEnabled: document.getElementById('settings-sound-enabled')?.checked ?? true,
    customSound: safeStorage.getItem('island_custom_sound') || '',
    customSoundName: safeStorage.getItem('island_custom_sound_name') || '',
    osMode: state.osMode || 'win11',
    toolsConfig: state.toolsConfig || DEFAULT_TOOLS_CONFIG,
    musicPrefs: {
      showGenreBar: state.music.prefs.showGenreBar,
      activeGenreIds: state.music.prefs.activeGenreIds,
      customGenres: state.music.prefs.customGenres
    },
    notes: state.notes || []
  };

  // 1. Save to local storage cache
  safeStorage.setItem('island_settings', JSON.stringify(settings));

  // 2. Persist to native disk (IslandNotes/settings.json and IslandNotes/assistant.soul)
  saveAppSettingsNative(settings).catch(console.warn);
  if (soulVal !== undefined) {
    saveSoulFileContentNative(soulVal).catch(console.warn);
  }

  updateActiveModelDisplay();
  updateSearchEngineLabel();

  // Visual feedback: green dot and badge
  const dot = document.getElementById('settings-saved-dot');
  if (dot) {
    dot.classList.remove('opacity-0');
    clearTimeout(window._dotTimer);
    window._dotTimer = setTimeout(() => {
      dot.classList.add('opacity-0');
    }, 1200);
  }

  const badge = document.getElementById('soul-status-badge');
  if (badge) {
    badge.textContent = 'Saved to disk';
    badge.className = 'text-emerald-400 font-mono text-[10px]';
    clearTimeout(window._soulBadgeTimer);
    window._soulBadgeTimer = setTimeout(() => {
      badge.textContent = 'Synced';
      badge.className = 'text-zinc-500 font-mono text-[10px]';
    }, 1500);
  }
}
window.saveSettings = saveSettings;

window.openSoulFile = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  await openSoulFileNative();
};

window.resetSoulPrompt = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const stock = await resetSoulFileContentNative();
  const soulInput = document.getElementById('settings-soul-input');
  if (soulInput) {
    soulInput.value = stock;
  }
  saveSettings();
};

async function loadSettings() {
  let s = null;

  // 1. Try to load native settings from disk (IslandNotes/settings.json)
  try {
    const nativeSettings = await loadAppSettingsNative();
    if (nativeSettings && typeof nativeSettings === 'object' && Object.keys(nativeSettings).length > 0) {
      s = nativeSettings;
    }
  } catch (e) {
    console.warn('Native settings load failed:', e);
  }

  // 2. Fall back to local storage if disk had no settings yet
  if (!s) {
    const saved = safeStorage.getItem('island_settings');
    if (saved) {
      try {
        s = JSON.parse(saved);
      } catch (e) {}
    }
  }

  // 3. Apply settings to form inputs
  if (s) {
    try {
      if (s.provider && document.getElementById('settings-provider-select')) {
        document.getElementById('settings-provider-select').value = s.provider;
      }
      if (s.model && document.getElementById('settings-model-input')) {
        document.getElementById('settings-model-input').value = s.model;
      }
      if (s.endpoint && document.getElementById('settings-endpoint-input')) {
        document.getElementById('settings-endpoint-input').value = s.endpoint;
      }
      if (s.apiKey && document.getElementById('settings-api-key')) {
        document.getElementById('settings-api-key').value = s.apiKey;
      }
      if (s.searchProvider && document.getElementById('settings-search-provider')) {
        document.getElementById('settings-search-provider').value = s.searchProvider;
      }
      if (s.searchAction && document.getElementById('settings-search-action')) {
        document.getElementById('settings-search-action').value = s.searchAction;
      }
      if (s.notesFolder && document.getElementById('settings-notes-folder')) {
        document.getElementById('settings-notes-folder').value = s.notesFolder;
      }
      if (s.notesFormat && document.getElementById('settings-notes-format')) {
        document.getElementById('settings-notes-format').value = s.notesFormat;
      }
      if (typeof s.soundEnabled === 'boolean' && document.getElementById('settings-sound-enabled')) {
        document.getElementById('settings-sound-enabled').checked = s.soundEnabled;
      }
      if (s.customSound) {
        safeStorage.setItem('island_custom_sound', s.customSound);
      }
      if (s.customSoundName) {
        safeStorage.setItem('island_custom_sound_name', s.customSoundName);
      }
      if (s.osMode && window.setOSMode) {
        window.setOSMode(s.osMode);
      }
      if (Array.isArray(s.toolsConfig) && s.toolsConfig.length > 0) {
        // Merge saved order & visibility with default metadata so any new tools are included
        const merged = [];
        s.toolsConfig.forEach(savedTool => {
          const def = DEFAULT_TOOLS_CONFIG.find(d => d.id === savedTool.id);
          if (def) {
            merged.push({
              ...def,
              enabled: typeof savedTool.enabled === 'boolean' ? savedTool.enabled : true
            });
          }
        });
        DEFAULT_TOOLS_CONFIG.forEach(def => {
          if (!merged.some(m => m.id === def.id)) {
            merged.push({ ...def });
          }
        });
        if (!merged.some(m => m.enabled)) {
          merged[0].enabled = true;
        }
        state.toolsConfig = merged;
      }
      if (s.musicPrefs && typeof s.musicPrefs === 'object') {
        if (typeof s.musicPrefs.showGenreBar === 'boolean') {
          state.music.prefs.showGenreBar = s.musicPrefs.showGenreBar;
        }
        if (Array.isArray(s.musicPrefs.activeGenreIds)) {
          state.music.prefs.activeGenreIds = s.musicPrefs.activeGenreIds;
        }
        if (Array.isArray(s.musicPrefs.customGenres)) {
          state.music.prefs.customGenres = s.musicPrefs.customGenres;
        }
      }
      if (Array.isArray(s.notes) && s.notes.length > 0 && (!state.notes || state.notes.length === 0)) {
        state.notes = s.notes;
        safeStorage.setItem('island_notes_list', JSON.stringify(state.notes));
        renderNotesList();
      }
    } catch (e) {
      console.warn('Error applying loaded settings:', e);
    }
  }

  // 4. Load soul personality from IslandNotes/assistant.soul
  try {
    const soulContent = await getSoulFileContentNative();
    const soulInput = document.getElementById('settings-soul-input');
    if (soulInput) {
      if (soulContent && soulContent.trim()) {
        soulInput.value = soulContent;
      } else if (s && s.soul && s.soul.trim()) {
        soulInput.value = s.soul;
      } else {
        soulInput.value = "you are a good AI assistant, respond briefly dont waste too much tokens";
      }
    }
  } catch (e) {
    console.warn('Failed to load soul file content:', e);
  }

  if (window.applyIslandToolsLayout) window.applyIslandToolsLayout();
  if (window.renderYouTubePersonalGenres) window.renderYouTubePersonalGenres();
  updateActiveModelDisplay();
  updateSoundSettingsUI();
  updateSearchEngineLabel();
}
window.loadSettings = loadSettings;
window.addEventListener('beforeunload', () => {
  saveSettings();
});

// --------------------------------------------------------
// Audio & Visual Notifications (AI Completion)
// --------------------------------------------------------
window.triggerAiResponseNotification = function() {
  const island = document.getElementById('dynamic-island');
  if (island) {
    island.classList.remove('island-notify-pulse');
    void island.offsetWidth;
    island.classList.add('island-notify-pulse');
    setTimeout(() => {
      island.classList.remove('island-notify-pulse');
    }, 550);
  }
  window.playNotificationSound();
  window.showNotifyLed();
};

window.showNotifyLed = function() {
  // If user is currently actively viewing the expanded AI tab, no need to show the LED dot
  const isViewingAiTab = state.islandState === 'expanded' && state.activeTab === 'ai';
  if (isViewingAiTab) return;

  const idleLed = document.getElementById('idle-notify-led');
  const peekLed = document.getElementById('peek-notify-led');
  const tabLed = document.getElementById('tab-notify-led');
  if (idleLed) idleLed.classList.remove('hidden');
  if (peekLed) peekLed.classList.remove('hidden');
  if (tabLed) tabLed.classList.remove('hidden');
};

window.clearNotifyLed = function() {
  const idleLed = document.getElementById('idle-notify-led');
  const peekLed = document.getElementById('peek-notify-led');
  const tabLed = document.getElementById('tab-notify-led');
  if (idleLed) idleLed.classList.add('hidden');
  if (peekLed) peekLed.classList.add('hidden');
  if (tabLed) tabLed.classList.add('hidden');
};

window.playDefaultChime = function() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Harmonic warm double-chime: D5 (587.33Hz) -> A5 (880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);
    gain2.gain.setValueAtTime(0.001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.56);
  } catch (e) {}
};

window.playNotificationSound = function() {
  const soundEnabled = document.getElementById('settings-sound-enabled');
  if (soundEnabled && !soundEnabled.checked) return;

  const customSound = safeStorage.getItem('island_custom_sound');
  if (customSound) {
    try {
      const audio = new Audio(customSound);
      audio.volume = 0.5;
      audio.play().catch(() => {
        window.playDefaultChime();
      });
      return;
    } catch (e) {}
  }

  window.playDefaultChime();
};

window.handleCustomSoundUpload = function(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const dataUrl = evt.target.result;
    safeStorage.setItem('island_custom_sound', dataUrl);
    safeStorage.setItem('island_custom_sound_name', file.name);
    updateSoundSettingsUI();
    saveSettings();
    window.playNotificationSound();
  };
  reader.readAsDataURL(file);
};

window.resetDefaultSound = function() {
  safeStorage.setItem('island_custom_sound', '');
  safeStorage.setItem('island_custom_sound_name', '');
  const fileInput = document.getElementById('settings-sound-file');
  if (fileInput) fileInput.value = '';
  updateSoundSettingsUI();
  saveSettings();
  window.playDefaultChime();
};

function updateSoundSettingsUI() {
  const soundName = safeStorage.getItem('island_custom_sound_name');
  const statusEl = document.getElementById('settings-sound-status');
  if (statusEl) {
    if (soundName) {
      statusEl.textContent = `Custom file: ${soundName}`;
      statusEl.className = 'text-[11px] text-emerald-400 font-mono';
    } else {
      statusEl.textContent = 'Default soft chime';
      statusEl.className = 'text-[11px] text-zinc-400';
    }
  }
}

// --------------------------------------------------------
// OS Mode Toggling
// --------------------------------------------------------
window.setOSMode = function(mode, e) {
  if (e) e.stopPropagation();
  state.osMode = mode;
  safeStorage.setItem('island_os_mode', mode);

  const winBtn = document.getElementById('modal-mode-win');
  const macBtn = document.getElementById('modal-mode-mac');

  if (winBtn && macBtn) {
    if (mode === 'win11') {
      winBtn.className = 'px-2 py-1.5 radius-btn text-xs font-medium bg-white/15 text-white transition';
      macBtn.className = 'px-2 py-1.5 radius-btn text-xs font-medium text-zinc-400 hover:text-white bg-white/5 transition';
    } else {
      macBtn.className = 'px-2 py-1.5 radius-btn text-xs font-medium bg-white/15 text-white transition';
      winBtn.className = 'px-2 py-1.5 radius-btn text-xs font-medium text-zinc-400 hover:text-white bg-white/5 transition';
    }
  }

  window.applyDimensions();
  saveSettings();
};

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.copyCodeBlock = function(btn) {
  const card = btn.closest('.ai-code-card');
  const code = card?.querySelector('code');
  if (code) {
    const text = code.innerText || code.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = 'Copy'; }, 1500);
    }).catch(() => {
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = 'Copy'; }, 1500);
    });
  }
};

function formatMarkdown(text) {
  if (!text) return '';

  // 1. Extract fenced code blocks and replace with placeholders
  const codeBlocks = [];
  let processed = text.replace(/(?:```|~~~)([a-zA-Z0-9_\-#+.]*)?[ \t]*\r?\n?([\s\S]*?)(?:```|~~~)/g, (match, lang, code) => {
    const trimmedLang = (lang || 'code').trim();
    const escapedCode = escapeHtml(code.replace(/\r\n/g, '\n').replace(/\n$/, ''));
    const placeholder = `@@@CODEBLOCK_${codeBlocks.length}@@@`;
    codeBlocks.push(`
      <div class="ai-code-card">
        <div class="ai-code-header">
          <span>${escapeHtml(trimmedLang)}</span>
          <button type="button" class="ai-code-copy-btn" onclick="copyCodeBlock(this)">Copy</button>
        </div>
        <pre class="ai-code-content"><code>${escapedCode}</code></pre>
      </div>
    `);
    return placeholder;
  });

  // 2. Escape HTML for the remaining text to prevent XSS or broken tags
  processed = escapeHtml(processed);

  // 3. Headers (h1 to h6) with optional leading whitespace
  processed = processed
    .replace(/^\s*######\s+(.*$)/gim, '<h6>$1</h6>')
    .replace(/^\s*#####\s+(.*$)/gim, '<h5>$1</h5>')
    .replace(/^\s*####\s+(.*$)/gim, '<h4>$1</h4>')
    .replace(/^\s*###\s+(.*$)/gim, '<h3>$1</h3>')
    .replace(/^\s*##\s+(.*$)/gim, '<h2>$1</h2>')
    .replace(/^\s*#\s+(.*$)/gim, '<h1>$1</h1>');

  // 4. Blockquotes (> quote)
  processed = processed.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // 5. Horizontal rules (--- or ***)
  processed = processed.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr/>');

  // 6. Bold & Italics
  processed = processed
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 7. Inline code (`code`)
  processed = processed.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

  // 8. Markdown Links [text](url)
  processed = processed.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="#" onclick="openBrowserUrlNative(\'$2\'); return false;">$1</a>');

  // 9. Lists (Unordered & Ordered)
  const lines = processed.split(/\r?\n/);
  const outLines = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^(\s*)[*+-]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);

    if (ulMatch) {
      if (!inUl) {
        if (inOl) { outLines.push('</ol>'); inOl = false; }
        outLines.push('<ul>');
        inUl = true;
      }
      outLines.push(`<li>${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (!inOl) {
        if (inUl) { outLines.push('</ul>'); inUl = false; }
        outLines.push('<ol>');
        inOl = true;
      }
      outLines.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inUl) { outLines.push('</ul>'); inUl = false; }
      if (inOl) { outLines.push('</ol>'); inOl = false; }
      outLines.push(line);
    }
  }
  if (inUl) outLines.push('</ul>');
  if (inOl) outLines.push('</ol>');

  processed = outLines.join('\n');

  // 10. Paragraph breaks & Line breaks (outside code blocks)
  processed = processed
    .replace(/\n{2,}/g, '<p class="my-1.5"></p>')
    .replace(/\n/g, '<br/>');

  // 11. Restore Code Blocks
  codeBlocks.forEach((block, idx) => {
    processed = processed.replace(`@@@CODEBLOCK_${idx}@@@`, block);
  });

  return processed;
}

window.addEventListener('keydown', (e) => {
  if ((e.altKey && e.code === 'Space') || (e.ctrlKey && e.code === 'Space')) {
    e.preventDefault();
    window.toggleIsland();
  } else if (e.code === 'Escape' && state.islandState !== 'idle') {
    window.collapseIsland();
  }
});

window.openNotesFolder = async function(e) {
  if (e) e.stopPropagation();
  await openNotesFolderNative();
};

window.exitApplication = async function(e) {
  if (e) e.stopPropagation();
  await exitAppNative();
};

// --------------------------------------------------------
// YouTube & Music Player (Monochrome SVG S25 Ultra / iPhone Mode)
// --------------------------------------------------------
let ytSearchDebounce = null;
let ytSearchSequence = 0;

const YT_SPINNER_SVG = `<svg class="w-3.5 h-3.5 animate-spin text-zinc-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const YT_TAG_SVG = `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>`;
const YT_CHECK_SVG = `<svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const YT_PLUS_SVG = `<svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const YT_CLOSE_SVG = `<svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const YT_PLAY_SOLID_SVG = `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
const YT_PAUSE_SOLID_SVG = `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
const YT_VOL_ON_SVG = `<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const YT_VOL_MUTE_SVG = `<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

const PRESET_YT_GENRES = [
  {
    id: 'dnb',
    label: 'D&B',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="15" x2="6" y2="9"/><line x1="10" y1="19" x2="10" y2="5"/><line x1="14" y1="16" x2="14" y2="8"/><line x1="18" y1="18" x2="18" y2="6"/></svg>`,
    query: 'Drum and Bass music mix playlist'
  },
  {
    id: 'classic',
    label: 'Classic',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    query: 'Classical music masterpieces'
  },
  {
    id: 'epic',
    label: 'Epic',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`,
    query: 'Epic orchestral music mix'
  },
  {
    id: 'anime',
    label: 'Anime',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5c4 1 12 1 16 0"/><path d="M6 9h12"/><path d="M8 5v14"/><path d="M16 5v14"/><path d="M12 5v4"/></svg>`,
    query: 'Anime OST best music mix'
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="8" x2="7" y2="8"/><line x1="2" y1="16" x2="7" y2="16"/><line x1="17" y1="8" x2="22" y2="8"/><line x1="17" y1="16" x2="22" y2="16"/></svg>`,
    query: 'Movie soundtracks epic scores'
  },
  {
    id: 'lofi',
    label: 'Lofi',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
    query: 'Lofi hip hop chill beats'
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15a5 5 0 0 1 10 0"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="5" y1="19" x2="19" y2="19"/><path d="M12 4v3"/><path d="M5.6 7.6 7.5 9.5"/><path d="M18.4 7.6 16.5 9.5"/></svg>`,
    query: 'Synthwave retro chill music'
  },
  {
    id: 'phonk',
    label: 'Phonk',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    query: 'Chill phonk music mix'
  },
  {
    id: 'rock',
    label: 'Rock',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 12 5 12 8 4 12 20 15 9 18 15 20 12 22 12"/></svg>`,
    query: 'Rock classics & alternative mix'
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="4"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="0.8" fill="currentColor"/><circle cx="17.5" cy="11" r="0.8" fill="currentColor"/></svg>`,
    query: 'Gaming soundtrack OST mix'
  },
  {
    id: 'jazz',
    label: 'Jazz',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 6a6 6 0 0 1 6 6"/></svg>`,
    query: 'Smooth relaxing jazz music'
  },
  {
    id: 'ambient',
    label: 'Ambient',
    icon: `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`,
    query: 'Deep space ambient focus music'
  }
];

window.renderYouTubePersonalGenres = function() {
  const prefs = state.music.prefs;
  const row = document.getElementById('yt-genres-row');
  const ytCheck = document.getElementById('yt-show-genres-checkbox');
  const settingsCheck = document.getElementById('settings-yt-show-genres');

  if (ytCheck) ytCheck.checked = Boolean(prefs.showGenreBar);
  if (settingsCheck) settingsCheck.checked = Boolean(prefs.showGenreBar);

  // 1. Render active genre pills in the YouTube tab top bar (100% Monochrome SVG)
  if (row) {
    row.classList.toggle('hidden', !prefs.showGenreBar);

    const activePresets = PRESET_YT_GENRES.filter(g => prefs.activeGenreIds.includes(g.id));
    const allActivePills = [
      ...activePresets,
      ...(prefs.customGenres || []).map(c => ({
        id: c.id,
        label: c.label,
        icon: YT_TAG_SVG,
        query: c.query || c.label,
        isCustom: true
      }))
    ];

    const pillsHtml = allActivePills.map(g => {
      const isSelected = prefs.activeGenreFilter === g.id;
      const safeLabel = escapeHtml(g.label).replace(/'/g, '&#39;');
      const safeQuery = escapeHtml(g.query).replace(/'/g, '&#39;');
      return `
        <button type="button"
                onclick="selectYouTubeGenrePill('${escapeHtml(g.id)}', '${safeLabel}', '${safeQuery}', event)"
                class="px-2.5 py-0.5 radius-btn border text-[10px] whitespace-nowrap transition flex items-center space-x-1.5 ${
                  isSelected
                    ? 'bg-white/15 border-white/35 text-white font-medium'
                    : 'bg-white/[0.04] hover:bg-white/10 border-white/10 text-zinc-400 hover:text-white'
                }">
          ${g.icon}
          <span>${escapeHtml(g.label)}</span>
        </button>
      `;
    }).join('');

    const customizeBtnHtml = `
      <button type="button"
              onclick="toggleYouTubeGenreCustomizer(event)"
              class="px-2 py-0.5 radius-btn bg-white/[0.02] hover:bg-white/10 border border-dashed border-white/15 hover:border-white/30 text-[10px] text-zinc-400 hover:text-white whitespace-nowrap transition flex items-center space-x-1">
        ${YT_PLUS_SVG}
        <span>Genres</span>
      </button>
    `;

    row.innerHTML = pillsHtml + customizeBtnHtml;
  }

  // 2. Render genre selector grids (both inside YouTube inline drawer & inside Settings)
  const renderGridHtml = () => {
    const presetHtml = PRESET_YT_GENRES.map(g => {
      const active = prefs.activeGenreIds.includes(g.id);
      return `
        <button type="button"
                onclick="togglePresetYouTubeGenre('${g.id}', event)"
                class="px-2 py-0.5 radius-btn border text-[10px] transition flex items-center space-x-1 ${
                  active
                    ? 'bg-white/15 border-white/35 text-white font-medium'
                    : 'bg-zinc-900 hover:bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'
                }">
          ${g.icon}
          <span>${escapeHtml(g.label)}</span>
          <span class="ml-0.5 opacity-80">${active ? YT_CHECK_SVG : YT_PLUS_SVG}</span>
        </button>
      `;
    }).join('');

    const customHtml = (prefs.customGenres || []).map(c => {
      return `
        <div class="inline-flex items-center space-x-1 px-2 py-0.5 radius-btn bg-white/15 border border-white/30 text-white text-[10px]">
          ${YT_TAG_SVG}
          <span>${escapeHtml(c.label)}</span>
          <button type="button"
                  onclick="removeCustomYouTubeGenre('${escapeHtml(c.id)}', event)"
                  title="Remove custom genre"
                  class="hover:text-white text-zinc-300 pl-0.5 flex items-center justify-center">
            ${YT_CLOSE_SVG}
          </button>
        </div>
      `;
    }).join('');

    return presetHtml + customHtml;
  };

  const gridHtml = renderGridHtml();
  const ytGrid = document.getElementById('yt-preset-genres-grid');
  if (ytGrid) ytGrid.innerHTML = gridHtml;
  const settingsGrid = document.getElementById('settings-yt-genres-grid');
  if (settingsGrid) settingsGrid.innerHTML = gridHtml;
};

window.toggleYouTubeGenreCustomizer = function(e) {
  if (e) e.stopPropagation();
  const drawer = document.getElementById('yt-genre-customizer');
  const gearBtn = document.getElementById('yt-genre-gear-btn');
  if (!drawer) return;
  const isHidden = drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', !isHidden);
  if (gearBtn) {
    gearBtn.classList.toggle('text-white', isHidden);
    gearBtn.classList.toggle('bg-white/15', isHidden);
  }
  window.renderYouTubePersonalGenres();
  if (window.syncYouTubePlayerOverlay) {
    setTimeout(() => window.syncYouTubePlayerOverlay(), 30);
  }
};

window.toggleShowGenreBar = function(checked, e) {
  if (e) e.stopPropagation();
  state.music.prefs.showGenreBar = Boolean(checked);
  window.renderYouTubePersonalGenres();
  saveSettings();
  if (window.syncYouTubePlayerOverlay) {
    setTimeout(() => window.syncYouTubePlayerOverlay(), 30);
  }
};

window.togglePresetYouTubeGenre = function(genreId, e) {
  if (e) e.stopPropagation();
  const list = state.music.prefs.activeGenreIds;
  const idx = list.indexOf(genreId);
  if (idx !== -1) {
    list.splice(idx, 1);
    if (state.music.prefs.activeGenreFilter === genreId) {
      state.music.prefs.activeGenreFilter = '';
    }
  } else {
    list.push(genreId);
  }
  window.renderYouTubePersonalGenres();
  saveSettings();
};

window.addCustomYouTubeGenre = function(e) {
  if (e) e.stopPropagation();
  const labelInput = document.getElementById('yt-custom-genre-label');
  const queryInput = document.getElementById('yt-custom-genre-query');
  const label = (labelInput?.value || '').trim();
  const query = (queryInput?.value || '').trim();
  if (!label) return;

  state.music.prefs.customGenres.push({
    id: `custom_${Date.now()}`,
    label,
    query: query || `${label} music mix`
  });

  if (labelInput) labelInput.value = '';
  if (queryInput) queryInput.value = '';

  window.renderYouTubePersonalGenres();
  saveSettings();
};

window.addCustomYouTubeGenreFromSettings = function(e) {
  if (e) e.stopPropagation();
  const labelInput = document.getElementById('settings-yt-custom-label');
  const queryInput = document.getElementById('settings-yt-custom-query');
  const label = (labelInput?.value || '').trim();
  const query = (queryInput?.value || '').trim();
  if (!label) return;

  state.music.prefs.customGenres.push({
    id: `custom_${Date.now()}`,
    label,
    query: query || `${label} music mix`
  });

  if (labelInput) labelInput.value = '';
  if (queryInput) queryInput.value = '';

  window.renderYouTubePersonalGenres();
  saveSettings();
};

window.removeCustomYouTubeGenre = function(customId, e) {
  if (e) e.stopPropagation();
  state.music.prefs.customGenres = (state.music.prefs.customGenres || []).filter(c => c.id !== customId);
  if (state.music.prefs.activeGenreFilter === customId) {
    state.music.prefs.activeGenreFilter = '';
  }
  window.renderYouTubePersonalGenres();
  saveSettings();
};

window.selectYouTubeGenrePill = async function(genreId, label, query, e) {
  if (e) e.stopPropagation();

  // Clicking the active genre pill again deselects it and returns to personal view
  if (state.music.prefs.activeGenreFilter === genreId) {
    state.music.prefs.activeGenreFilter = '';
    window.renderYouTubePersonalGenres();
    renderDefaultYouTubeList();
    return;
  }

  state.music.prefs.activeGenreFilter = genreId;
  window.renderYouTubePersonalGenres();

  // If the custom pill has a direct YouTube video link, play it directly!
  const directVid = extractYouTubeVideoId(query);
  if (directVid) {
    window.playYouTubeTrack(directVid, label, 'Custom Station', e);
    return;
  }

  const currentSeq = ++ytSearchSequence;
  const list = document.getElementById('yt-results-list');
  if (list) {
    list.innerHTML = `
      <div class="py-8 text-center text-zinc-400 text-xs flex items-center justify-center space-x-2">
        ${YT_SPINNER_SVG}
        <span>Loading ${escapeHtml(label)}...</span>
      </div>
    `;
  }

  try {
    const results = await searchYouTubeVideosNative(query);
    if (currentSeq !== ytSearchSequence) return;
    renderYouTubeVideoCards(results, `Genre • ${label}`);
  } catch (err) {
    if (currentSeq !== ytSearchSequence) return;
    renderDefaultYouTubeList();
  }
};

window.removeRecentYouTubeTrack = function(videoId, e) {
  if (e) e.stopPropagation();
  state.music.recentTracks = (state.music.recentTracks || []).filter(t => t.video_id !== videoId);
  safeStorage.setItem('island_yt_recent', JSON.stringify(state.music.recentTracks));
  renderDefaultYouTubeList();
};

window.clearYouTubeRecentHistory = function(e) {
  if (e) e.stopPropagation();
  state.music.recentTracks = [];
  safeStorage.setItem('island_yt_recent', '[]');
  renderDefaultYouTubeList();
};

function extractYouTubeVideoId(input) {
  if (!input) return null;
  const s = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const pat of patterns) {
    const m = s.match(pat);
    if (m && m[1]) return m[1];
  }
  return null;
}

function sendYouTubeCommand(func, args = []) {
  const iframe = document.getElementById('yt-player-iframe');
  if (iframe && iframe.contentWindow) {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*'
      );
    } catch (e) {}
  }
}

window.syncYouTubePlayerOverlay = function() {
  const host = document.getElementById('yt-player-host');
  const slot = document.getElementById('yt-video-slot');
  if (!host) return;

  const shouldShowInline =
    state.islandState === 'expanded' &&
    state.activeTab === 'music' &&
    Boolean(state.music && state.music.videoId) &&
    !isCollapsing &&
    !isExpandedMorphing;

  if (!shouldShowInline || !slot) {
    host.classList.add('yt-offscreen-keepalive');
    return;
  }

  requestAnimationFrame(() => {
    if (
      state.islandState !== 'expanded' ||
      state.activeTab !== 'music' ||
      !state.music?.videoId ||
      isCollapsing ||
      isExpandedMorphing
    ) {
      host.classList.add('yt-offscreen-keepalive');
      return;
    }
    const islandRect = island.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    if (slotRect.width > 10 && slotRect.height > 10) {
      host.classList.remove('yt-offscreen-keepalive');
      host.style.position = 'absolute';
      host.style.left = `${Math.round(slotRect.left - islandRect.left)}px`;
      host.style.top = `${Math.round(slotRect.top - islandRect.top)}px`;
      host.style.width = `${Math.round(slotRect.width)}px`;
      host.style.height = `${Math.round(slotRect.height)}px`;
      host.style.zIndex = '60';
    }
  });
};

function updateMusicUI() {
  const hasMusic = Boolean(state.music && state.music.videoId);
  const isPlaying = Boolean(hasMusic && state.music.playing);

  // 1. Idle Pill View (S25 Ultra / iPhone Dynamic Island Compact Pill)
  const idleDefault = document.getElementById('idle-default-view');
  const idleMusic = document.getElementById('idle-music-view');
  const idleThumb = document.getElementById('idle-music-thumb');
  const idleTitle = document.getElementById('idle-music-title');
  const idleEq = document.getElementById('idle-music-eq');

  if (idleDefault && idleMusic) {
    if (hasMusic) {
      idleDefault.classList.add('hidden');
      idleMusic.classList.remove('hidden');
      if (idleThumb) idleThumb.src = state.music.thumbnail;
      if (idleTitle) idleTitle.textContent = state.music.title || 'YouTube Music';
      if (idleEq) {
        idleEq.classList.toggle('eq-playing', isPlaying);
      }
    } else {
      idleMusic.classList.add('hidden');
      idleDefault.classList.remove('hidden');
    }
  }

  // 2. Peek Bar Left Controls & LED
  const peekDefaultLeft = document.getElementById('peek-default-left');
  const peekMusicLeft = document.getElementById('peek-music-left');
  const peekThumb = document.getElementById('peek-music-thumb');
  const peekTitle = document.getElementById('peek-music-title');
  const peekPlayBtn = document.getElementById('peek-play-pause-btn');
  const peekMusicLed = document.getElementById('peek-music-led');

  if (peekDefaultLeft && peekMusicLeft) {
    if (hasMusic) {
      peekDefaultLeft.classList.add('hidden');
      peekMusicLeft.classList.remove('hidden');
      if (peekThumb) peekThumb.src = state.music.thumbnail;
      if (peekTitle) peekTitle.textContent = state.music.title || 'Playing';
      if (peekPlayBtn) {
        peekPlayBtn.innerHTML = isPlaying ? YT_PAUSE_SOLID_SVG : YT_PLAY_SOLID_SVG;
      }
    } else {
      peekMusicLeft.classList.add('hidden');
      peekDefaultLeft.classList.remove('hidden');
    }
  }
  if (peekMusicLed) {
    peekMusicLed.classList.toggle('hidden', !isPlaying);
  }

  // 3. Expanded Music Tab Deck & Tab LED (Monochrome + SVGs)
  const tabMusicLed = document.getElementById('tab-music-led');
  if (tabMusicLed) {
    tabMusicLed.classList.toggle('hidden', !isPlaying);
  }

  const deck = document.getElementById('yt-now-playing-deck');
  const deckTitle = document.getElementById('yt-current-title');
  const deckChannel = document.getElementById('yt-current-channel');
  const statusPill = document.getElementById('yt-status-pill');
  const deckPlayIcon = document.getElementById('yt-deck-play-icon');
  const deckPlayLabel = document.getElementById('yt-deck-play-label');
  const deckMuteBtn = document.getElementById('yt-deck-mute-btn');

  if (deck) {
    deck.classList.toggle('hidden', !hasMusic);
  }
  if (hasMusic) {
    if (deckTitle) deckTitle.textContent = state.music.title || 'YouTube Track';
    if (deckChannel) deckChannel.textContent = state.music.channel || 'YouTube';
    if (statusPill) {
      statusPill.textContent = isPlaying ? 'PLAYING' : 'PAUSED';
      statusPill.className = isPlaying
        ? 'text-[9px] px-1.5 py-0.2 rounded-full bg-white/15 border border-white/25 text-white font-mono shrink-0'
        : 'text-[9px] px-1.5 py-0.2 rounded-full bg-zinc-900 border border-white/10 text-zinc-400 font-mono shrink-0';
    }
    if (deckPlayIcon) deckPlayIcon.innerHTML = isPlaying ? YT_PAUSE_SOLID_SVG : YT_PLAY_SOLID_SVG;
    if (deckPlayLabel) deckPlayLabel.textContent = isPlaying ? 'Pause' : 'Play';
    if (deckMuteBtn) deckMuteBtn.innerHTML = state.music.muted ? YT_VOL_MUTE_SVG : YT_VOL_ON_SVG;
  }
}

function formatMusicTime(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updateMusicTimeBarUI() {
  const curEl = document.getElementById('yt-time-current');
  const durEl = document.getElementById('yt-time-duration');
  const slider = document.getElementById('yt-seek-slider');

  const cur = state.music.currentTime || 0;
  const dur = state.music.duration || 0;

  if (curEl && !state.music.isSeeking) {
    curEl.textContent = formatMusicTime(cur);
  }
  if (durEl) {
    durEl.textContent = dur > 0 ? formatMusicTime(dur) : 'LIVE';
  }
  if (slider && !state.music.isSeeking) {
    if (dur > 0) {
      slider.max = String(Math.ceil(dur));
      slider.value = String(Math.min(cur, dur));
      slider.disabled = false;
    } else {
      slider.max = '100';
      slider.value = state.music.videoId ? '100' : '0';
      slider.disabled = true;
    }
  }
}

window.handleMusicSeekInput = function(val) {
  state.music.isSeeking = true;
  const targetSec = parseFloat(val) || 0;
  const curEl = document.getElementById('yt-time-current');
  if (curEl) {
    curEl.textContent = formatMusicTime(targetSec);
  }
};

window.handleMusicSeekCommit = function(val) {
  const targetSec = parseFloat(val) || 0;
  state.music.currentTime = targetSec;
  state.music.isSeeking = false;
  sendYouTubeCommand('seekTo', [targetSec, true]);
  updateMusicTimeBarUI();
};

function registerYouTubeBridgeHandshake() {
  const iframe = document.getElementById('yt-player-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      '*'
    );
    sendYouTubeCommand('setVolume', [state.music.volume || 80]);
  } catch (e) {}
}

window.playYouTubeTrack = function(videoId, title, channel, e) {
  if (e) e.stopPropagation();
  if (!videoId) return;

  const cleanTitle = title || 'YouTube Audio';
  const cleanChannel = channel || 'YouTube';
  const thumb = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;

  state.music.videoId = videoId;
  state.music.title = cleanTitle;
  state.music.channel = cleanChannel;
  state.music.thumbnail = thumb;
  state.music.playing = true;
  state.music.muted = false;
  state.music.currentTime = 0;
  state.music.duration = 0;
  state.music.isSeeking = false;
  updateMusicTimeBarUI();

  // Save to recent tracks history
  const existingIdx = state.music.recentTracks.findIndex(t => t.video_id === videoId);
  if (existingIdx !== -1) {
    state.music.recentTracks.splice(existingIdx, 1);
  }
  state.music.recentTracks.unshift({
    video_id: videoId,
    title: cleanTitle,
    channel: cleanChannel,
    duration: '',
    thumbnail: thumb
  });
  if (state.music.recentTracks.length > 8) {
    state.music.recentTracks = state.music.recentTracks.slice(0, 8);
  }
  safeStorage.setItem('island_yt_recent', JSON.stringify(state.music.recentTracks));

  const iframe = document.getElementById('yt-player-iframe');
  if (iframe) {
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&rel=0&modestbranding=1`;
    iframe.onload = () => {
      registerYouTubeBridgeHandshake();
      setTimeout(registerYouTubeBridgeHandshake, 400);
      setTimeout(registerYouTubeBridgeHandshake, 1200);
    };
  }

  updateMusicUI();
  window.syncYouTubePlayerOverlay();
  setTimeout(() => window.syncYouTubePlayerOverlay(), 120);

  // Refresh list highlight if search input is empty and no genre filter is active
  const searchInput = document.getElementById('yt-search-input');
  if ((!searchInput || !searchInput.value.trim()) && !state.music.prefs.activeGenreFilter) {
    renderDefaultYouTubeList();
  }
};

window.toggleMusicPlayback = function(e) {
  if (e) e.stopPropagation();
  if (!state.music || !state.music.videoId) return;

  if (state.music.playing) {
    sendYouTubeCommand('pauseVideo');
    state.music.playing = false;
  } else {
    sendYouTubeCommand('playVideo');
    state.music.playing = true;
  }
  updateMusicUI();
};

window.stopMusicPlayback = function(e) {
  if (e) e.stopPropagation();
  state.music.videoId = null;
  state.music.title = '';
  state.music.channel = '';
  state.music.thumbnail = '';
  state.music.playing = false;
  state.music.currentTime = 0;
  state.music.duration = 0;
  state.music.isSeeking = false;
  updateMusicTimeBarUI();

  const iframe = document.getElementById('yt-player-iframe');
  if (iframe) {
    iframe.src = 'about:blank';
  }

  const host = document.getElementById('yt-player-host');
  if (host) {
    host.classList.add('yt-offscreen-keepalive');
  }

  updateMusicUI();
  window.applyDimensions();
};

window.toggleMusicMute = function(e) {
  if (e) e.stopPropagation();
  if (!state.music || !state.music.videoId) return;
  if (state.music.muted) {
    sendYouTubeCommand('unMute');
    state.music.muted = false;
  } else {
    sendYouTubeCommand('mute');
    state.music.muted = true;
  }
  updateMusicUI();
};

window.handleMusicVolume = function(val) {
  const v = parseInt(val, 10) || 0;
  state.music.volume = v;
  if (v === 0) {
    state.music.muted = true;
    sendYouTubeCommand('mute');
  } else {
    if (state.music.muted) {
      state.music.muted = false;
      sendYouTubeCommand('unMute');
    }
    sendYouTubeCommand('setVolume', [v]);
  }
  updateMusicUI();
};

window.openCurrentYouTubeInBrowser = function(e) {
  if (e) e.stopPropagation();
  if (!state.music || !state.music.videoId) return;
  openBrowserUrlNative(`https://www.youtube.com/watch?v=${encodeURIComponent(state.music.videoId)}`);
};

// Listen to YouTube IFrame API state broadcasts (playback state, currentTime, duration, video metadata)
window.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'string') return;
  try {
    const data = JSON.parse(event.data);
    if (data && data.event === 'infoDelivery' && data.info && state.music.videoId) {
      if (typeof data.info.playerState === 'number') {
        if (data.info.playerState === 1) {
          state.music.playing = true;
          updateMusicUI();
        } else if (data.info.playerState === 2 || data.info.playerState === 0) {
          state.music.playing = false;
          updateMusicUI();
        }
      }
      if (typeof data.info.currentTime === 'number') {
        state.music.currentTime = data.info.currentTime;
        updateMusicTimeBarUI();
      }
      if (typeof data.info.duration === 'number' && data.info.duration > 0) {
        state.music.duration = data.info.duration;
        updateMusicTimeBarUI();
      }
      if (data.info.videoData && data.info.videoData.title) {
        if (
          state.music.title === 'YouTube Video' ||
          state.music.title === 'Direct YouTube Link'
        ) {
          state.music.title = data.info.videoData.title;
          if (data.info.videoData.author) {
            state.music.channel = data.info.videoData.author;
          }
          updateMusicUI();
        }
      }
    }
  } catch (e) {}
});

function renderYouTubeVideoCards(items, sectionLabel = '', isRecentList = false) {
  const list = document.getElementById('yt-results-list');
  if (!list) return;

  if (!items || items.length === 0) {
    list.innerHTML = `
      <div class="py-8 text-center text-zinc-500 text-xs">
        No videos found. Try another song name or paste a YouTube URL.
      </div>
    `;
    return;
  }

  const headerHtml = sectionLabel
    ? `<div class="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-medium px-1 pb-0.5">
         <span>${escapeHtml(sectionLabel)}</span>
         ${
           isRecentList
             ? `<button type="button" onclick="clearYouTubeRecentHistory(event)" class="text-[10px] text-zinc-500 hover:text-white normal-case tracking-normal transition">Clear history</button>`
             : ''
         }
       </div>`
    : '';

  const cardsHtml = items.map(item => {
    const isCurrent = state.music && state.music.videoId === item.video_id;
    const isLive = item.duration === 'LIVE';
    const safeTitle = escapeHtml(item.title).replace(/'/g, '&#39;');
    const safeChannel = escapeHtml(item.channel || 'YouTube').replace(/'/g, '&#39;');

    return `
      <div onclick="playYouTubeTrack('${escapeHtml(item.video_id)}', '${safeTitle}', '${safeChannel}', event)"
           class="flex items-center space-x-2.5 p-1.5 radius-card border transition cursor-pointer group ${
             isCurrent
               ? 'bg-white/[0.08] border-white/30'
               : 'bg-white/[0.02] hover:bg-white/[0.07] border-white/5 hover:border-white/15'
           }">
        <div class="relative w-16 h-10 rounded overflow-hidden bg-zinc-900 shrink-0 border border-white/10">
          <img src="${escapeHtml(item.thumbnail)}" alt="" class="w-full h-full object-cover" loading="lazy" />
          ${
            item.duration
              ? `<span class="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[8px] font-mono ${
                  isLive ? 'bg-white text-black font-semibold' : 'bg-black/80 text-zinc-200'
                }">${escapeHtml(item.duration)}</span>`
              : ''
          }
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate ${isCurrent ? 'text-white' : 'text-zinc-200 group-hover:text-white'}">${escapeHtml(item.title)}</div>
          <div class="text-[10px] text-zinc-400 truncate">${escapeHtml(item.channel || 'YouTube')}</div>
        </div>
        <div class="pr-1 shrink-0 flex items-center space-x-2">
          ${
            isCurrent
              ? `<span class="inline-flex items-center space-x-1.5 text-[10px] text-white font-mono">
                   <span class="eq-container eq-playing" style="height:10px;gap:1.5px;">
                     <span class="eq-bar-sm"></span>
                     <span class="eq-bar-sm"></span>
                     <span class="eq-bar-sm"></span>
                   </span>
                   <span>Playing</span>
                 </span>`
              : `<span class="text-zinc-500 group-hover:text-white transition flex items-center">${YT_PLAY_SOLID_SVG}</span>`
          }
          ${
            isRecentList
              ? `<button type="button"
                         onclick="removeRecentYouTubeTrack('${escapeHtml(item.video_id)}', event)"
                         title="Remove from history"
                         class="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-white transition flex items-center justify-center">${YT_CLOSE_SVG}</button>`
              : ''
          }
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = headerHtml + cardsHtml;
}

function renderDefaultYouTubeList() {
  const list = document.getElementById('yt-results-list');
  if (!list) return;

  const recent = state.music.recentTracks || [];
  if (recent.length > 0) {
    renderYouTubeVideoCards(recent.slice(0, 8), 'Your Recently Played', true);
    return;
  }

  // Personal, clean empty state (no forced random stations)
  list.innerHTML = `
    <div class="py-10 px-4 text-center space-y-1.5">
      <div class="text-xs font-medium text-zinc-300">Your Personal Music Island</div>
      <div class="text-[11px] text-zinc-500 leading-relaxed max-w-[380px] mx-auto">
        No random suggestions. Pick one of your personal genres above (<span class="text-zinc-400">D&amp;B, Classic, Epic, Anime, Movies...</span>), search any song, or paste a YouTube link.
      </div>
    </div>
  `;
}

window.handleYouTubeSearchInput = function(query) {
  const currentSeq = ++ytSearchSequence;
  if (ytSearchDebounce) {
    clearTimeout(ytSearchDebounce);
    ytSearchDebounce = null;
  }

  const q = (query || '').trim();
  const clearBtn = document.getElementById('yt-search-clear-btn');
  const list = document.getElementById('yt-results-list');

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !q);
  }

  // Clear genre highlight when typing a manual search
  if (q && state.music.prefs.activeGenreFilter) {
    state.music.prefs.activeGenreFilter = '';
    window.renderYouTubePersonalGenres();
  }

  if (!q) {
    renderDefaultYouTubeList();
    return;
  }

  // Check if user pasted a direct YouTube link
  const pastedId = extractYouTubeVideoId(q);
  if (pastedId) {
    renderYouTubeVideoCards(
      [
        {
          video_id: pastedId,
          title: 'Direct YouTube Link',
          channel: `Video ID: ${pastedId} • Click or press Enter to play`,
          duration: 'LINK',
          thumbnail: `https://i.ytimg.com/vi/${pastedId}/mqdefault.jpg`
        }
      ],
      'Direct YouTube Video Detected'
    );
    return;
  }

  if (q.length < 2) {
    return;
  }

  ytSearchDebounce = setTimeout(async () => {
    if (currentSeq !== ytSearchSequence) return;
    if (list) {
      list.innerHTML = `
        <div class="py-8 text-center text-zinc-400 text-xs flex items-center justify-center space-x-2">
          ${YT_SPINNER_SVG}
          <span>Searching YouTube for "${escapeHtml(q)}"...</span>
        </div>
      `;
    }

    try {
      const results = await searchYouTubeVideosNative(q);
      if (currentSeq !== ytSearchSequence) return;
      renderYouTubeVideoCards(results, `YouTube Results for "${q}"`);
    } catch (e) {
      if (currentSeq !== ytSearchSequence) return;
      renderDefaultYouTubeList();
    }
  }, 280);
};

window.handleYouTubeSearchSubmit = function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('yt-search-input');
  const q = input?.value.trim();
  if (!q) return;

  const pastedId = extractYouTubeVideoId(q);
  if (pastedId) {
    window.playYouTubeTrack(pastedId, 'Direct YouTube Link', 'YouTube', e);
    return;
  }

  window.handleYouTubeSearchInput(q);
};

window.clearYouTubeSearch = function(e) {
  if (e) e.stopPropagation();
  ytSearchSequence++;
  if (ytSearchDebounce) {
    clearTimeout(ytSearchDebounce);
    ytSearchDebounce = null;
  }
  state.music.prefs.activeGenreFilter = '';
  window.renderYouTubePersonalGenres();

  const input = document.getElementById('yt-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('yt-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderDefaultYouTubeList();
};

window.triggerQuickYouTubeSearch = function(query, e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('yt-search-input');
  if (input) {
    input.value = query;
  }
  window.handleYouTubeSearchInput(query);
};

function initMusicPlayer() {
  const savedRecent = safeStorage.getItem('island_yt_recent');
  if (savedRecent) {
    try {
      const parsed = JSON.parse(savedRecent);
      if (Array.isArray(parsed)) {
        state.music.recentTracks = parsed;
      }
    } catch (e) {}
  }
  window.renderYouTubePersonalGenres();
  renderDefaultYouTubeList();
  updateMusicUI();
}

// --------------------------------------------------------
// WhatsApp Web Tab (Zero-RAM Lazy Engine & Native WebView2 Dock)
// --------------------------------------------------------
function updateWhatsappUI() {
  const running = Boolean(state.whatsapp && state.whatsapp.running);
  const dot = document.getElementById('wa-status-dot');
  const text = document.getElementById('wa-status-text');
  const powerBtn = document.getElementById('wa-power-btn');
  const standby = document.getElementById('whatsapp-standby-view');
  const tabLed = document.getElementById('tab-whatsapp-led');
  const peekLed = document.getElementById('peek-whatsapp-led');
  const zoomSel = document.getElementById('wa-zoom-select');

  if (zoomSel && state.whatsapp.zoom) {
    zoomSel.value = Number(state.whatsapp.zoom).toFixed(2);
  }

  if (dot) {
    dot.className = running
      ? 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]'
      : 'w-2 h-2 rounded-full bg-zinc-600';
  }
  if (text) {
    text.textContent = running
      ? 'WhatsApp Engine • Active (Session Saved)'
      : 'WhatsApp Engine • Sleeping (0 MB RAM)';
    text.className = running
      ? 'text-[11px] font-medium text-emerald-300'
      : 'text-[11px] font-medium text-zinc-400';
  }
  if (powerBtn) {
    if (running) {
      powerBtn.innerHTML = `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg><span>Sleep (Free RAM)</span>`;
      powerBtn.className =
        'px-2.5 py-1 radius-btn bg-white/10 hover:bg-white/15 border border-white/20 text-zinc-200 hover:text-white text-[11px] font-medium flex items-center space-x-1.5 transition';
    } else {
      powerBtn.innerHTML = `<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg><span>Launch WhatsApp</span>`;
      powerBtn.className =
        'px-2.5 py-1 radius-btn bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium flex items-center space-x-1.5 transition';
    }
  }
  if (standby) {
    standby.classList.toggle('hidden', running);
  }
  if (tabLed) {
    tabLed.classList.toggle('hidden', !running);
  }
  if (peekLed) {
    peekLed.classList.toggle('hidden', !running);
  }
}

window.syncWhatsappOverlay = function() {
  if (!state.whatsapp || !state.whatsapp.running) {
    return;
  }

  const shouldShow =
    state.islandState === 'expanded' &&
    state.activeTab === 'whatsapp' &&
    !isCollapsing &&
    !isExpandedMorphing;

  if (!shouldShow) {
    syncWhatsappWebviewNative(false, 0, 0, 0, 0, state.whatsapp.zoom);
    return;
  }

  const slot = document.getElementById('whatsapp-slot');
  if (!slot) return;

  requestAnimationFrame(() => {
    if (
      state.islandState !== 'expanded' ||
      state.activeTab !== 'whatsapp' ||
      !state.whatsapp.running ||
      isCollapsing ||
      isExpandedMorphing
    ) {
      syncWhatsappWebviewNative(false, 0, 0, 0, 0, state.whatsapp.zoom);
      return;
    }
    const rect = slot.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50) {
      syncWhatsappWebviewNative(
        true,
        Math.round(rect.left + 2),
        Math.round(rect.top + 2),
        Math.round(rect.width - 4),
        Math.round(rect.height - 4),
        state.whatsapp.zoom || 0.72
      );
    }
  });
};

window.toggleWhatsappEngine = async function(e) {
  if (e) e.stopPropagation();
  if (state.whatsapp.running) {
    await window.stopWhatsappEngine();
  } else {
    state.whatsapp.running = true;
    updateWhatsappUI();
    window.syncWhatsappOverlay();
    setTimeout(() => window.syncWhatsappOverlay(), 140);
  }
};

window.stopWhatsappEngine = async function(e) {
  if (e) e.stopPropagation();
  state.whatsapp.running = false;
  updateWhatsappUI();
  await destroyWhatsappWebviewNative();
};

window.handleWhatsappZoomChange = function(val, e) {
  if (e) e.stopPropagation();
  const z = parseFloat(val) || 0.72;
  state.whatsapp.zoom = z;
  safeStorage.setItem('island_wa_zoom', String(z));
  if (state.whatsapp.running) {
    window.syncWhatsappOverlay();
  }
};

if (isTauri) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('whatsapp-window-blur', () => {
      setTimeout(checkAndCollapseOnBlur, 80);
    });
  }).catch(console.warn);
}

// Boot
initNotes();
initMusicPlayer();
updateWhatsappUI();
window.applyIslandToolsLayout();
setActiveStageLayer('idle');
loadSettings();
window.setOSMode(state.osMode);
