const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '1kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'stats.json');
const MAX_SEEN_IDS = 5000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState() {
  return {
    totalPigs: 0,
    todayPigs: 0,
    dateKey: todayKey(),
    seenIds: [],
  };
}

function normalizeState(rawState) {
  const fallback = defaultState();
  if (!rawState || typeof rawState !== 'object') return fallback;

  const totalPigs = Number.isFinite(Number(rawState.totalPigs)) ? Number(rawState.totalPigs) : 0;
  const todayPigs = Number.isFinite(Number(rawState.todayPigs)) ? Number(rawState.todayPigs) : 0;
  const dateKey = typeof rawState.dateKey === 'string' ? rawState.dateKey : fallback.dateKey;
  const seenIds = Array.isArray(rawState.seenIds)
    ? rawState.seenIds.filter((id) => typeof id === 'string' && id.length > 0).slice(-MAX_SEEN_IDS)
    : [];

  return {
    totalPigs: Math.max(0, totalPigs),
    todayPigs: Math.max(0, todayPigs),
    dateKey,
    seenIds,
  };
}

function loadState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      const initial = defaultState();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const state = normalizeState(parsed);

    if (state.dateKey !== todayKey()) {
      state.todayPigs = 0;
      state.dateKey = todayKey();
      state.seenIds = [];
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    }

    return state;
  } catch (_err) {
    const fallback = defaultState();
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    } catch (_writeErr) {
      // ignore
    }
    return fallback;
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_err) {
    // The app can keep running even if persistence fails once.
  }
}

let state = loadState();

function ensureTodayState() {
  const nowKey = todayKey();
  if (state.dateKey !== nowKey) {
    state.dateKey = nowKey;
    state.todayPigs = 0;
    state.seenIds = [];
    saveState(state);
  }
}

function dedupeAndAddIds(ids) {
  if (!Array.isArray(ids)) return [];

  const uniqueIds = [];
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) continue;
    if (state.seenIds.includes(id)) continue;
    uniqueIds.push(id);
    state.seenIds.push(id);
    if (state.seenIds.length > MAX_SEEN_IDS) {
      state.seenIds = state.seenIds.slice(-MAX_SEEN_IDS);
    }
  }
  return uniqueIds;
}

let totalPigs = state.totalPigs;
let todayPigs = state.todayPigs;

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/stats/pigs', (req, res) => {
  const { count, ids } = req.body;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'Invalid count' });
  }
  if (!Array.isArray(ids) || ids.length !== count) {
    return res.status(400).json({ error: 'Invalid request ids' });
  }

  ensureTodayState();
  const newIds = dedupeAndAddIds(ids);
  const appliedCount = newIds.length;
  if (appliedCount <= 0) {
    state.totalPigs = Number.isFinite(totalPigs) ? totalPigs : 0;
    state.todayPigs = Number.isFinite(todayPigs) ? todayPigs : 0;
    saveState(state);
    return res.json({ ok: true, totalPigs, todayPigs, deduped: true, applied: 0 });
  }

  totalPigs += appliedCount;
  todayPigs += appliedCount;
  state.totalPigs = totalPigs;
  state.todayPigs = todayPigs;
  state.dateKey = todayKey();
  saveState(state);

  return res.json({ ok: true, totalPigs, todayPigs, deduped: false, applied: appliedCount });
});

app.get('/api/stats', (req, res) => {
  ensureTodayState();
  state.totalPigs = Number.isFinite(totalPigs) ? totalPigs : 0;
  state.todayPigs = Number.isFinite(todayPigs) ? todayPigs : 0;
  saveState(state);
  res.json({ totalPigs, todayPigs });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
