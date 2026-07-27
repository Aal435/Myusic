// ===== Tauri API imports =====
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// ===== State =====
let currentState = 'idle'; // 'idle' or 'active'
let activeTimeout = null;
let settings = {};
let appWindow = null;

// ===== DOM Elements =====
const appContainer = document.getElementById('app-container');
const titleText = document.getElementById('title-text');
const albumArt = document.getElementById('album-art');
const albumPlaceholder = document.getElementById('album-placeholder');
const btnShuffle = document.getElementById('btn-shuffle');
const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnRepeat = document.getElementById('btn-repeat');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const contextMenu = document.getElementById('context-menu');

let currentSongSignature = '';

// Settings inputs
const settingTextColor = document.getElementById('setting-text-color');
const settingFontSize = document.getElementById('setting-font-size');
const settingOpacity = document.getElementById('setting-opacity');
const settingDuration = document.getElementById('setting-duration');
const fontSizeLabel = document.getElementById('font-size-label');
const opacityLabel = document.getElementById('opacity-label');
const durationLabel = document.getElementById('duration-label');
const menuQuit = document.getElementById('menu-quit');

// ===== Initialize =====
async function init() {
  appWindow = getCurrentWindow();

  // Load settings
  try {
    settings = await invoke('load_settings');
  } catch (e) {
    console.warn('Using default settings:', e);
    settings = {
      width: 500, height: 160,
      position_x: 100, position_y: 100,
      background_color: 'rgba(0,0,0,0)',
      text_color: '#ffffff',
      control_color: '#ffffff',
      font_size: 24,
      idle_opacity: 1.0,
      show_album_art: true,
      show_controls: true,
      active_duration_ms: 5000,
    };
  }

  applySettings(settings);

  applySettings(settings);

  // Get initial media info
  try {
    const info = await invoke('get_media_info');
    updateDisplay(info);
  } catch (e) {
    console.log('No media playing yet:', e);
  }

  // Listen for media updates
  await listen('media-update', (event) => {
    const info = event.payload;
    updateDisplay(info);
  });

  // Listen for song changes — show active view
  await listen('song-changed', (event) => {
    updateDisplay(event.payload);
    showActiveView();
  });

  setupEventListeners();
}

// ===== Display Update =====
function updatePlaybackControls(info) {
  // Playback state
  if (info.is_playing) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
  
  // Highlight active buttons
  if (info.shuffle_active) {
    btnShuffle.style.color = '#1ed760'; // Spotify green or custom color
  } else {
    btnShuffle.style.color = 'var(--control-color)';
  }

  if (info.repeat_mode === 'track' || info.repeat_mode === 'list') {
    btnRepeat.style.color = '#1ed760';
  } else {
    btnRepeat.style.color = 'var(--control-color)';
  }
}

function updateDisplay(info) {
  let displayTitle = info.title || 'No song playing';
  if (info.title && info.artist) {
    displayTitle = `${info.title} — ${info.artist}`;
  }
  titleText.textContent = displayTitle;

  const newSignature = `${info.title}-${info.artist}`;
  if (newSignature !== currentSongSignature) {
    currentSongSignature = newSignature;
  }

  // Album art
  if (info.album_art_base64) {
    if (albumArt.src !== info.album_art_base64) {
      albumArt.src = info.album_art_base64;
      albumArt.classList.remove('hidden');
      albumPlaceholder.classList.add('hidden');
    }
  } else {
    if (albumArt.src !== "") {
      albumArt.src = "";
      albumArt.classList.add('hidden');
      albumPlaceholder.classList.remove('hidden');
    }
  }

  // Play/pause icon
  updatePlaybackControls(info);

  // Setup scrolling for long titles
  setupScrolling(titleText, document.getElementById('active-title'));
}

function setupScrolling(textEl, containerEl) {
  // Reset
  textEl.classList.remove('scrolling');
  textEl.style.removeProperty('--scroll-duration');

  // Wait a frame for layout to settle
  requestAnimationFrame(() => {
    const textWidth = textEl.scrollWidth;
    const containerWidth = containerEl.clientWidth;

    if (textWidth > containerWidth) {
      // Duplicate the text for seamless scrolling
      const originalText = textEl.textContent.split('    ')[0]; // Get original without duplication
      textEl.textContent = originalText + '    ' + originalText;

      // Speed: roughly 50px per second
      const duration = Math.max(textWidth / 50, 5);
      textEl.style.setProperty('--scroll-duration', `${duration}s`);
      textEl.classList.add('scrolling');
    }
  });
}

// ===== State Transitions =====
function showActiveView() {
  if (activeTimeout) clearTimeout(activeTimeout);

  currentState = 'active';
  appContainer.classList.remove('idle');

  // Auto-hide after duration
  activeTimeout = setTimeout(() => {
    showIdleView();
  }, settings.active_duration_ms || 5000);
}

function showIdleView() {
  if (activeTimeout) clearTimeout(activeTimeout);

  currentState = 'idle';
  appContainer.classList.add('idle');
}

// ===== Event Listeners =====
function setupEventListeners() {
  document.documentElement.addEventListener('mouseleave', () => {
    if (currentState === 'active') {
      activeTimeout = setTimeout(() => {
        showIdleView();
      }, settings.active_duration_ms || 5000);
    }
    hideContextMenu();
  });

  document.documentElement.addEventListener('mouseenter', () => {
    showActiveView();
  });

  document.addEventListener('mousemove', () => {
    if (currentState === 'idle') {
      showActiveView();
    } else if (currentState === 'active') {
      // Reset timeout
      if (activeTimeout) clearTimeout(activeTimeout);
      activeTimeout = setTimeout(() => {
        showIdleView();
      }, settings.active_duration_ms || 5000);
    }
  });

  // Playback controls
  btnShuffle.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await invoke('send_command', { command: 'shuffle' }); } catch (e) { console.error(e); }
  });

  btnPrev.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await invoke('send_command', { command: 'previous' }); } catch (e) { console.error(e); }
  });

  btnPlay.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await invoke('send_command', { command: 'toggle' }); } catch (e) { console.error(e); }
  });

  btnNext.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await invoke('send_command', { command: 'next' }); } catch (e) { console.error(e); }
  });
  
  btnRepeat.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { await invoke('send_command', { command: 'repeat' }); } catch (e) { console.error(e); }
  });

  // Right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  // Close context menu on click outside
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Settings controls
  settingTextColor.addEventListener('input', (e) => {
    settings.text_color = e.target.value;
    settings.control_color = e.target.value;
    applySettings(settings);
    saveSettingsDebounced();
  });

  settingFontSize.addEventListener('input', (e) => {
    settings.font_size = parseInt(e.target.value);
    fontSizeLabel.textContent = `${e.target.value}px`;
    applySettings(settings);
    saveSettingsDebounced();
  });

  settingOpacity.addEventListener('input', (e) => {
    settings.idle_opacity = parseInt(e.target.value) / 100;
    opacityLabel.textContent = `${e.target.value}%`;
    applySettings(settings);
    saveSettingsDebounced();
  });

  settingDuration.addEventListener('input', (e) => {
    settings.active_duration_ms = parseInt(e.target.value) * 1000;
    durationLabel.textContent = `${e.target.value}s`;
    saveSettingsDebounced();
  });

  // Quit button
  menuQuit.addEventListener('click', async () => {
    await appWindow.close();
  });
}

// ===== Context Menu =====
function showContextMenu(x, y) {
  contextMenu.classList.remove('hidden');

  // Position menu, keeping it within bounds
  const menuRect = contextMenu.getBoundingClientRect();
  const maxX = window.innerWidth - menuRect.width - 8;
  const maxY = window.innerHeight - menuRect.height - 8;

  contextMenu.style.left = `${Math.min(x, maxX)}px`;
  contextMenu.style.top = `${Math.min(y, maxY)}px`;
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

// ===== Settings =====
function applySettings(s) {
  document.documentElement.style.setProperty('--text-color', s.text_color || '#ffffff');
  document.documentElement.style.setProperty('--control-color', s.control_color || '#ffffff');
  document.documentElement.style.setProperty('--font-size', `${s.font_size || 24}px`);
  document.documentElement.style.setProperty('--idle-opacity', s.idle_opacity ?? 1.0);

  // Sync settings inputs
  settingTextColor.value = s.text_color || '#ffffff';
  settingFontSize.value = s.font_size || 24;
  fontSizeLabel.textContent = `${s.font_size || 24}px`;
  settingOpacity.value = Math.round((s.idle_opacity ?? 1.0) * 100);
  opacityLabel.textContent = `${Math.round((s.idle_opacity ?? 1.0) * 100)}%`;
  settingDuration.value = Math.round((s.active_duration_ms || 5000) / 1000);
  durationLabel.textContent = `${Math.round((s.active_duration_ms || 5000) / 1000)}s`;
}

let saveTimeout = null;
function saveSettingsDebounced() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await invoke('save_settings', { settings });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, 500);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', init);
