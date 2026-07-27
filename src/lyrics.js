const lyricsText = document.getElementById('lyrics-text');
const lyricsWindow = document.getElementById('lyrics-window');

let currentSongSignature = '';
let currentLyrics = [];
let activeLyricIndex = -1;
let currentPositionMs = 0;
let lastUpdateTimestamp = Date.now();
let isPlaying = false;

let activeTimeout;
let currentState = 'idle';

// Wake up on mouse move
document.documentElement.addEventListener('mouseenter', wakeUp);
document.documentElement.addEventListener('mousemove', wakeUp);

function wakeUp() {
  if (currentState === 'idle') {
    currentState = 'active';
    lyricsWindow.classList.remove('idle');
  }
  clearTimeout(activeTimeout);
  activeTimeout = setTimeout(() => {
    currentState = 'idle';
    lyricsWindow.classList.add('idle');
  }, 5000);
  
  // Tell the main window to wake up too
  window.__TAURI__.event.emit('wake-up-main');
}

document.addEventListener('DOMContentLoaded', async () => {
  wakeUp();

  await listen('media-update', (event) => {
    const info = event.payload;
    currentPositionMs = info.position_ms || 0;
    lastUpdateTimestamp = Date.now();
    isPlaying = info.is_playing;
    
    const newSignature = `${info.title}-${info.artist}`;
    if (newSignature !== currentSongSignature && info.title) {
      currentSongSignature = newSignature;
      lyricsText.textContent = "Loading lyrics...";
      currentLyrics = [];
      activeLyricIndex = -1;
      
      fetchLyrics(info.title, info.artist || "").then(lyrics => {
        if (currentSongSignature === newSignature) {
          if (typeof lyrics === 'string') {
              lyricsText.innerHTML = '';
              lyricsText.textContent = lyrics;
          } else if (Array.isArray(lyrics)) {
              renderSyncedLyrics(lyrics);
          }
        }
      });
    } else if (!info.title) {
      currentSongSignature = '';
      currentLyrics = [];
      lyricsText.textContent = "No lyrics";
    }
  });

  // Start interpolation loop
  requestAnimationFrame(animationLoop);
});

function animationLoop() {
  if (isPlaying) {
    const elapsed = Date.now() - lastUpdateTimestamp;
    const interpolatedPosition = currentPositionMs + elapsed;
    updateLyricsScroll(interpolatedPosition);
  } else {
    updateLyricsScroll(currentPositionMs);
  }
  requestAnimationFrame(animationLoop);
}

async function fetchLyrics(title, artist) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://lrclib.net/api/search?q=${query}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const track = data[0];
        if (track.syncedLyrics) {
          return parseSyncedLyrics(track.syncedLyrics);
        } else if (track.plainLyrics) {
          return track.plainLyrics;
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch lyrics:', e);
  }
  return "No lyrics";
}

function parseSyncedLyrics(lrcText) {
  const lines = lrcText.split('\n');
  const parsed = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  
  lines.forEach(line => {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const millis = parseInt(match[3]);
      const ms = millis * (match[3].length === 2 ? 10 : 1);
      const totalMs = (minutes * 60 * 1000) + (seconds * 1000) + ms;
      const text = line.replace(timeRegex, '').trim();
      parsed.push({ time: totalMs, text: text || '...' });
    }
  });
  return parsed;
}

function renderSyncedLyrics(lyricsArray) {
  const container = document.getElementById('lyrics-text');
  container.innerHTML = '';
  currentLyrics = lyricsArray;
  activeLyricIndex = -1;

  if (lyricsArray.length === 0) {
    container.textContent = "No synced lyrics";
    return;
  }

  lyricsArray.forEach((line, index) => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.textContent = line.text;
    div.id = `lyric-${index}`;
    div.setAttribute('data-tauri-drag-region', '');
    container.appendChild(div);
  });
}

function updateLyricsScroll(position) {
  if (!currentLyrics || currentLyrics.length === 0) return;
  
  let newIndex = -1;
  // Increase offset to make lyrics trigger slightly earlier for a better reading experience
  const offsetMs = position + 600; 
  
  for (let i = 0; i < currentLyrics.length; i++) {
    if (offsetMs >= currentLyrics[i].time) {
      newIndex = i;
    } else {
      break;
    }
  }
  
  if (newIndex !== activeLyricIndex && newIndex !== -1) {
    if (activeLyricIndex !== -1) {
      const oldEl = document.getElementById(`lyric-${activeLyricIndex}`);
      if (oldEl) oldEl.classList.remove('active');
    }
    
    activeLyricIndex = newIndex;
    const activeEl = document.getElementById(`lyric-${activeLyricIndex}`);
    if (activeEl) {
      activeEl.classList.add('active');
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
