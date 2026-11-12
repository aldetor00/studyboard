'use strict';
/* =========================================================================
   StudyBoard — pianificatore di studio (PWA, vanilla JS)
   Dati: locali (localStorage) + sincronizzazione opzionale con Supabase.
   ========================================================================= */

const CFG = window.STUDYBOARD_CONFIG || {};
const CLOUD_CONFIGURED = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
const LS_DATA = 'studyboard.data.v1';
const LS_UI = 'studyboard.ui.v1';

const SUBJECT_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16', '#f97316', '#64748b'];
const PRIORITY = {
  alta: { label: 'Alta', rank: 0 },
  media: { label: 'Media', rank: 1 },
  bassa: { label: 'Bassa', rank: 2 },
};
const DEADLINE_TYPES = {
  esame: { label: 'Esame', icon: 'exam' },
  consegna: { label: 'Consegna', icon: 'flag' },
  altro: { label: 'Altro', icon: 'clock' },
};
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/* ---------------------------------------------------------------- utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmtShort = (s) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const fmtLong = (d) => d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  if (!h) return `${m}m`;
  return m % 60 ? `${h}h ${pad(m % 60)}m` : `${h}h`;
}
function relDays(n) {
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------------------------------------------------------- icons */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  stats: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
  notes: '<path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M21 15h-6v6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4.5-3.5-6.5-4.5-11-2 2-3.5 4.2-3.5 6.5-1-.8-2-2-2.2-3.7C6.6 9 5 11.6 5 15c0 4 3 7 7 7z"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  pin: '<path d="M12 16v6M8 3h8l-1 6 3 4H6l3-4z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  exam: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5h7.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  clip: '<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  send: '<path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  pdf: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------------------------------------------------------------- store
   Ogni dato è un "item": { id, kind, data, deleted, updated_at }.
   kind: subject | task | deadline | session | note | timer              */
const store = {
  owner: null,       // 'local' | id utente Supabase
  items: {},
  dirty: new Set(),  // id da inviare al server
  lastPull: null,    // ISO timestamp dell'ultima ricezione dal server

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_DATA));
      if (raw) {
        this.owner = raw.owner || null;
        this.items = raw.items || {};
        this.dirty = new Set(raw.dirty || []);
        this.lastPull = raw.lastPull || null;
      }
    } catch (e) { console.warn('Dati locali non leggibili', e); }
  },
  save() {
    try {
      localStorage.setItem(LS_DATA, JSON.stringify({ owner: this.owner, items: this.items, dirty: [...this.dirty], lastPull: this.lastPull }));
    } catch (e) { toast('Impossibile salvare: spazio locale esaurito'); }
  },
  reset(owner = null) {
    this.owner = owner; this.items = {}; this.dirty = new Set(); this.lastPull = null; this.save();
  },
  all(kind) {
    return Object.values(this.items).filter((i) => i.kind === kind && !i.deleted).map((i) => ({ id: i.id, ...i.data }));
  },
  get(id) {
    const i = this.items[id];
    return i && !i.deleted ? { id, ...i.data } : null;
  },
  put(kind, id, data, opts = {}) {
    this.items[id] = { id, kind, data, deleted: false, updated_at: new Date().toISOString() };
    this.dirty.add(id);
    this.save();
    changed(opts);
  },
  patch(id, partial, opts = {}) {
    const i = this.items[id];
    if (!i || i.deleted) return;
    this.put(i.kind, id, { ...i.data, ...partial }, opts);
  },
  remove(id, opts = {}) {
    const i = this.items[id];
    if (!i) return;
    this.items[id] = { id, kind: i.kind, data: {}, deleted: true, updated_at: new Date().toISOString() };
    this.dirty.add(id);
    this.save();
    changed(opts);
  },
  /** Unisce un item ricevuto (server o backup). Vince il più recente. Ritorna true se è cambiato qualcosa. */
  merge(r, markDirty = false) {
    const local = this.items[r.id];
    const incoming = { id: r.id, kind: r.kind, data: r.data || {}, deleted: !!r.deleted, updated_at: new Date(r.updated_at).toISOString() };
    if (local && local.updated_at > incoming.updated_at) return false;
    if (local && local.updated_at === incoming.updated_at) {
      if (!markDirty) this.dirty.delete(r.id);
      return false;
    }
    this.items[r.id] = incoming;
    if (markDirty) this.dirty.add(r.id); else this.dirty.delete(r.id);
    return true;
  },
};

/* ---------------------------------------------------------------- sync */
const sync = {
  client: null,
  user: null,
  busy: false,
  again: false,
  status: 'off',
  lastOk: null,

  async run() {
    if (!this.client || !this.user) return;
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    this.busy = true;
    setSyncStatus('syncing');
    try {
      const changedAny = await this.pull();
      await this.push();
      this.lastOk = Date.now();
      setSyncStatus('ok');
      if (changedAny) render();
    } catch (e) {
      console.error('Sync fallita', e);
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; setTimeout(() => this.run(), 300); }
    }
  },

  async pull() {
    // Margine di 10 s per non perdere righe scritte "a cavallo" dell'ultima lettura.
    const since = store.lastPull ? new Date(new Date(store.lastPull).getTime() - 10000).toISOString() : '1970-01-01T00:00:00Z';
    let maxSeen = store.lastPull ? new Date(store.lastPull).getTime() : 0;
    let changedAny = false;
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from('items')
        .select('id,kind,data,deleted,updated_at,server_updated_at')
        .gt('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data) {
        if (store.merge(r)) changedAny = true;
        maxSeen = Math.max(maxSeen, new Date(r.server_updated_at).getTime());
      }
      if (data.length < PAGE) break;
    }
    if (maxSeen) store.lastPull = new Date(maxSeen).toISOString();
    store.save();
    return changedAny;
  },

  async push() {
    const ids = [...store.dirty];
    for (let k = 0; k < ids.length; k += 500) {
      const rows = ids.slice(k, k + 500).map((id) => store.items[id]).filter(Boolean).map((i) => ({
        user_id: this.user.id, id: i.id, kind: i.kind, data: i.data, deleted: !!i.deleted, updated_at: i.updated_at,
      }));
      if (!rows.length) continue;
      const { error } = await this.client.from('items').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      for (const r of rows) {
        if (store.items[r.id] && store.items[r.id].updated_at === r.updated_at) store.dirty.delete(r.id);
      }
      store.save();
    }
  },
};
const scheduleSync = debounce(() => sync.run(), 1200);

const SYNC_LABELS = { off: 'Solo su questo dispositivo', syncing: 'Sincronizzo…', ok: 'Sincronizzato', offline: 'Offline · salvo in locale', error: 'Errore di sincronizzazione' };
function setSyncStatus(s) {
  sync.status = s;
  $$('[data-sync]').forEach((el) => {
    el.className = `sync sync-${s}`;
    el.title = SYNC_LABELS[s];
    const label = el.querySelector('.sync-label');
    if (label) label.textContent = SYNC_LABELS[s];
  });
}

function changed(opts = {}) {
  if (!opts.silent) render(true);
  scheduleSync();
}

/* ---------------------------------------------------------------- domain helpers */
const subjects = () => store.all('subject').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const subjectById = (id) => (id ? store.get(id) : null);
const subjectColor = (id) => subjectById(id)?.color || 'var(--muted)';
const subjectName = (id) => subjectById(id)?.name || 'Senza materia';

function sortTasks(list) {
  return list.sort((a, b) =>
    (Number(!!a.done) - Number(!!b.done)) ||
    ((PRIORITY[a.priority] || PRIORITY.media).rank - (PRIORITY[b.priority] || PRIORITY.media).rank) ||
    (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99') ||
    ((a.createdAt || 0) - (b.createdAt || 0)));
}

/** Giorno in cui l'attività è pianificata ('' se nessuno). Il vecchio flag "today" vale come oggi. */
const taskDay = (t) => t.day || (t.today ? today() : '');
/** L'attività è nel piano di oggi: pianificata per oggi o per un giorno passato e non ancora fatta. */
const inTodayPlan = (t) => { const d = taskDay(t); return !!d && d <= today(); };

function todayTasks() {
  const t = today();
  return sortTasks(store.all('task').filter((x) => {
    const planned = inTodayPlan(x) || (x.due && x.due <= t);
    if (!x.done) return planned;
    return planned && x.completedAt && ymd(new Date(x.completedAt)) === t;
  }));
}

/** "Oggi", "Domani", oppure "gio 14 nov". */
function dayLabel(k, { long = false } = {}) {
  const n = daysBetween(today(), k);
  const d = parseYmd(k);
  const base = `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()}${long ? ' ' + MONTHS[d.getMonth()].slice(0, 3) : ''}`;
  if (n === 0) return long ? `Oggi · ${base}` : 'Oggi';
  if (n === 1) return long ? `Domani · ${base}` : 'Domani';
  return base;
}

function subjectProgress(subjectId) {
  const list = store.all('task').filter((t) => t.subjectId === subjectId);
  const done = list.filter((t) => t.done).length;
  return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

function upcomingDeadlines(limit = 6) {
  const t = today();
  return store.all('deadline').filter((d) => d.date >= t)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, limit);
}

function nextExam() {
  return upcomingDeadlines(999).find((d) => d.type === 'esame') || null;
}

function msByDay() {
  const m = {};
  for (const s of store.all('session')) m[s.date] = (m[s.date] || 0) + (s.ms || 0);
  return m;
}

function currentStreak(m = msByDay()) {
  let d = new Date();
  if (!(m[ymd(d)] >= 60000)) d = addDays(d, -1);
  let n = 0;
  while (m[ymd(d)] >= 60000) { n++; d = addDays(d, -1); }
  return n;
}

function bestStreak(m = msByDay()) {
  const days = Object.keys(m).filter((k) => m[k] >= 60000).sort();
  let best = 0; let cur = 0; let prev = null;
  for (const k of days) {
    cur = prev && daysBetween(prev, k) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = k;
  }
  return best;
}

function sumRange(m, fromYmd, toYmd) {
  let total = 0;
  for (const [k, v] of Object.entries(m)) if (k >= fromYmd && k <= toYmd) total += v;
  return total;
}

/* ---------------------------------------------------------------- timer */
const timerState = () => store.get('timer') || { state: 'idle' };
function timerElapsed(t = timerState()) {
  if (!t || t.state === 'idle') return 0;
  return (t.accumulated || 0) + (t.state === 'running' && t.startedAt ? Date.now() - t.startedAt : 0);
}
function timerStart() {
  const subjectId = ui.timerSubject && subjectById(ui.timerSubject) ? ui.timerSubject : '';
  const now = Date.now();
  store.put('timer', 'timer', { state: 'running', subjectId, sessionStart: now, startedAt: now, accumulated: 0 });
}
function timerPause() {
  const t = timerState();
  if (t.state !== 'running') return;
  store.put('timer', 'timer', { ...t, state: 'paused', accumulated: timerElapsed(t), startedAt: null });
}
function timerResume() {
  const t = timerState();
  if (t.state !== 'paused') return;
  store.put('timer', 'timer', { ...t, state: 'running', startedAt: Date.now() });
}
function timerStop() {
  const t = timerState();
  if (t.state === 'idle') return;
  const ms = timerElapsed(t);
  if (ms >= 60000) {
    store.put('session', uid(), {
      subjectId: t.subjectId || '', date: ymd(new Date(t.sessionStart)), start: t.sessionStart, end: Date.now(), ms,
    }, { silent: true });
    toast(`Sessione salvata: ${fmtDur(ms)} di studio`);
  } else {
    toast('Sessione sotto il minuto: non salvata');
  }
  store.put('timer', 'timer', { state: 'idle' });
}
function tickClocks() {
  const t = timerState();
  const ms = timerElapsed(t);
  $$('[data-clock]').forEach((el) => { el.textContent = fmtClock(ms); });
}

/* ---------------------------------------------------------------- UI state */
const ui = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_UI)) || {}; } catch { /* ignore */ }
  const now = new Date();
  return {
    showDone: false, planSubject: 'all', planMode: 'materie', timerSubject: '', filesSubject: 'all', uploadSubject: '', ...saved,
    planWeek: 0,
    chatDraft: '', chatAttachments: [],
    calMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    calSelected: today(),
    weekOffset: 0,
  };
})();
function saveUi() {
  try {
    localStorage.setItem(LS_UI, JSON.stringify({
      showDone: ui.showDone, planSubject: ui.planSubject, planMode: ui.planMode, timerSubject: ui.timerSubject, filesSubject: ui.filesSubject, uploadSubject: ui.uploadSubject,
    }));
  } catch { /* ignore */ }
}

// tab: compare nella barra in basso su telefono; le altre sono nel pannello "Altro".
const VIEWS = [
  { id: 'home', label: 'Oggi', icon: 'home', tab: true, hint: 'Piano del giorno, timer e prossimo esame' },
  { id: 'piano', label: 'Piano', icon: 'plan', tab: true, hint: 'Attività per materia o per giorno' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar', tab: true, hint: 'Esami, consegne e giorni di studio' },
  { id: 'materie', label: 'Materie', icon: 'book', tab: true, hint: 'Tutto su ogni materia in un posto' },
  { id: 'assistente', label: 'Assistente', icon: 'chat', tab: true, hint: 'Domande veloci all\'AI' },
  { id: 'libretto', label: 'Libretto', icon: 'exam', hint: 'Voti, media e CFU' },
  { id: 'materiali', label: 'Materiali', icon: 'folder', hint: 'Dispense, appunti e slide' },
  { id: 'statistiche', label: 'Statistiche', icon: 'stats', hint: 'Ore di studio e costanza' },
  { id: 'note', label: 'Note', icon: 'notes', hint: 'Appunti veloci' },
  { id: 'impostazioni', label: 'Impostazioni', icon: 'settings', hint: 'Account, chiave AI, backup' },
];
/** L'indirizzo è "#vista" oppure "#vista/parametro" (es. "#materie/<id materia>"). */
const routeParts = () => location.hash.slice(1).split('/');
const currentView = () => { const h = routeParts()[0]; return VIEWS.some((v) => v.id === h) ? h : 'home'; };
const routeArg = () => decodeURIComponent(routeParts()[1] || '');

/* ---------------------------------------------------------------- shell */
let shellReady = false;
let pendingRender = false;

function renderShell() {
  const nav = (cls) => VIEWS.filter((v) => cls === 'side' || v.tab).map((v) =>
    `<a href="#${v.id}" class="nav-item" data-nav="${v.id}">${ic(v.icon)}<span>${v.label}</span></a>`).join('');
  $('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">${ic('book')}<span>StudyBoard</span></div>
        <nav class="side-nav">${nav('side')}</nav>
        <div class="side-foot"><span data-sync class="sync"><i></i><span class="sync-label"></span></span></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-title">
            <h1 id="view-title"></h1>
            <p class="muted" id="view-date"></p>
          </div>
          <div class="topbar-right">
            <a href="#home" class="timer-chip" id="timer-chip" hidden>${ic('clock')}<span data-clock>00:00:00</span></a>
            <span data-sync class="sync only-mobile"><i></i></span>
          </div>
        </header>
        <div id="view" class="view"></div>
      </main>
      <nav class="tabbar">${nav('tab')}
        <button class="nav-item" data-action="menu-open" data-nav-more aria-label="Altre sezioni">${ic('grid')}<span>Altro</span></button>
      </nav>
      <div class="sheet-backdrop" id="sheet" hidden>
        <div class="sheet" role="dialog" aria-label="Tutte le sezioni">
          <div class="sheet-handle"></div>
          <div class="sheet-head"><b>Tutte le sezioni</b><button class="icon-btn" data-action="menu-close" aria-label="Chiudi">${ic('x')}</button></div>
          <div class="sheet-grid">
            ${VIEWS.map((v) => `<a href="#${v.id}" class="sheet-item" data-nav="${v.id}">
              <span class="sheet-ic">${ic(v.icon)}</span>
              <span class="sheet-text"><b>${v.label}</b><span>${v.hint}</span></span>
            </a>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  shellReady = true;
  setSyncStatus(sync.status);
}

function closeSheet() {
  const s = $('#sheet');
  if (!s || s.hidden) return;
  s.classList.remove('open');
  setTimeout(() => { s.hidden = true; }, 180);
}

function isEditing() {
  const a = document.activeElement;
  return a && $('#view')?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

/** Ridisegna la vista. Se l'utente sta scrivendo, rimanda finché non esce dal campo (a meno di force). */
function render(force = false) {
  if (!shellReady) return;
  if (!force && (isEditing() || $('#modal').open)) { pendingRender = true; return; }
  pendingRender = false;
  const view = currentView();
  const meta = VIEWS.find((v) => v.id === view);
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === view));
  $('[data-nav-more]')?.classList.toggle('active', !meta.tab);
  const subjDetail = view === 'materie' && routeArg() ? subjectById(routeArg()) : null;
  $('#view-title').textContent = view === 'home' ? greeting() : subjDetail ? subjDetail.name : meta.label;
  $('#view-date').textContent = cap(fmtLong(new Date()));
  const t = timerState();
  const chip = $('#timer-chip');
  chip.hidden = t.state === 'idle';
  chip.classList.toggle('paused', t.state === 'paused');

  const scrollY = window.scrollY;
  const el = $('#view');
  // Se il campo attivo ha un id (es. la casella della chat), lo rimettiamo a fuoco dopo il ridisegno.
  const active = document.activeElement;
  const keep = active && active.id && el.contains(active)
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const changedView = el.dataset.view !== view;
  el.dataset.view = view;
  el.innerHTML = VIEW_RENDERERS[view]();
  autosizeAll();
  $$('.heatmap-wrap').forEach((h) => { h.scrollLeft = h.scrollWidth; });
  tickClocks();
  if (keep) {
    const again = document.getElementById(keep.id);
    if (again) { again.focus(); try { again.setSelectionRange(keep.start, keep.end); } catch { /* ignore */ } }
  }
  if (view === 'assistente') {
    window.scrollTo(0, force || changedView ? document.body.scrollHeight : scrollY);
  } else if (!force) window.scrollTo(0, scrollY);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

/* ---------------------------------------------------------------- shared pieces */
function subjectChip(id) {
  if (!id || !subjectById(id)) return '';
  return `<span class="chip" style="--c:${esc(subjectColor(id))}"><i></i>${esc(subjectName(id))}</span>`;
}
function dueBadge(t) {
  if (!t.due) return '';
  const td = today();
  if (!t.done && t.due < td) return `<span class="badge danger">Scaduta ${fmtShort(t.due)}</span>`;
  if (t.due === td) return '<span class="badge warn">Entro oggi</span>';
  return `<span class="badge">Entro ${fmtShort(t.due)}</span>`;
}
function dayBadge(t, hideDay) {
  const d = taskDay(t);
  if (!d || d === hideDay) return '';
  const td = today();
  if (d < td && !t.done) return `<span class="badge warn">${ic('calendar', 'sm')} Rimandata dal ${fmtShort(d)}</span>`;
  if (d === td) return '';
  return `<span class="badge plan">${ic('calendar', 'sm')} ${dayLabel(d)}</span>`;
}
function taskRow(t, { showSubject = true, hideDay = null, draggable = false } = {}) {
  const inToday = inTodayPlan(t);
  return `
    <li class="task ${t.done ? 'done' : ''}" ${draggable ? `draggable="true" data-drag-task="${t.id}"` : ''}>
      <label class="checkbox" title="${t.done ? 'Segna come da fare' : 'Segna come completata'}">
        <input type="checkbox" data-change="task-toggle" data-id="${t.id}" ${t.done ? 'checked' : ''}><span></span>
      </label>
      <div class="task-main">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${showSubject ? subjectChip(t.subjectId) : ''}
          ${t.priority === 'alta' ? '<span class="badge prio">Priorità alta</span>' : ''}
          ${t.priority === 'bassa' ? '<span class="badge soft">Bassa</span>' : ''}
          ${dayBadge(t, hideDay)}
          ${dueBadge(t)}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn ${inToday ? 'on' : ''}" data-action="task-today" data-id="${t.id}" title="${inToday ? 'Togli dal piano di oggi' : 'Aggiungi al piano di oggi'}" aria-label="Piano di oggi">${ic('sun')}</button>
        <button class="icon-btn ${taskDay(t) && !inToday ? 'on-plan' : ''}" data-action="task-day" data-id="${t.id}" title="Scegli il giorno" aria-label="Scegli il giorno">${ic('calendar')}</button>
        <button class="icon-btn" data-action="task-edit" data-id="${t.id}" title="Modifica" aria-label="Modifica">${ic('edit')}</button>
        <button class="icon-btn" data-action="task-delete" data-id="${t.id}" title="Elimina" aria-label="Elimina">${ic('trash')}</button>
      </div>
    </li>`;
}
function subjectOptions(selected = '', { none = 'Senza materia' } = {}) {
  return `<option value="">${esc(none)}</option>` + subjects().map((s) =>
    `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function emptyState(text, actionHtml = '') {
  return `<div class="empty"><p>${text}</p>${actionHtml}</div>`;
}
function deadlineRow(d, { actions = false } = {}) {
  const n = daysBetween(today(), d.date);
  const date = parseYmd(d.date);
  const type = DEADLINE_TYPES[d.type] || DEADLINE_TYPES.altro;
  return `
    <li class="deadline" style="--c:${esc(subjectColor(d.subjectId))}">
      <div class="date-block"><b>${date.getDate()}</b><span>${MONTHS[date.getMonth()].slice(0, 3)}</span></div>
      <div class="deadline-main">
        <div class="deadline-title">${ic(type.icon, 'sm')} ${esc(d.title)}</div>
        <div class="task-meta">${subjectChip(d.subjectId)}<span class="muted small">${type.label}${d.time ? ' · ' + esc(d.time) : ''} · ${relDays(n)}</span></div>
      </div>
      ${actions ? `<div class="task-actions">
        <button class="icon-btn" data-action="deadline-edit" data-id="${d.id}" aria-label="Modifica">${ic('edit')}</button>
        <button class="icon-btn" data-action="deadline-delete" data-id="${d.id}" aria-label="Elimina">${ic('trash')}</button>
      </div>` : ''}
    </li>`;
}

/* ---------------------------------------------------------------- view: home */
function viewHome() {
  const subs = subjects();
  const welcome = !subs.length && !store.all('task').length ? `
    <section class="card welcome span-all">
      <div>
        <h2>Benvenuto in StudyBoard ${ic('sparkle', 'sm')}</h2>
        <p class="muted">Inizia aggiungendo le materie che stai preparando, poi attività e scadenze. Oppure carica dei dati di esempio per vedere come funziona (potrai cancellarli dalle Impostazioni).</p>
      </div>
      <div class="row gap">
        <button class="btn primary" data-action="subject-new">${ic('plus')} Aggiungi materia</button>
        <button class="btn ghost" data-action="demo">Carica esempio</button>
      </div>
    </section>` : '';

  const tasks = todayTasks();
  const doneCount = tasks.filter((t) => t.done).length;
  const m = msByDay();
  const td = today();
  const ws = ymd(weekStart(new Date()));
  const streak = currentStreak(m);

  return `
    <div class="home-grid">
      ${welcome}
      ${countdownCard()}
      ${timerCard()}
      <a href="#statistiche" class="card stats-mini" title="Apri le statistiche">
        <div class="mini"><span class="muted small">Oggi</span><b>${fmtDur(m[td] || 0)}</b></div>
        <div class="mini"><span class="muted small">Questa settimana</span><b>${fmtDur(sumRange(m, ws, td))}</b></div>
        <div class="mini streak ${streak ? 'hot' : ''}"><span class="muted small">Streak</span><b>${ic('flame', 'sm')} ${streak} ${streak === 1 ? 'giorno' : 'giorni'}</b></div>
      </a>

      <section class="card today-card">
        <header class="card-head">
          <h2>Piano di oggi</h2>
          <div class="row gap-sm">
            <span class="muted small">${tasks.length ? `${doneCount}/${tasks.length} fatte` : ''}</span>
            <button class="btn ghost sm" data-action="import-today" title="Scegli attività dal Piano">${ic('plan')} Importa dal piano</button>
          </div>
        </header>
        ${tasks.length ? `<div class="progress"><i style="width:${Math.round((doneCount / tasks.length) * 100)}%"></i></div>` : ''}
        <form class="quick-add" data-form="quick-task" data-today="1">
          <input name="title" placeholder="Cosa studi oggi? Scrivi e premi Invio" autocomplete="off">
          <select name="subjectId" aria-label="Materia">${subjectOptions(ui.planSubject !== 'all' ? ui.planSubject : '', { none: 'Materia…' })}</select>
          <button class="icon-btn solid" aria-label="Aggiungi">${ic('plus')}</button>
        </form>
        ${tasks.length ? `<ul class="task-list">${tasks.map((t) => taskRow(t)).join('')}</ul>`
          : emptyState('Nessuna attività per oggi. Scrivine una qui sopra, oppure prendile da quelle che hai già nel Piano.', `<button class="btn primary sm" data-action="import-today">${ic('plan')} Importa dal piano</button>`)}
      </section>

      <div class="home-side">
      <section class="card">
        <header class="card-head"><h2>Prossime scadenze</h2><a href="#calendario" class="link small">Calendario</a></header>
        ${(() => {
          const list = upcomingDeadlines(6);
          return list.length ? `<ul class="deadline-list">${list.map((d) => deadlineRow(d)).join('')}</ul>`
            : emptyState('Nessuna scadenza in arrivo.', `<button class="btn ghost sm" data-action="deadline-new">${ic('plus')} Aggiungi scadenza</button>`);
        })()}
      </section>

      <section class="card">
        <header class="card-head"><h2>Avanzamento materie</h2><a href="#piano" class="link small">Piano</a></header>
        ${subs.length ? `<ul class="progress-list">${subs.map((s) => {
          const p = subjectProgress(s.id);
          return `<li style="--c:${esc(s.color)}">
            <div class="row between"><span class="chip"><i></i>${esc(s.name)}</span><span class="muted small">${p.done}/${p.total} · ${p.pct}%</span></div>
            <div class="progress"><i style="width:${p.pct}%"></i></div>
          </li>`;
        }).join('')}</ul>` : emptyState('Aggiungi una materia per vedere i progressi.')}
      </section>
      </div>
    </div>`;
}

function countdownCard() {
  const ex = nextExam();
  if (!ex) {
    return `<section class="card countdown empty-count">
      <span class="muted small">Prossimo esame</span>
      <p>Nessun esame in programma.</p>
      <button class="btn ghost sm" data-action="deadline-new" data-type="esame">${ic('plus')} Aggiungi esame</button>
    </section>`;
  }
  const n = daysBetween(today(), ex.date);
  const big = n === 0 ? 'Oggi!' : n === 1 ? 'Domani' : `${n}`;
  return `<section class="card countdown" style="--c:${esc(subjectColor(ex.subjectId))}">
    <span class="muted small">Prossimo esame</span>
    <div class="count-row">
      <div class="count-big">${big}${n > 1 ? '<small>giorni</small>' : ''}</div>
      <div>
        <div class="count-title">${esc(ex.title)}</div>
        <div class="muted small">${cap(fmtLong(parseYmd(ex.date)))}${ex.time ? ' · ' + esc(ex.time) : ''}</div>
      </div>
    </div>
  </section>`;
}

function timerCard() {
  const t = timerState();
  const subs = subjects();
  let controls;
  if (t.state === 'idle') {
    controls = `
      <select data-change="timer-subject" aria-label="Materia da studiare">${subjectOptions(ui.timerSubject, { none: 'Scegli materia (opzionale)' })}</select>
      <button class="btn primary" data-action="timer-start">${ic('play')} Inizia a studiare</button>`;
  } else {
    controls = `
      <div class="timer-subject">${t.subjectId ? subjectChip(t.subjectId) : '<span class="muted small">Studio libero</span>'}
        <span class="muted small">da ${fmtTime(t.sessionStart)}</span></div>
      <div class="row gap">
        ${t.state === 'running'
          ? `<button class="btn" data-action="timer-pause">${ic('pause')} Pausa</button>`
          : `<button class="btn primary" data-action="timer-resume">${ic('play')} Riprendi</button>`}
        <button class="btn danger" data-action="timer-stop">${ic('stop')} Termina</button>
      </div>`;
  }
  return `<section class="card timer-card state-${t.state}">
    <header class="card-head"><h2>Sessione di studio</h2>
      <span class="muted small">${t.state === 'running' ? '● In corso' : t.state === 'paused' ? 'In pausa' : subs.length ? '' : ''}</span></header>
    <div class="clock" data-clock>00:00:00</div>
    <div class="timer-controls">${controls}</div>
  </section>`;
}

/* ---------------------------------------------------------------- view: piano */
function viewPlan() {
  const subs = subjects();
  const all = store.all('task');
  const filter = ui.planSubject;
  const visible = all.filter((t) => (ui.showDone || !t.done) && (filter === 'all' || (filter === 'none' ? !subjectById(t.subjectId) : t.subjectId === filter)));

  const groups = [];
  const groupFor = (s) => ({ id: s ? s.id : 'none', name: s ? s.name : 'Senza materia', color: s ? s.color : 'var(--muted)', tasks: [] });
  const map = new Map();
  for (const s of subs) { const g = groupFor(s); map.set(s.id, g); groups.push(g); }
  const none = groupFor(null);
  for (const t of visible) (map.get(t.subjectId) || none).tasks.push(t);
  if (none.tasks.length) groups.push(none);

  const shown = groups.filter((g) => g.tasks.length || (filter === g.id));
  const doneHidden = all.filter((t) => t.done).length;
  const byDay = ui.planMode === 'giorni';

  return `
    <div class="plan-modes">
      <div class="segmented" role="tablist">
        <button class="${byDay ? '' : 'on'}" data-action="plan-mode" data-mode="materie" role="tab" aria-selected="${!byDay}">${ic('plan', 'sm')} Per materia</button>
        <button class="${byDay ? 'on' : ''}" data-action="plan-mode" data-mode="giorni" role="tab" aria-selected="${byDay}">${ic('calendar', 'sm')} Per giorno</button>
      </div>
      ${byDay ? `<button class="btn ghost sm" data-action="plan-week-ask">${ic('sparkle')} Distribuisci con l'assistente</button>` : ''}
    </div>
    <div class="toolbar">
      <div class="chips-scroll">
        <button class="filter ${filter === 'all' ? 'on' : ''}" data-action="plan-filter" data-subject="all">Tutte</button>
        ${subs.map((s) => `<button class="filter ${filter === s.id ? 'on' : ''}" data-action="plan-filter" data-subject="${s.id}" style="--c:${esc(s.color)}"><i></i>${esc(s.name)}</button>`).join('')}
        <button class="filter ghost" data-action="subject-new">${ic('plus', 'sm')} Materia</button>
      </div>
      <div class="row gap">
        <label class="switch"><input type="checkbox" data-change="toggle-done" ${ui.showDone ? 'checked' : ''}><span></span> Completate${doneHidden ? ` (${doneHidden})` : ''}</label>
        <button class="btn primary" data-action="task-new">${ic('plus')} Nuova attività</button>
      </div>
    </div>

    <form class="quick-add card" data-form="quick-task">
      <input name="title" placeholder="Aggiungi rapidamente un'attività e premi Invio" autocomplete="off">
      <select name="subjectId" aria-label="Materia">${subjectOptions(filter !== 'all' && filter !== 'none' ? filter : '', { none: 'Materia…' })}</select>
      <button class="icon-btn solid" aria-label="Aggiungi">${ic('plus')}</button>
    </form>

    ${!subs.length && !all.length ? emptyState('Il piano è vuoto. Crea prima le tue materie, poi aggiungi le attività da fare per ognuna.', `<button class="btn primary" data-action="subject-new">${ic('plus')} Aggiungi materia</button>`) : ''}

    ${byDay ? planDaysHtml(visible) : `<div class="plan-groups">
      ${shown.map((g) => {
        const p = g.id === 'none' ? null : subjectProgress(g.id);
        return `<section class="card plan-group" style="--c:${esc(g.color)}">
          <header class="card-head">
            <h2><span class="dot"></span>${esc(g.name)}</h2>
            <div class="row gap-sm">
              ${p ? `<span class="muted small">${p.done}/${p.total} · ${p.pct}%</span>` : ''}
              ${g.id !== 'none' ? `<button class="icon-btn" data-action="plan-ask" data-id="${g.id}" title="Chiedi all'assistente di riorganizzare" aria-label="Chiedi all'assistente">${ic('sparkle')}</button>
              <button class="icon-btn" data-action="task-new" data-subject="${g.id}" title="Nuova attività" aria-label="Nuova attività in ${esc(g.name)}">${ic('plus')}</button>
              <button class="icon-btn" data-action="subject-edit" data-id="${g.id}" title="Modifica materia" aria-label="Modifica materia">${ic('edit')}</button>` : ''}
            </div>
          </header>
          ${p ? `<div class="progress"><i style="width:${p.pct}%"></i></div>` : ''}
          ${g.tasks.length ? `<ul class="task-list">${sortTasks(g.tasks).map((t) => taskRow(t, { showSubject: false })).join('')}</ul>`
            : `<p class="muted small pad">${ui.showDone ? 'Nessuna attività.' : 'Tutto fatto qui 🎉'}</p>`}
        </section>`;
      }).join('')}
    </div>`}`;
}

/** Vista "Per giorno": attività da pianificare + i prossimi 7 giorni. */
function planDaysHtml(visible) {
  const td = today();
  const week = ui.planWeek || 0;
  const start = addDays(new Date(), week * 7);
  const days = [...Array(7)].map((_, i) => ymd(addDays(start, i)));
  const buckets = { '': [] };
  days.forEach((k) => { buckets[k] = []; });
  for (const t of visible) {
    let d = taskDay(t);
    if (d && d < td) {
      if (t.done) continue;
      d = td; // le attività rimandate compaiono oggi
    }
    if (buckets[d]) buckets[d].push(t);
  }
  const canDrag = window.matchMedia('(hover: hover)').matches;
  const column = (k, title, extraCls = '') => {
    const list = sortTasks(buckets[k]);
    const isToday = k === td;
    return `<section class="card day-col ${extraCls} ${isToday ? 'is-today' : ''}" data-drop-day="${k}">
      <header class="card-head">
        <h2>${title}</h2>
        <div class="row gap-sm">
          <span class="muted small">${list.filter((t) => !t.done).length || ''}</span>
          <button class="icon-btn" data-action="task-new" data-day="${k}" title="Nuova attività" aria-label="Nuova attività">${ic('plus')}</button>
        </div>
      </header>
      ${list.length ? `<ul class="task-list">${list.map((t) => taskRow(t, { hideDay: k || null, draggable: canDrag })).join('')}</ul>`
        : `<p class="muted small pad drop-hint">${k ? (canDrag ? 'Trascina qui le attività, o usa 📅 su un\'attività.' : 'Usa 📅 su un\'attività per spostarla qui.') : 'Tutte le attività hanno un giorno.'}</p>`}
    </section>`;
  };
  const rangeLabel = week === 0 ? 'Prossimi 7 giorni' : `${fmtShort(days[0])} – ${fmtShort(days[6])}`;
  return `
    <div class="week-nav">
      <button class="icon-btn" data-action="plan-week" data-dir="-1" aria-label="Settimana precedente" ${week === 0 ? 'disabled' : ''}>${ic('chevL')}</button>
      <b>${rangeLabel}</b>
      <button class="icon-btn" data-action="plan-week" data-dir="1" aria-label="Settimana successiva">${ic('chevR')}</button>
    </div>
    <div class="day-cols">
      ${column('', `${ic('plan', 'sm')} Da pianificare`, 'unplanned')}
      ${days.map((k) => column(k, dayLabel(k, { long: true }))).join('')}
    </div>`;
}

/* ---------------------------------------------------------------- view: calendario */
function viewCalendar() {
  const first = ui.calMonth;
  const y = first.getFullYear(); const mo = first.getMonth();
  const start = weekStart(first);
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const td = today();

  const deadlinesByDay = {};
  for (const d of store.all('deadline')) (deadlinesByDay[d.date] ||= []).push(d);
  // Per ogni giorno: attività pianificate quel giorno o con scadenza quel giorno (senza doppioni).
  const tasksByDay = {};
  for (const t of store.all('task')) {
    if (t.done) continue;
    for (const k of new Set([taskDay(t), t.due].filter(Boolean))) (tasksByDay[k] ||= []).push(t);
  }
  const m = msByDay();

  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const k = ymd(d);
    const dl = (deadlinesByDay[k] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const tk = tasksByDay[k] || [];
    const cls = ['cal-cell', d.getMonth() !== mo ? 'out' : '', k === td ? 'today' : '', k === ui.calSelected ? 'sel' : '', m[k] ? 'studied' : ''].join(' ');
    cells += `<button class="${cls}" data-action="cal-day" data-date="${k}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-events">
        ${dl.slice(0, 3).map((e) => `<span class="cal-chip ${e.type === 'esame' ? 'exam' : ''}" style="--c:${esc(subjectColor(e.subjectId))}"><span>${esc(e.title)}</span></span>`).join('')}
        ${dl.length > 3 ? `<span class="cal-more">+${dl.length - 3}</span>` : ''}
        ${tk.length ? `<span class="cal-tasks">${tk.length} ${tk.length === 1 ? 'attività' : 'attività'}</span>` : ''}
      </span>
    </button>`;
  }

  const sel = ui.calSelected;
  const selDl = (deadlinesByDay[sel] || []);
  const selTasks = sortTasks(store.all('task').filter((t) => t.due === sel));
  const selPlanned = sortTasks(store.all('task').filter((t) => taskDay(t) === sel));
  const selSessions = store.all('session').filter((s) => s.date === sel);

  return `
    <div class="cal-layout">
      <section class="card cal-card">
        <header class="cal-head">
          <h2>${cap(MONTHS[mo])} ${y}</h2>
          <div class="row gap-sm">
            <button class="icon-btn" data-action="cal-prev" aria-label="Mese precedente">${ic('chevL')}</button>
            <button class="btn ghost sm" data-action="cal-today">Oggi</button>
            <button class="icon-btn" data-action="cal-next" aria-label="Mese successivo">${ic('chevR')}</button>
          </div>
        </header>
        <div class="cal-grid">
          ${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join('')}
          ${cells}
        </div>
        <div class="cal-legend muted small">
          <span><i class="lg exam"></i> Esame</span><span><i class="lg"></i> Scadenza</span><span><i class="lg studied"></i> Giorno di studio</span>
        </div>
      </section>

      <section class="card day-panel">
        <header class="card-head">
          <h2>${cap(fmtLong(parseYmd(sel)))}</h2>
          <button class="btn primary sm" data-action="deadline-new" data-date="${sel}">${ic('plus')} Scadenza</button>
        </header>
        <h3>Scadenze</h3>
        ${selDl.length ? `<ul class="deadline-list">${selDl.map((d) => deadlineRow(d, { actions: true })).join('')}</ul>` : '<p class="muted small">Nessuna scadenza.</p>'}
        <h3>Attività pianificate per questo giorno</h3>
        ${selPlanned.length ? `<ul class="task-list">${selPlanned.map((t) => taskRow(t, { hideDay: sel })).join('')}</ul>` : `<p class="muted small">Nessuna. <button class="link" data-action="task-new" data-day="${sel}">Aggiungi attività</button></p>`}
        <h3>Attività da finire entro questo giorno</h3>
        ${selTasks.length ? `<ul class="task-list">${selTasks.map((t) => taskRow(t)).join('')}</ul>` : `<p class="muted small">Nessuna. <button class="link" data-action="task-new" data-due="${sel}">Aggiungi attività</button></p>`}
        <h3>Studio</h3>
        <p class="muted small">${selSessions.length ? `${fmtDur(selSessions.reduce((a, s) => a + (s.ms || 0), 0))} in ${selSessions.length} ${selSessions.length === 1 ? 'sessione' : 'sessioni'}` : 'Nessuna sessione registrata.'}</p>
      </section>
    </div>`;
}

/* ---------------------------------------------------------------- view: statistiche */
function viewStats() {
  const m = msByDay();
  const td = today();
  const now = new Date();
  const ws = weekStart(addDays(now, ui.weekOffset * 7));
  const week = [...Array(7)].map((_, i) => { const d = addDays(ws, i); const k = ymd(d); return { k, d, ms: m[k] || 0 }; });
  const weekTotal = week.reduce((a, x) => a + x.ms, 0);
  const maxMs = Math.max(3600000, ...week.map((x) => x.ms));
  const d30 = ymd(addDays(now, -29));
  const total30 = sumRange(m, d30, td);
  const streak = currentStreak(m);
  const best = bestStreak(m);

  // per materia, ultimi 30 giorni
  const bySub = {};
  for (const s of store.all('session')) if (s.date >= d30 && s.date <= td) bySub[s.subjectId || ''] = (bySub[s.subjectId || ''] || 0) + (s.ms || 0);
  const subRows = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
  const subMax = Math.max(1, ...subRows.map((r) => r[1]));

  // heatmap: 20 settimane
  const WEEKS = 26;
  const hmStart = addDays(weekStart(now), -(WEEKS - 1) * 7);
  let hm = '';
  let monthsRow = '';
  for (let w = 0; w < WEEKS; w++) {
    const colStart = addDays(hmStart, w * 7);
    monthsRow += `<span>${colStart.getDate() <= 7 ? MONTHS[colStart.getMonth()].slice(0, 3) : ''}</span>`;
    let col = '';
    for (let d = 0; d < 7; d++) {
      const day = addDays(colStart, d);
      const k = ymd(day);
      if (k > td) { col += '<i class="hm future"></i>'; continue; }
      const v = m[k] || 0;
      const lvl = v <= 0 ? 0 : v < 1800000 ? 1 : v < 3600000 ? 2 : v < 7200000 ? 3 : 4;
      col += `<i class="hm l${lvl}" title="${fmtShort(k)}: ${v ? fmtDur(v) : 'nessuno studio'}"></i>`;
    }
    hm += `<div class="hm-col">${col}</div>`;
  }

  const sessions = store.all('session').sort((a, b) => (b.start || 0) - (a.start || 0)).slice(0, 15);
  const weekLabel = ui.weekOffset === 0 ? 'Questa settimana' : ui.weekOffset === -1 ? 'Settimana scorsa'
    : `${fmtShort(ymd(ws))} – ${fmtShort(ymd(addDays(ws, 6)))}`;

  return `
    <div class="stats-grid">
      <section class="card tiles span-all">
        <div class="tile"><span class="muted small">Oggi</span><b>${fmtDur(m[td] || 0)}</b></div>
        <div class="tile"><span class="muted small">Ultimi 30 giorni</span><b>${fmtDur(total30)}</b><span class="muted small">media ${fmtDur(total30 / 30)}/giorno</span></div>
        <div class="tile ${streak ? 'hot' : ''}"><span class="muted small">Streak attuale</span><b>${ic('flame', 'sm')} ${streak}</b><span class="muted small">giorni consecutivi</span></div>
        <div class="tile"><span class="muted small">Record</span><b>${best}</b><span class="muted small">giorni di fila</span></div>
      </section>

      <section class="card">
        <header class="card-head">
          <h2>${weekLabel}</h2>
          <div class="row gap-sm">
            <span class="muted small">${fmtDur(weekTotal)}</span>
            <button class="icon-btn" data-action="week-prev" aria-label="Settimana precedente">${ic('chevL')}</button>
            <button class="icon-btn" data-action="week-next" aria-label="Settimana successiva" ${ui.weekOffset >= 0 ? 'disabled' : ''}>${ic('chevR')}</button>
          </div>
        </header>
        <div class="bars">
          ${week.map((x, i) => `<div class="bar-col ${x.k === td ? 'today' : ''}">
            <span class="bar-val">${x.ms ? fmtDur(x.ms) : ''}</span>
            <div class="bar-track"><div class="bar" style="height:${(x.ms / maxMs) * 100}%"></div></div>
            <span class="bar-lbl">${WEEKDAYS[i]}</span>
          </div>`).join('')}
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h2>Per materia</h2><span class="muted small">ultimi 30 giorni</span></header>
        ${subRows.length ? `<ul class="hbars">${subRows.map(([id, ms]) => `<li style="--c:${esc(subjectColor(id))}">
          <div class="row between"><span class="chip"><i></i>${esc(subjectName(id))}</span><span class="small">${fmtDur(ms)}</span></div>
          <div class="hbar"><i style="width:${(ms / subMax) * 100}%"></i></div>
        </li>`).join('')}</ul>` : emptyState('Nessuna sessione negli ultimi 30 giorni. Avvia il timer dalla pagina Oggi.')}
      </section>

      <section class="card span-all">
        <header class="card-head"><h2>Costanza</h2><span class="muted small">ultime ${WEEKS} settimane</span></header>
        <div class="heatmap-wrap">
          <div class="hm-days muted"><span>lun</span><span></span><span>mer</span><span></span><span>ven</span><span></span><span>dom</span></div>
          <div>
            <div class="hm-months muted">${monthsRow}</div>
            <div class="heatmap">${hm}</div>
          </div>
        </div>
        <div class="hm-legend muted small">meno <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> più</div>
      </section>

      <section class="card span-all">
        <header class="card-head"><h2>Sessioni recenti</h2>
          <button class="btn ghost sm" data-action="session-new">${ic('plus')} Aggiungi a mano</button></header>
        ${sessions.length ? `<ul class="session-list">${sessions.map((s) => `<li>
          <span class="session-date">${fmtShort(s.date)}</span>
          ${subjectChip(s.subjectId) || '<span class="muted small">Studio libero</span>'}
          <span class="muted small">${s.manual ? 'inserita a mano' : `${fmtTime(s.start)}–${fmtTime(s.end)}`}</span>
          <b class="session-dur">${fmtDur(s.ms)}</b>
          <button class="icon-btn" data-action="session-delete" data-id="${s.id}" aria-label="Elimina sessione">${ic('trash')}</button>
        </li>`).join('')}</ul>` : '<p class="muted small">Ancora nessuna sessione.</p>'}
      </section>
    </div>`;
}

/* ---------------------------------------------------------------- view: note */
function viewNotes() {
  const notes = store.all('note').sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || ((b.createdAt || 0) - (a.createdAt || 0)));
  return `
    <form class="card note-compose" data-form="note-new">
      <textarea name="text" class="autosize" rows="2" placeholder="Un appunto veloce, un dubbio da chiedere al prof, un link utile…"></textarea>
      <div class="row between gap">
        <select name="subjectId" aria-label="Materia">${subjectOptions('', { none: 'Nessuna materia' })}</select>
        <button class="btn primary">${ic('plus')} Aggiungi nota</button>
      </div>
    </form>
    ${notes.length ? `<div class="notes-grid">${notes.map((n) => `
      <article class="card note ${n.pinned ? 'pinned' : ''}" style="--c:${esc(subjectColor(n.subjectId))}">
        <textarea class="autosize" data-input="note-text" data-id="${n.id}" aria-label="Testo nota">${esc(n.text)}</textarea>
        <footer class="row between">
          <span class="row gap-sm">${subjectChip(n.subjectId)}<span class="muted small">${fmtShort(ymd(new Date(n.createdAt || Date.now())))}</span></span>
          <span class="row">
            <button class="icon-btn ${n.pinned ? 'on' : ''}" data-action="note-pin" data-id="${n.id}" title="Fissa in alto" aria-label="Fissa">${ic('pin')}</button>
            <button class="icon-btn" data-action="note-delete" data-id="${n.id}" title="Elimina" aria-label="Elimina">${ic('trash')}</button>
          </span>
        </footer>
      </article>`).join('')}</div>` : emptyState('Nessuna nota. Le modifiche alle note si salvano da sole mentre scrivi.')}`;
}

/* ---------------------------------------------------------------- view: impostazioni */
let installPrompt = null;
function viewSettings() {
  const subs = subjects();
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
    <div class="settings">
      <section class="card">
        <header class="card-head"><h2>Account e sincronizzazione</h2></header>
        ${CLOUD_CONFIGURED && sync.user ? `
          <p>Connesso come <b>${esc(sync.user.email)}</b></p>
          <p class="row gap-sm"><span data-sync class="sync"><i></i><span class="sync-label"></span></span>
            ${sync.lastOk ? `<span class="muted small">· ultima sync ${fmtTime(sync.lastOk)}</span>` : ''}</p>
          <div class="row gap">
            <button class="btn" data-action="sync-now">${ic('refresh')} Sincronizza ora</button>
            <button class="btn ghost" data-action="change-password">Cambia password</button>
            <button class="btn ghost" data-action="logout">${ic('logout')} Esci</button>
          </div>` : `
          <p><b>Modalità locale.</b> I dati restano solo su questo dispositivo.</p>
          <p class="muted small">Per usare StudyBoard su PC e iPhone con gli stessi dati, configura Supabase seguendo il file <code>README.md</code> e inserisci i dati del progetto in <code>config.js</code>.</p>`}
      </section>

      <section class="card">
        <header class="card-head"><h2>Assistente</h2></header>
        ${geminiCfg.key() ? `
          <p>Chiave di Gemini inserita su questo dispositivo <span class="muted">(…${esc(geminiCfg.key().slice(-4))})</span>.</p>
          <p class="muted small">Modello: ${esc(geminiCfg.model())}</p>
          <div class="row gap">
            <button class="btn" data-action="gemini-key">${ic('edit')} Cambia</button>
            <button class="btn ghost" data-action="gemini-remove">${ic('trash')} Rimuovi</button>
          </div>` : `
          <p class="muted small">Per usare l'assistente serve una chiave gratuita di Google Gemini, personale e salvata solo su questo dispositivo.</p>
          <div class="row gap">
            <a class="btn" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${ic('open')} Crea la chiave</a>
            <button class="btn primary" data-action="gemini-key">${ic('plus')} Inserisci la chiave</button>
          </div>`}
      </section>

      <section class="card">
        <header class="card-head"><h2>Materie</h2><button class="btn primary sm" data-action="subject-new">${ic('plus')} Nuova</button></header>
        ${subs.length ? `<ul class="subject-list">${subs.map((s) => {
          const p = subjectProgress(s.id);
          return `<li style="--c:${esc(s.color)}"><span class="chip"><i></i>${esc(s.name)}</span>
            <span class="muted small">${p.total} attività</span>
            <span class="row">
              <button class="icon-btn" data-action="subject-edit" data-id="${s.id}" aria-label="Modifica">${ic('edit')}</button>
              <button class="icon-btn" data-action="subject-delete" data-id="${s.id}" aria-label="Elimina">${ic('trash')}</button>
            </span></li>`;
        }).join('')}</ul>` : '<p class="muted small">Nessuna materia.</p>'}
      </section>

      <section class="card">
        <header class="card-head"><h2>Installa l'app</h2></header>
        ${standalone ? '<p>StudyBoard è già installata su questo dispositivo ✓</p>' : isIos ? `
          <p>Su iPhone apri questa pagina con <b>Safari</b>, tocca il pulsante <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>` : `
          <p>Su Windows e Linux usa Chrome o Edge: clicca l'icona <b>Installa</b> nella barra degli indirizzi${installPrompt ? ', oppure il pulsante qui sotto' : ''}.</p>
          ${installPrompt ? `<button class="btn primary" data-action="install">${ic('download')} Installa StudyBoard</button>` : ''}`}
      </section>

      <section class="card">
        <header class="card-head"><h2>Backup</h2></header>
        <p class="muted small">Scarica una copia di tutti i tuoi dati o ripristinala. L'importazione unisce i dati: vince sempre la versione più recente di ogni elemento.</p>
        <div class="row gap">
          <button class="btn" data-action="export">${ic('download')} Esporta</button>
          <label class="btn">${ic('upload')} Importa<input type="file" accept="application/json,.json" data-change="import" hidden></label>
        </div>
      </section>

      <section class="card danger-zone">
        <header class="card-head"><h2>Zona pericolosa</h2></header>
        <p class="muted small">Elimina tutte le materie, attività, scadenze, sessioni e note${CLOUD_CONFIGURED && sync.user ? ' su tutti i dispositivi' : ''}.</p>
        <button class="btn danger" data-action="wipe">${ic('trash')} Cancella tutti i dati</button>
      </section>
    </div>`;
}

/* ---------------------------------------------------------------- file storage
   Cloud: Supabase Storage (bucket "materiali"). Locale: IndexedDB nel browser. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const idb = {
  db: null,
  open() {
    this.db ||= new Promise((resolve, reject) => {
      const r = indexedDB.open('studyboard-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this.db;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('blobs', mode);
      const req = fn(t.objectStore('blobs'));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  },
  put(key, blob) { return this.run('readwrite', (s) => s.put(blob, key)); },
  get(key) { return this.run('readonly', (s) => s.get(key)); },
  del(key) { return this.run('readwrite', (s) => s.delete(key)); },
};
const cloudFiles = () => (sync.client && sync.user ? sync.client.storage.from('materiali') : null);
const safeName = (n) => n.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-80) || 'file';

async function storeBlob(fileId, file) {
  const bucket = cloudFiles();
  if (bucket) {
    const path = `${sync.user.id}/${fileId}/${safeName(file.name)}`;
    const { error } = await bucket.upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (error) throw error;
    return { storage: 'cloud', path };
  }
  const path = `local/${fileId}`;
  await idb.put(path, new Blob([file], { type: file.type }));
  return { storage: 'local', path };
}
async function loadBlob(f) {
  if (f.storage === 'local') {
    const b = await idb.get(f.path);
    if (!b) throw new Error('File non presente su questo dispositivo');
    return b;
  }
  const bucket = cloudFiles();
  if (!bucket) throw new Error('Accedi per aprire i file salvati nel cloud');
  const { data, error } = await bucket.download(f.path);
  if (error) throw error;
  return data;
}
async function deleteBlob(f) {
  try {
    if (f.storage === 'local') await idb.del(f.path);
    else if (cloudFiles()) await cloudFiles().remove([f.path]);
  } catch (e) { console.warn('Eliminazione file', e); }
}
/** Dopo il primo accesso, sposta nel cloud i file caricati in modalità locale. */
async function migrateLocalFiles() {
  const local = store.all('file').filter((f) => f.storage === 'local');
  for (const f of local) {
    try {
      const blob = await idb.get(f.path);
      if (!blob) continue;
      const res = await storeBlob(f.id, new File([blob], f.name, { type: f.type }));
      await idb.del(f.path);
      store.patch(f.id, res, { silent: true });
    } catch (e) { console.warn('Migrazione file', f.name, e); }
  }
  if (local.length) render();
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fileIcon(type) {
  if (type === 'application/pdf') return 'pdf';
  if ((type || '').startsWith('image/')) return 'image';
  return 'file';
}
const AI_READABLE = (type) => type === 'application/pdf' || /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(type) || (type || '').startsWith('text/') || type === 'application/json';

let uploading = [];
async function uploadFiles(list, subjectId) {
  const files = [...list];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) { toast(`"${file.name}" supera i 50 MB`); continue; }
    const id = uid();
    uploading.push({ id, name: file.name });
    render(true);
    try {
      const res = await storeBlob(id, file);
      store.put('file', id, {
        name: file.name, size: file.size, type: file.type || 'application/octet-stream', subjectId: subjectId || '',
        uploadedAt: Date.now(), ...res,
      }, { silent: true });
      toast(`Caricato: ${file.name}`);
    } catch (e) {
      console.error(e);
      toast(`Errore nel caricare "${file.name}"`);
    } finally {
      uploading = uploading.filter((u) => u.id !== id);
      render(true);
    }
  }
}

async function openFile(f) {
  // Apriamo subito la finestra (i browser bloccano i popup aperti dopo un'attesa).
  const win = window.open('', '_blank');
  try {
    let url;
    if (f.storage === 'cloud' && cloudFiles()) {
      const { data, error } = await cloudFiles().createSignedUrl(f.path, 300);
      if (error) throw error;
      url = data.signedUrl;
    } else {
      url = URL.createObjectURL(await loadBlob(f));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    if (win) win.location.href = url; else window.location.href = url;
  } catch (e) {
    if (win) win.close();
    toast(e.message || 'Impossibile aprire il file');
  }
}

/* ---------------------------------------------------------------- view: materiali */
function viewFiles() {
  const subs = subjects();
  const all = store.all('file').sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  const filter = ui.filesSubject || 'all';
  const visible = all.filter((f) => filter === 'all' || (filter === 'none' ? !subjectById(f.subjectId) : f.subjectId === filter));
  const groups = [];
  for (const s of subs) {
    const list = visible.filter((f) => f.subjectId === s.id);
    if (list.length) groups.push({ id: s.id, name: s.name, color: s.color, list });
  }
  const orphan = visible.filter((f) => !subjectById(f.subjectId));
  if (orphan.length) groups.push({ id: 'none', name: 'Senza materia', color: 'var(--muted)', list: orphan });
  const totalBytes = all.reduce((a, f) => a + (f.size || 0), 0);
  const uploadTarget = filter !== 'all' && filter !== 'none' ? filter : (ui.uploadSubject || '');

  return `
    <div class="toolbar">
      <div class="chips-scroll">
        <button class="filter ${filter === 'all' ? 'on' : ''}" data-action="files-filter" data-subject="all">Tutti</button>
        ${subs.map((s) => `<button class="filter ${filter === s.id ? 'on' : ''}" data-action="files-filter" data-subject="${s.id}" style="--c:${esc(s.color)}"><i></i>${esc(s.name)}</button>`).join('')}
      </div>
      <span class="muted small">${all.length} file · ${fmtBytes(totalBytes)}</span>
    </div>

    <label class="card dropzone" data-dropzone>
      <input type="file" multiple data-change="file-upload" hidden>
      ${ic('upload')}
      <div>
        <b>Trascina qui i file o tocca per sceglierli</b>
        <p class="muted small">PDF, appunti, slide, immagini… fino a 50 MB l'uno. ${CLOUD_CONFIGURED && sync.user ? 'Salvati nel cloud e disponibili su tutti i dispositivi.' : 'In modalità locale restano su questo dispositivo.'}</p>
      </div>
      <select data-change="upload-subject" aria-label="Materia dei file caricati" onclick="event.stopPropagation()">${subjectOptions(uploadTarget, { none: 'Materia: nessuna' })}</select>
    </label>

    ${uploading.length ? `<div class="card uploading">${uploading.map((u) => `<div class="row gap-sm"><span class="spinner"></span> Caricamento di <b>${esc(u.name)}</b>…</div>`).join('')}</div>` : ''}

    ${all.length ? '' : emptyState('Nessun materiale ancora. Carica dispense, appunti o slide: potrai aprirli da qualsiasi dispositivo e farli leggere all\'assistente.')}

    <div class="plan-groups">
      ${groups.map((g) => `
        <section class="card plan-group" style="--c:${esc(g.color)}">
          <header class="card-head"><h2><span class="dot"></span>${esc(g.name)}</h2><span class="muted small">${g.list.length}</span></header>
          <ul class="file-list">${g.list.map(fileRow).join('')}</ul>
        </section>`).join('')}
    </div>`;
}

function fileRow(f) {
  return `<li class="file-row">
    <button class="file-main" data-action="file-open" data-id="${f.id}" title="Apri">
      <span class="file-ic">${ic(fileIcon(f.type))}</span>
      <span class="file-text"><span class="file-name">${esc(f.name)}</span>
        <span class="muted small">${fmtBytes(f.size || 0)} · ${fmtShort(ymd(new Date(f.uploadedAt || Date.now())))}${f.storage === 'local' ? ' · solo su questo dispositivo' : ''}</span></span>
    </button>
    <div class="task-actions">
      ${AI_READABLE(f.type) ? `<button class="icon-btn" data-action="file-ask" data-id="${f.id}" title="Chiedi all'assistente" aria-label="Chiedi all'assistente">${ic('sparkle')}</button>` : ''}
      <button class="icon-btn" data-action="file-edit" data-id="${f.id}" title="Rinomina o sposta" aria-label="Modifica">${ic('edit')}</button>
      <button class="icon-btn" data-action="file-delete" data-id="${f.id}" title="Elimina" aria-label="Elimina">${ic('trash')}</button>
    </div>
  </li>`;
}

function fileModal(f) {
  openModal({
    title: 'Modifica file',
    body: `
      <label class="field"><span>Nome</span><input name="name" required autofocus maxlength="200" value="${esc(f.name)}"></label>
      <label class="field"><span>Materia</span><select name="subjectId">${subjectOptions(f.subjectId)}</select></label>`,
    onSubmit: (fd) => store.patch(f.id, { name: fd.name.trim(), subjectId: fd.subjectId || '' }),
  });
}

/* ---------------------------------------------------------------- assistente */
let assistantBusy = false;
const chatMessages = () => (store.get('chat')?.messages || []);
const findSubjectByName = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return n ? subjects().find((s) => s.name.trim().toLowerCase() === n) : null;
};
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHm = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

/** Riepilogo testuale dei dati dell'app, inviato all'assistente a ogni domanda. */
function buildContext() {
  const td = today();
  const m = msByDay();
  const d14 = ymd(addDays(new Date(), -13));
  const subs = subjects();
  const studyBySub = {};
  for (const s of store.all('session')) if (s.date >= d14) studyBySub[s.subjectId || ''] = (studyBySub[s.subjectId || ''] || 0) + (s.ms || 0);
  const tasks = store.all('task');
  const open = sortTasks(tasks.filter((t) => !t.done)).slice(0, 300);
  const recentDone = tasks.filter((t) => t.done && t.completedAt && ymd(new Date(t.completedAt)) >= d14).slice(0, 80);
  const dls = store.all('deadline').filter((d) => d.date >= ymd(addDays(new Date(), -7))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 100);
  const sub = (id) => (subjectById(id) ? `${subjectName(id)} (subject_id ${id})` : 'nessuna materia');
  const lines = [];
  lines.push(`Oggi: ${fmtLong(new Date())} (${td}). Settimana corrente da ${ymd(weekStart(new Date()))}.`);
  lines.push(`Studio: oggi ${fmtDur(m[td] || 0)}, ultimi 7 giorni ${fmtDur(sumRange(m, ymd(addDays(new Date(), -6)), td))}, streak ${currentStreak(m)} giorni.`);
  lines.push('', 'MATERIE:');
  if (!subs.length) lines.push('(nessuna)');
  for (const s of subs) {
    const p = subjectProgress(s.id);
    lines.push(`- id ${s.id}: ${s.name} — ${p.done}/${p.total} attività completate; studio ultimi 14 giorni: ${fmtDur(studyBySub[s.id] || 0)}`);
  }
  lines.push('', 'ATTIVITÀ DA FARE:');
  if (!open.length) lines.push('(nessuna)');
  for (const t of open) {
    lines.push(`- id ${t.id}: "${t.title}" | materia: ${sub(t.subjectId)} | priorità ${t.priority || 'media'}${t.due ? ` | scadenza entro ${t.due}` : ''}${taskDay(t) ? ` | pianificata per il ${taskDay(t)}${taskDay(t) < td ? ' (rimandata, quindi è nel piano di oggi)' : ''}` : ' | non ancora pianificata'}`);
  }
  lines.push('', 'ATTIVITÀ COMPLETATE NEGLI ULTIMI 14 GIORNI:');
  if (!recentDone.length) lines.push('(nessuna)');
  for (const t of recentDone) lines.push(`- id ${t.id}: "${t.title}" | materia: ${sub(t.subjectId)} | completata il ${ymd(new Date(t.completedAt))}`);
  lines.push('', 'SCADENZE (dalla settimana scorsa in poi):');
  if (!dls.length) lines.push('(nessuna)');
  for (const d of dls) lines.push(`- id ${d.id}: [${d.type}] "${d.title}" | materia: ${sub(d.subjectId)} | ${d.date}${d.time ? ' ' + d.time : ''}`);
  const filesList = store.all('file');
  lines.push('', 'MATERIALI CARICATI (lo studente può allegarli alla domanda):');
  if (!filesList.length) lines.push('(nessuno)');
  for (const f of filesList.slice(0, 100)) lines.push(`- "${f.name}" | materia: ${sub(f.subjectId)}`);
  const lib = librettoStats();
  lines.push('', `LIBRETTO: ${lib.exams.length} esami sostenuti, ${lib.cfuTot}/${lib.cfg.target} CFU, media ponderata ${fmtAvg(lib.wavg)}, media aritmetica ${fmtAvg(lib.avg)}, base di laurea ${fmtAvg(lib.base, 1)}/110.`);
  for (const e of lib.exams.slice(0, 60)) lines.push(`- ${e.name}: ${gradeLabel(e)} (${e.cfu} CFU${e.date ? `, ${e.date}` : ''})`);
  return lines.join('\n');
}

/* ---------------------------------------------------------------- Gemini
   Ogni persona usa la propria chiave gratuita di Google Gemini. La chiave resta solo
   nel browser di quel dispositivo (non va sul server di Supabase) e le richieste
   partono direttamente dal browser verso Google. */
const GEMINI_LS = 'studyboard.gemini.v1';
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const FALLBACK_GEMINI_MODEL = 'gemini-flash-lite-latest';
const MAX_INLINE_BYTES = 18 * 1024 * 1024; // Gemini accetta richieste fino a ~20 MB
const geminiCfg = {
  read() { try { return JSON.parse(localStorage.getItem(GEMINI_LS)) || {}; } catch { return {}; } },
  write(v) { try { localStorage.setItem(GEMINI_LS, JSON.stringify(v)); } catch { toast('Impossibile salvare la chiave su questo dispositivo'); } },
  key() { return this.read().key || ''; },
  model() { return this.read().model || DEFAULT_GEMINI_MODEL; },
};

const GEMINI_SYSTEM = `Sei l'assistente di studio integrato in StudyBoard, l'app con cui uno studente universitario pianifica le giornate di studio: materie, attività da completare, scadenze ed esami, sessioni di studio cronometrate, note e materiali caricati.

Rispondi in italiano, in modo chiaro e concreto, con la lunghezza adatta alla domanda: breve per le domande veloci, più articolata per spiegazioni di contenuti o piani di studio. Puoi usare Markdown semplice (grassetto, elenchi puntati o numerati).

Nell'ultimo messaggio ricevi un riepilogo aggiornato dei dati dell'app (materie, attività, scadenze, statistiche di studio, materiali). Usalo per dare consigli realistici: tieni conto delle date degli esami, delle attività ancora da fare e di quanto lo studente ha studiato davvero di recente. La data di oggi è indicata nel riepilogo.

Se lo studente allega dei materiali (PDF, immagini, testi), puoi leggerli: riassumerli, spiegarli, ricavarne argomenti da studiare o domande di ripasso.

Quando lo studente chiede di cambiare il piano (aggiungere, spostare, modificare o eliminare attività, scadenze o materie), oppure quando un piano di studio che proponi andrebbe inserito nell'app, metti le modifiche nel campo "actions". Lo studente le vedrà come proposte e deciderà lui se applicarle, quindi nel testo di risposta descrivi cosa proponi senza dire che è già stato fatto. Regole per le azioni:
- per modificare o eliminare elementi esistenti usa il loro "id" esatto dal riepilogo;
- per collegare un'attività o scadenza a una materia usa "subject_id"; se la materia viene creata nella stessa risposta con "add_subject", lascia subject_id a null e indica il nome in "subject_name";
- date nel formato AAAA-MM-GG, orari nel formato HH:MM;
- priority vale "alta", "media" o "bassa"; deadline_type vale "esame", "consegna" o "altro";
- nei campi che non servono per l'operazione metti null; in update_* metti null nei campi da lasciare invariati;
- "day" è il giorno in cui lo studente farà l'attività (AAAA-MM-GG): per distribuire le attività sui prossimi giorni usa update_task con "day", e per le nuove attività indica "day" se ha senso; "due" invece è la scadenza entro cui finirla;
- "today": true equivale a "day" = oggi (mette l'attività nel piano di oggi);
- quando distribuisci il lavoro su più giorni, non mettere troppe attività nello stesso giorno e tieni conto di scadenze ed esami;
- proponi attività concrete e piccole (es. "Esercizi capitolo 4: integrali per parti"), non obiettivi vaghi.
Se non serve modificare nulla, "actions" è una lista vuota.`;

const G_STR = { type: 'STRING', nullable: true };
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING', description: 'La risposta per lo studente, in Markdown semplice.' },
    actions: {
      type: 'ARRAY',
      description: 'Modifiche proposte al piano; lista vuota se non servono.',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['add_task', 'update_task', 'delete_task', 'add_deadline', 'update_deadline', 'delete_deadline', 'add_subject'] },
          id: G_STR, title: G_STR, subject_id: G_STR, subject_name: G_STR,
          priority: { type: 'STRING', nullable: true, enum: ['alta', 'media', 'bassa'] },
          due: G_STR,
          day: G_STR,
          today: { type: 'BOOLEAN', nullable: true },
          done: { type: 'BOOLEAN', nullable: true },
          date: G_STR, time: G_STR,
          deadline_type: { type: 'STRING', nullable: true, enum: ['esame', 'consegna', 'altro'] },
        },
        required: ['op'],
        propertyOrdering: ['op', 'id', 'title', 'subject_id', 'subject_name', 'priority', 'due', 'day', 'today', 'done', 'date', 'time', 'deadline_type'],
      },
    },
  },
  required: ['reply', 'actions'],
  propertyOrdering: ['reply', 'actions'],
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Manda la conversazione a Gemini e ritorna { reply, actions }. */
async function askGemini(msgs) {
  const key = geminiCfg.key();
  if (!key) throw new Error('Inserisci prima la tua chiave di Gemini.');
  const seen = new Set();
  let inlineBytes = 0;
  const filePart = async (f) => {
    if (!AI_READABLE(f.type)) return { text: `[Allegato "${f.name}": formato non leggibile. Suggerisci di caricarlo in PDF.]` };
    let blob;
    try { blob = await loadBlob(f); } catch { return { text: `[Allegato "${f.name}": non disponibile su questo dispositivo.]` }; }
    if ((f.type || '').startsWith('text/') || f.type === 'application/json') {
      return { text: `--- Contenuto di "${f.name}" ---\n${(await blob.text()).slice(0, 200000)}\n--- Fine ---` };
    }
    if (inlineBytes + blob.size > MAX_INLINE_BYTES) return { text: `[Allegato "${f.name}": troppo grande insieme agli altri (limite circa 18 MB in tutto).]` };
    inlineBytes += blob.size;
    return { inline_data: { mime_type: f.type, data: await blobToBase64(blob) } };
  };

  const contents = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === 'assistant') { contents.push({ role: 'model', parts: [{ text: historyText(m) || '…' }] }); continue; }
    const parts = [];
    for (const id of m.attachments || []) {
      const f = store.get(id);
      if (!f || seen.has(id)) continue;
      seen.add(id);
      parts.push({ text: `Allegato: ${f.name}` }, await filePart(f));
    }
    if (i === msgs.length - 1) parts.push({ text: `Riepilogo attuale dei dati di StudyBoard:\n\n${buildContext()}` });
    parts.push({ text: (m.text || '').slice(0, 20000) || '(allegati)' });
    contents.push({ role: 'user', parts });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, maxOutputTokens: 8192 },
  });
  // Se il modello principale è sovraccarico, troppo lento o ha finito la quota,
  // riproviamo con il modello "lite", che ha una quota separata ed è più disponibile.
  // Ultimo tentativo dopo una breve pausa: i sovraccarichi di Gemini spesso durano pochi secondi.
  const models = [...new Set([geminiCfg.model(), FALLBACK_GEMINI_MODEL]), FALLBACK_GEMINI_MODEL];
  let out;
  for (let i = 0; i < models.length; i++) {
    const last = i === models.length - 1;
    if (last && i > 0) await new Promise((r) => setTimeout(r, 4000));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), last ? 90000 : 25000);
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[i])}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: ctrl.signal,
      });
      out = await res.json().catch(() => ({}));
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError' && !last) continue;
      throw new Error(e.name === 'AbortError' ? 'Gemini non ha risposto in tempo. Riprova tra qualche minuto.' : 'Gemini non raggiungibile: controlla la connessione a internet.');
    }
    clearTimeout(timer);
    if (res.ok) break;
    const msg = out?.error?.message || `HTTP ${res.status}`;
    const reason = out?.error?.details?.find((d) => d.reason)?.reason || '';
    if (reason === 'API_KEY_INVALID' || /api key/i.test(msg)) throw new Error('La chiave di Gemini non è valida. Controllala in Impostazioni → Assistente.');
    if (res.status === 403) throw new Error('La chiave di Gemini non ha accesso a questo servizio o modello.');
    if (!last && [404, 429, 500, 503, 504].includes(res.status)) continue;
    if (res.status === 429) throw new Error('Hai raggiunto il limite gratuito di Gemini (richieste al minuto o al giorno). Riprova tra un po\' o domani.');
    if (res.status === 503 || res.status === 500) throw new Error('I server di Gemini sono sovraccarichi in questo momento. Riprova tra qualche minuto.');
    if (res.status === 404) throw new Error(`Il modello "${models[i]}" non è disponibile: cambialo in Impostazioni → Assistente.`);
    throw new Error(`Errore di Gemini (${res.status}): ${msg}`);
  }
  if (out?.promptFeedback?.blockReason) return { reply: 'Gemini ha bloccato questa richiesta. Prova a riformularla.', actions: [] };
  const cand = out?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { reply: text || 'Non sono riuscito a completare la risposta, riprova.', actions: [] }; }
  if (cand?.finishReason === 'MAX_TOKENS') parsed.reply = `${parsed.reply || ''}\n\n_(Risposta interrotta perché troppo lunga.)_`;
  else if (cand?.finishReason === 'SAFETY') parsed = { reply: 'Gemini ha interrotto la risposta per i suoi filtri di sicurezza. Prova a riformulare.', actions: [] };
  return { reply: String(parsed.reply || ''), actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
}

function geminiKeyModal() {
  const cfg = geminiCfg.read();
  openModal({
    title: 'Chiave di Gemini',
    submitLabel: 'Salva',
    body: `
      <p class="muted small">La chiave resta solo su questo dispositivo: non viene salvata sul server dell'app. Su ogni dispositivo che usi va inserita una volta.</p>
      <label class="field"><span>Chiave API</span><input name="key" required autocomplete="off" spellcheck="false" value="${esc(cfg.key || '')}" placeholder="Incolla qui la chiave (inizia con AIza…)"></label>
      <label class="field"><span>Modello (avanzato)</span><input name="model" autocomplete="off" spellcheck="false" value="${esc(cfg.model || '')}" placeholder="${DEFAULT_GEMINI_MODEL}"></label>`,
    onSubmit: (fd) => {
      geminiCfg.write({ key: fd.key.trim(), model: fd.model.trim() });
      toast('Chiave salvata');
      render(true);
    },
  });
}

function describeAction(a, html = true) {
  const q = (s) => (html ? `«${esc(s)}»` : `"${s}"`);
  const target = a.id ? store.get(a.id) : null;
  const subjLabel = a.subject_id && subjectById(a.subject_id) ? subjectName(a.subject_id) : a.subject_name || '';
  const bits = [];
  if (subjLabel) bits.push(subjLabel);
  if (a.priority) bits.push(`priorità ${a.priority}`);
  if (isYmd(a.due)) bits.push(`entro ${fmtShort(a.due)}`);
  if (isYmd(a.date)) bits.push(`${fmtShort(a.date)}${isHm(a.time) ? ' ' + a.time : ''}`);
  if (isYmd(a.day)) bits.push(a.day === today() ? 'nel piano di oggi' : `da fare ${dayLabel(a.day, { long: true }).toLowerCase()}`);
  else if (a.today) bits.push('nel piano di oggi');
  if (a.done === true) bits.push('segna come fatta');
  if (a.done === false) bits.push('segna da fare');
  const extra = bits.length ? ` · ${bits.map((b) => (html ? esc(b) : b)).join(' · ')}` : '';
  const tName = target ? (target.title || target.name || '') : (a.target_title || a.title || '');
  switch (a.op) {
    case 'add_subject': return `Nuova materia ${q(a.subject_name || a.title || '')}`;
    case 'add_task': return `Nuova attività ${q(a.title || '')}${extra}`;
    case 'update_task': return `Modifica attività ${q(tName)}${a.title && target && a.title !== target.title ? ` → ${q(a.title)}` : ''}${extra}`;
    case 'delete_task': return `Elimina attività ${q(tName)}`;
    case 'add_deadline': return `Nuova scadenza${a.deadline_type ? ` (${html ? esc(a.deadline_type) : a.deadline_type})` : ''} ${q(a.title || '')}${extra}`;
    case 'update_deadline': return `Modifica scadenza ${q(tName)}${a.title && target && a.title !== target.title ? ` → ${q(a.title)}` : ''}${extra}`;
    case 'delete_deadline': return `Elimina scadenza ${q(tName)}`;
    default: return 'Azione sconosciuta';
  }
}
const ACTION_ICON = { add_subject: 'plus', add_task: 'plus', add_deadline: 'flag', update_task: 'edit', update_deadline: 'edit', delete_task: 'trash', delete_deadline: 'trash' };

/** Applica una modifica proposta dall'assistente. Ritorna true se riuscita. */
function applyAction(a) {
  const resolveSubject = () => {
    if (a.subject_id && subjectById(a.subject_id)) return a.subject_id;
    return findSubjectByName(a.subject_name)?.id || null;
  };
  const priority = ['alta', 'media', 'bassa'].includes(a.priority) ? a.priority : null;
  const target = a.id ? store.get(a.id) : null;
  const kind = target ? store.items[a.id].kind : null;
  const opts = { silent: true };
  switch (a.op) {
    case 'add_subject': {
      const name = String(a.subject_name || a.title || '').trim();
      if (!name) return false;
      if (findSubjectByName(name)) return true;
      const used = new Set(subjects().map((x) => x.color));
      store.put('subject', uid(), { name, color: SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[0], createdAt: Date.now() }, opts);
      return true;
    }
    case 'add_task': {
      const title = String(a.title || '').trim();
      if (!title) return false;
      store.put('task', uid(), {
        title, subjectId: resolveSubject() || '', priority: priority || 'media', due: isYmd(a.due) ? a.due : '',
        day: isYmd(a.day) ? a.day : (a.today ? today() : ''),
        today: !!a.today, done: false, completedAt: null, createdAt: Date.now(),
      }, opts);
      return true;
    }
    case 'update_task': {
      if (kind !== 'task') return false;
      const p = {};
      if (a.title) p.title = String(a.title).trim();
      const s = resolveSubject(); if (s) p.subjectId = s;
      if (priority) p.priority = priority;
      if (isYmd(a.due)) p.due = a.due;
      if (isYmd(a.day)) { p.day = a.day; p.today = false; } else if (typeof a.today === 'boolean') { p.day = a.today ? today() : ''; p.today = false; }
      if (typeof a.done === 'boolean') { p.done = a.done; p.completedAt = a.done ? Date.now() : null; }
      store.patch(a.id, p, opts);
      return true;
    }
    case 'delete_task':
    case 'delete_deadline':
      if (kind !== (a.op === 'delete_task' ? 'task' : 'deadline')) return false;
      store.remove(a.id, opts);
      return true;
    case 'add_deadline': {
      const title = String(a.title || '').trim();
      if (!title || !isYmd(a.date)) return false;
      store.put('deadline', uid(), {
        title, type: DEADLINE_TYPES[a.deadline_type] ? a.deadline_type : 'altro', subjectId: resolveSubject() || '',
        date: a.date, time: isHm(a.time) ? a.time : '', createdAt: Date.now(),
      }, opts);
      return true;
    }
    case 'update_deadline': {
      if (kind !== 'deadline') return false;
      const p = {};
      if (a.title) p.title = String(a.title).trim();
      const s = resolveSubject(); if (s) p.subjectId = s;
      if (isYmd(a.date)) p.date = a.date;
      if (isHm(a.time)) p.time = a.time;
      if (DEADLINE_TYPES[a.deadline_type]) p.type = a.deadline_type;
      store.patch(a.id, p, opts);
      return true;
    }
    default: return false;
  }
}

function markApplied(msgId, indexes, results) {
  const msgs = chatMessages().map((m) => {
    if (m.id !== msgId) return m;
    const applied = [...(m.applied || [])];
    indexes.forEach((i, k) => { applied[i] = results[k] ? 'ok' : 'fail'; });
    return { ...m, applied };
  });
  store.put('chat', 'chat', { messages: msgs });
}

function applyProposals(msgId, onlyIndex = null) {
  const msg = chatMessages().find((m) => m.id === msgId);
  if (!msg) return;
  const idx = (msg.actions || []).map((_, i) => i).filter((i) => (onlyIndex === null || i === onlyIndex) && !msg.applied?.[i]);
  // Prima le nuove materie, così le attività possono collegarsi per nome.
  idx.sort((x, y) => Number(msg.actions[y].op === 'add_subject') - Number(msg.actions[x].op === 'add_subject'));
  const results = idx.map((i) => applyAction(msg.actions[i]));
  markApplied(msgId, idx, results);
  const ok = results.filter(Boolean).length;
  toast(ok === results.length ? (ok === 1 ? 'Modifica applicata' : `${ok} modifiche applicate`) : `${ok} applicate, ${results.length - ok} non valide`);
}

function historyText(m) {
  if (m.role !== 'assistant' || !(m.actions || []).length) return m.text;
  const lines = m.actions.map((a, i) => `- ${describeAction(a, false)} (${m.applied?.[i] === 'ok' ? 'applicata' : 'non applicata'})`);
  return `${m.text}\n\n[Modifiche proposte nell'app:\n${lines.join('\n')}]`;
}

async function sendChat(text) {
  text = text.trim();
  if (!text || assistantBusy) return;
  const attachments = (ui.chatAttachments || []).filter((id) => store.get(id));
  const userMsg = { id: uid(), role: 'user', text, attachments, at: Date.now() };
  store.put('chat', 'chat', { messages: [...chatMessages(), userMsg] }, { silent: true });
  ui.chatDraft = '';
  ui.chatAttachments = [];
  assistantBusy = true;
  render(true);
  try {
    const history = chatMessages().filter((m) => !m.error).slice(-16);
    while (history.length && history[0].role !== 'user') history.shift();
    const data = await askGemini(history);
    // Ricordiamo il titolo degli elementi coinvolti, per mostrarlo anche dopo un'eliminazione.
    const actions = (Array.isArray(data.actions) ? data.actions : []).filter((a) => a && typeof a.op === 'string').map((a) => {
      const t = a.id ? store.get(a.id) : null;
      return t ? { ...a, target_title: t.title || t.name || '' } : a;
    });
    store.put('chat', 'chat', {
      messages: [...chatMessages(), { id: uid(), role: 'assistant', text: data.reply || '', actions, applied: [], at: Date.now() }],
    }, { silent: true });
  } catch (e) {
    store.put('chat', 'chat', { messages: [...chatMessages(), { id: uid(), role: 'assistant', text: `⚠️ ${e.message || e}`, error: true, at: Date.now() }] }, { silent: true });
  } finally {
    assistantBusy = false;
    render(true);
    if (window.matchMedia('(hover: hover)').matches) $('#chat-input')?.focus();
  }
}

/** Markdown minimo e sicuro (il testo viene prima "escapato"). */
function md(src) {
  const inline = (t) => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1<i>$2</i>');
  let html = ''; let list = null;
  for (const raw of esc(src).split('\n')) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)/)) || (m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      const type = /^\s*\d/.test(l) ? 'ol' : 'ul';
      if (list !== type) { if (list) html += `</${list}>`; html += `<${type}>`; list = type; }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    if (list) { html += `</${list}>`; list = null; }
    if ((m = l.match(/^#{1,6}\s+(.*)/))) { html += `<h4>${inline(m[1])}</h4>`; continue; }
    if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

const CHAT_SUGGESTIONS = [
  'Cosa dovrei studiare oggi?',
  'Crea un piano di ripasso per il prossimo esame',
  'Sono indietro: aiutami a riorganizzare le attività di questa settimana',
  'Distribuisci le mie attività sui prossimi giorni',
  'Come sto andando con lo studio nelle ultime due settimane?',
];

function viewAssistant() {
  if (!geminiCfg.key()) {
    return `<section class="card assistant-off">
      <h2>${ic('sparkle', 'sm')} Attiva l'assistente</h2>
      <p>Fai domande veloci all'intelligenza artificiale (Google Gemini): cosa studiare oggi, come riorganizzare una materia, riassunti dei tuoi materiali. Le modifiche al piano che propone si applicano con un tocco.</p>
      <p>Serve una <b>chiave personale gratuita</b> di Gemini, una volta sola:</p>
      <ol class="steps">
        <li>Apri <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e accedi con il tuo account Google.</li>
        <li>Premi <b>Create API key</b> e copia la chiave. Non serve carta di credito: non aggiungere un metodo di pagamento e resti sul piano gratuito.</li>
        <li>Torna qui e premi il pulsante sotto per incollarla.</li>
      </ol>
      <button class="btn primary" data-action="gemini-key">${ic('plus')} Inserisci la chiave</button>
      <p class="muted small privacy-note">Privacy: le domande e i file che alleghi vanno direttamente da questo dispositivo a Google. Con il piano gratuito Google può usarli per migliorare i suoi servizi, quindi non allegare documenti con dati personali. La chiave resta solo su questo dispositivo.</p>
    </section>`;
  }
  const msgs = chatMessages();
  const att = (ui.chatAttachments || []).map((id) => store.get(id)).filter(Boolean);
  return `
    <div class="chat">
      <div class="chat-head">
        <span class="muted small">Le risposte usano i dati della tua app${msgs.length ? '' : ' (materie, attività, scadenze, statistiche)'}.</span>
        ${msgs.length ? `<button class="btn ghost sm" data-action="chat-clear">${ic('refresh')} Nuova conversazione</button>` : ''}
      </div>
      <div class="chat-log">
        ${msgs.length ? msgs.map(chatBubble).join('') : `
          <div class="chat-empty">
            <div class="chat-hello">${ic('sparkle')}</div>
            <h2>Ciao! Come posso aiutarti con lo studio?</h2>
            <p class="muted">Conosco le tue materie, attività e scadenze. Puoi anche allegare i tuoi materiali con ${ic('clip', 'sm')}.</p>
            <div class="suggestions">${CHAT_SUGGESTIONS.map((s) => `<button class="suggestion" data-action="chat-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          </div>`}
        ${assistantBusy ? '<div class="bubble assistant typing"><span></span><span></span><span></span></div>' : ''}
      </div>
      <form class="composer card" data-form="chat">
        ${att.length ? `<div class="attach-row">${att.map((f) => `<span class="attach-chip">${ic(fileIcon(f.type), 'sm')} ${esc(f.name)}<button type="button" data-action="chat-detach" data-id="${f.id}" aria-label="Rimuovi allegato">${ic('x', 'sm')}</button></span>`).join('')}</div>` : ''}
        <div class="composer-row">
          <button type="button" class="icon-btn" data-action="chat-attach" title="Allega materiali" aria-label="Allega materiali">${ic('clip')}</button>
          <textarea id="chat-input" class="autosize" rows="1" name="text" data-input="chat-draft" placeholder="Fai una domanda…" ${assistantBusy ? 'disabled' : ''}>${esc(ui.chatDraft || '')}</textarea>
          <button class="icon-btn solid" ${assistantBusy ? 'disabled' : ''} aria-label="Invia">${ic('send')}</button>
        </div>
      </form>
    </div>`;
}

function chatBubble(m) {
  if (m.role === 'user') {
    const att = (m.attachments || []).map((id) => store.get(id)).filter(Boolean);
    return `<div class="bubble user">
      ${att.length ? `<div class="attach-row">${att.map((f) => `<span class="attach-chip">${ic(fileIcon(f.type), 'sm')} ${esc(f.name)}</span>`).join('')}</div>` : ''}
      <div class="bubble-text">${esc(m.text).replace(/\n/g, '<br>')}</div>
    </div>`;
  }
  const actions = m.actions || [];
  const pending = actions.filter((_, i) => !m.applied?.[i]).length;
  return `<div class="bubble assistant ${m.error ? 'error' : ''}">
    <div class="md">${md(m.text || '')}</div>
    ${actions.length ? `<div class="proposals">
      <div class="row between"><b class="small">Modifiche proposte</b>
        ${pending > 1 ? `<button class="btn primary sm" data-action="chat-apply" data-msg="${m.id}">${ic('check')} Applica tutte (${pending})</button>` : ''}</div>
      <ul>${actions.map((a, i) => {
        const st = m.applied?.[i];
        return `<li class="proposal ${st || ''}">
          <span class="proposal-ic">${ic(ACTION_ICON[a.op] || 'edit', 'sm')}</span>
          <span class="proposal-text">${describeAction(a)}</span>
          ${st === 'ok' ? `<span class="badge ok">${ic('check', 'sm')} Applicata</span>`
            : st === 'fail' ? '<span class="badge danger">Non valida</span>'
            : `<button class="btn sm" data-action="chat-apply" data-msg="${m.id}" data-index="${i}">Applica</button>`}
        </li>`;
      }).join('')}</ul>
    </div>` : ''}
  </div>`;
}

function attachModal() {
  const files = store.all('file').sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  if (!files.length) {
    toast('Carica prima dei file nella sezione Materiali');
    location.hash = '#materiali';
    return;
  }
  const sel = new Set(ui.chatAttachments || []);
  openModal({
    title: 'Allega materiali',
    submitLabel: 'Allega',
    body: `<p class="muted small">L'assistente legge PDF, immagini e file di testo (al massimo circa 18 MB in tutto). Con il piano gratuito di Gemini i contenuti possono essere usati da Google: evita documenti con dati personali.</p>
      <ul class="pick-list">${files.map((f) => `<li><label class="check ${AI_READABLE(f.type) ? '' : 'disabled'}">
        <input type="checkbox" name="f_${f.id}" ${sel.has(f.id) ? 'checked' : ''} ${AI_READABLE(f.type) ? '' : 'disabled'}>
        ${ic(fileIcon(f.type), 'sm')} <span class="file-name">${esc(f.name)}</span>
        <span class="muted small">${subjectById(f.subjectId) ? esc(subjectName(f.subjectId)) : ''}${AI_READABLE(f.type) ? '' : ' · formato non leggibile'}</span>
      </label></li>`).join('')}</ul>`,
    onSubmit: (fd) => {
      ui.chatAttachments = Object.keys(fd).filter((k) => k.startsWith('f_')).map((k) => k.slice(2)).slice(0, 8);
      render(true);
    },
  });
}

/* ---------------------------------------------------------------- libretto */
const librettoCfg = () => ({ lode: 30, target: 180, ...(store.get('libretto-settings') || {}) });
const examValue = (e, lode) => (e.lode ? lode : e.grade);
const isGraded = (e) => !e.idoneo && typeof e.grade === 'number';
const gradeLabel = (e) => (e.idoneo ? 'Idoneo' : e.lode ? '30L' : String(e.grade));
const fmtAvg = (n, digits = 2) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(digits).replace('.', ','));
const examForSubject = (sid) => (sid ? store.all('exam').find((e) => e.subjectId === sid) : null);

function librettoStats(extra = null) {
  const cfg = librettoCfg();
  const exams = store.all('exam').concat(extra ? [extra] : []);
  const graded = exams.filter(isGraded);
  const cfuTot = exams.reduce((a, e) => a + (Number(e.cfu) || 0), 0);
  const gradedCfu = graded.reduce((a, e) => a + (Number(e.cfu) || 0), 0);
  const avg = graded.length ? graded.reduce((a, e) => a + examValue(e, cfg.lode), 0) / graded.length : null;
  const wavg = gradedCfu ? graded.reduce((a, e) => a + examValue(e, cfg.lode) * (Number(e.cfu) || 0), 0) / gradedCfu : null;
  return { cfg, exams, graded, cfuTot, avg, wavg, base: wavg == null ? null : (wavg * 110) / 30 };
}

function gradeClass(e) {
  if (e.idoneo) return 'ok';
  if (e.lode || e.grade >= 28) return 'top';
  if (e.grade >= 24) return 'good';
  return 'base';
}

function viewLibretto() {
  const st = librettoStats();
  const exams = st.exams.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pct = Math.min(100, Math.round((st.cfuTot / (st.cfg.target || 180)) * 100));
  const chrono = st.graded.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const maxV = Math.max(30, st.cfg.lode);
  return `
    <div class="libretto">
      <section class="card libretto-summary span-all">
        <div class="tiles">
          <div class="tile"><span class="muted small">Media ponderata</span><b class="accent">${fmtAvg(st.wavg)}</b><span class="muted small">pesata sui CFU</span></div>
          <div class="tile"><span class="muted small">Media aritmetica</span><b>${fmtAvg(st.avg)}</b><span class="muted small">${st.graded.length} esami con voto</span></div>
          <div class="tile"><span class="muted small">Base di laurea</span><b>${fmtAvg(st.base, 1)}</b><span class="muted small">su 110</span></div>
          <div class="tile"><span class="muted small">Esami sostenuti</span><b>${st.exams.length}</b><span class="muted small">${st.exams.length - st.graded.length ? `di cui ${st.exams.length - st.graded.length} idoneità` : 'tutti con voto'}</span></div>
        </div>
        <div class="cfu-bar">
          <div class="row between"><span><b>${st.cfuTot}</b> / ${st.cfg.target} CFU</span>
            <span class="row gap-sm"><span class="muted small">${st.cfuTot >= st.cfg.target ? 'Obiettivo raggiunto 🎓' : `ne mancano ${st.cfg.target - st.cfuTot}`}</span>
            <button class="icon-btn" data-action="libretto-settings" title="Impostazioni libretto" aria-label="Impostazioni libretto">${ic('settings')}</button></span></div>
          <div class="progress big"><i style="width:${pct}%"></i></div>
        </div>
      </section>

      <section class="card span-all">
        <header class="card-head"><h2>Esami sostenuti</h2><button class="btn primary sm" data-action="exam-new">${ic('plus')} Registra esame</button></header>
        ${exams.length ? `<ul class="exam-list">${exams.map((e) => `<li class="exam-row">
          <span class="exam-date muted small">${e.date ? fmtShort(e.date) + ' ' + e.date.slice(0, 4) : ''}<span class="only-mobile">&nbsp;· ${Number(e.cfu) || 0} CFU</span></span>
          <span class="exam-name"><b>${esc(e.name)}</b>${subjectById(e.subjectId) ? subjectChip(e.subjectId) : ''}</span>
          <span class="exam-cfu muted small">${Number(e.cfu) || 0} CFU</span>
          <span class="grade ${gradeClass(e)}">${gradeLabel(e)}</span>
          <span class="row">
            <button class="icon-btn" data-action="exam-edit" data-id="${e.id}" aria-label="Modifica">${ic('edit')}</button>
            <button class="icon-btn" data-action="exam-delete" data-id="${e.id}" aria-label="Elimina">${ic('trash')}</button>
          </span>
        </li>`).join('')}</ul>`
          : emptyState('Il libretto è vuoto. Registra gli esami che hai già dato per vedere media, CFU e base di laurea.', `<button class="btn primary sm" data-action="exam-new">${ic('plus')} Registra il primo esame</button>`)}
      </section>

      <section class="card">
        <header class="card-head"><h2>Andamento dei voti</h2><span class="muted small">in ordine di data</span></header>
        ${chrono.length ? `<div class="grade-chart">${chrono.map((e) => {
          const v = examValue(e, st.cfg.lode);
          return `<div class="gbar ${gradeClass(e)}" title="${esc(e.name)}: ${gradeLabel(e)}">
            <span class="gbar-val">${gradeLabel(e)}</span>
            <div class="gbar-track"><div class="gbar-fill" style="height:${Math.max(6, ((v - 17) / (maxV - 17)) * 100)}%"></div></div>
            <span class="gbar-lbl">${esc(e.name.slice(0, 3))}</span>
          </div>`;
        }).join('')}</div>` : '<p class="muted small">Il grafico compare quando registri esami con voto.</p>'}
      </section>

      <section class="card simulator">
        <header class="card-head"><h2>${ic('trend', 'sm')} Simulatore</h2><span class="muted small">e se…?</span></header>
        <p class="muted small">Come cambierebbe la tua media con il prossimo esame?</p>
        <div class="row2">
          <label class="field"><span>Voto</span><select id="sim-grade" data-change="sim">${gradeOptions('27')}</select></label>
          <label class="field"><span>CFU</span><input id="sim-cfu" type="number" min="1" max="30" value="6" inputmode="numeric" data-input="sim"></label>
        </div>
        <div id="sim-out" class="sim-out">${simText('27', 6)}</div>
      </section>
    </div>`;
}

function gradeOptions(selected = '', { withIdoneo = false } = {}) {
  const opts = [['30L', '30 e lode']].concat([...Array(13)].map((_, i) => [String(30 - i), String(30 - i)]));
  if (withIdoneo) opts.push(['idoneo', 'Idoneità (senza voto)']);
  return opts.map(([v, l]) => `<option value="${v}" ${v === String(selected) ? 'selected' : ''}>${l}</option>`).join('');
}
function parseGrade(v) {
  if (v === 'idoneo') return { grade: null, lode: false, idoneo: true };
  if (v === '30L') return { grade: 30, lode: true, idoneo: false };
  return { grade: Math.min(30, Math.max(18, parseInt(v, 10) || 18)), lode: false, idoneo: false };
}
function simText(gradeVal, cfu) {
  const before = librettoStats();
  const after = librettoStats({ id: '_sim', name: 'sim', cfu: Number(cfu) || 0, ...parseGrade(gradeVal) });
  if (!(Number(cfu) > 0)) return '<span class="muted small">Inserisci i CFU dell\'esame.</span>';
  const diff = before.wavg == null ? null : after.wavg - before.wavg;
  const sign = diff == null ? '' : diff >= 0 ? '+' : '';
  return `<div>Media ponderata: <b>${fmtAvg(before.wavg)}</b> → <b class="accent">${fmtAvg(after.wavg)}</b>
    ${diff == null ? '' : `<span class="badge ${diff >= 0 ? 'ok' : 'danger'}">${sign}${fmtAvg(diff)}</span>`}</div>
    <div class="muted small">Base di laurea: ${fmtAvg(before.base, 1)} → ${fmtAvg(after.base, 1)} su 110</div>`;
}
function updateSim() {
  const out = $('#sim-out');
  if (out) out.innerHTML = simText($('#sim-grade').value, $('#sim-cfu').value);
}

function examModal(e = null, preset = {}) {
  const x = e || { name: '', subjectId: preset.subjectId || '', cfu: 6, grade: 27, lode: false, idoneo: false, date: today() };
  const gradeSel = x.idoneo ? 'idoneo' : x.lode ? '30L' : String(x.grade);
  openModal({
    title: e ? 'Modifica esame' : 'Registra esame',
    submitLabel: e ? 'Salva' : 'Registra',
    body: `
      <label class="field"><span>Materia (opzionale)</span><select name="subjectId" data-change="exam-subject">${subjectOptions(x.subjectId, { none: 'Nessuna / altro esame' })}</select></label>
      <label class="field"><span>Nome dell'esame</span><input name="name" required maxlength="120" value="${esc(x.name || (x.subjectId ? subjectName(x.subjectId) : ''))}" placeholder="Es. Analisi 1"></label>
      <div class="row2">
        <label class="field"><span>Esito</span><select name="grade">${gradeOptions(gradeSel, { withIdoneo: true })}</select></label>
        <label class="field"><span>CFU</span><input name="cfu" type="number" min="1" max="30" required value="${esc(x.cfu)}" inputmode="numeric"></label>
      </div>
      <label class="field"><span>Data</span><input name="date" type="date" value="${esc(x.date || today())}" max="${today()}"></label>`,
    onSubmit: (fd) => {
      const cfu = parseInt(fd.cfu, 10);
      if (!(cfu > 0)) { toast('Inserisci i CFU'); return false; }
      const data = { name: fd.name.trim(), subjectId: fd.subjectId || '', cfu, date: fd.date || today(), ...parseGrade(fd.grade) };
      if (e) store.patch(e.id, data);
      else { store.put('exam', uid(), { ...data, createdAt: Date.now() }); toast('Esame registrato 🎉'); }
    },
  });
}

function librettoSettingsModal() {
  const cfg = librettoCfg();
  openModal({
    title: 'Impostazioni libretto',
    body: `
      <label class="field"><span>CFU totali del corso di laurea</span><input name="target" type="number" min="1" max="400" value="${esc(cfg.target)}" inputmode="numeric"></label>
      <label class="field"><span>Valore della lode nella media</span><select name="lode">${[30, 31, 32, 33].map((v) => `<option value="${v}" ${v === cfg.lode ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <p class="muted small">Ogni università calcola la lode in modo diverso: controlla il regolamento del tuo corso.</p>`,
    onSubmit: (fd) => store.put('settings', 'libretto-settings', { target: parseInt(fd.target, 10) || 180, lode: parseInt(fd.lode, 10) || 30 }),
  });
}

/* ---------------------------------------------------------------- materie */
function subjectFacts(s) {
  const td = today();
  const tasks = store.all('task').filter((t) => t.subjectId === s.id);
  const sessions = store.all('session').filter((x) => x.subjectId === s.id);
  const d30 = ymd(addDays(new Date(), -29));
  const d7 = ymd(addDays(new Date(), -6));
  const dls = store.all('deadline').filter((d) => d.subjectId === s.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return {
    p: subjectProgress(s.id),
    open: sortTasks(tasks.filter((t) => !t.done)),
    done: tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
    upcoming: dls.filter((d) => d.date >= td),
    past: dls.filter((d) => d.date < td).reverse(),
    nextExam: dls.find((d) => d.date >= td && d.type === 'esame'),
    files: store.all('file').filter((f) => f.subjectId === s.id).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)),
    notes: store.all('note').filter((n) => n.subjectId === s.id).sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || ((b.createdAt || 0) - (a.createdAt || 0))),
    sessions,
    msTotal: sessions.reduce((a, x) => a + (x.ms || 0), 0),
    ms30: sessions.filter((x) => x.date >= d30).reduce((a, x) => a + (x.ms || 0), 0),
    ms7: sessions.filter((x) => x.date >= d7).reduce((a, x) => a + (x.ms || 0), 0),
    exam: examForSubject(s.id),
  };
}

function viewSubjects() {
  const sel = routeArg() ? subjectById(routeArg()) : null;
  if (sel) return viewSubjectDetail(sel);
  const subs = subjects();
  if (!subs.length) {
    return emptyState('Non hai ancora materie. Aggiungine una: qui troverai tutto quello che la riguarda, cioè attività, scadenze, materiali, note e ore di studio.',
      `<button class="btn primary" data-action="subject-new">${ic('plus')} Aggiungi materia</button>`);
  }
  return `
    <div class="subject-grid">
      ${subs.map((s) => {
        const f = subjectFacts(s);
        const next = f.upcoming[0];
        return `<a href="#materie/${s.id}" class="card subject-card" style="--c:${esc(s.color)}">
          <div class="subject-top">
            <h2><span class="dot"></span>${esc(s.name)}</h2>
            ${f.exam ? `<span class="grade ${gradeClass(f.exam)}">${gradeLabel(f.exam)}</span>` : ''}
          </div>
          <div class="progress"><i style="width:${f.p.pct}%"></i></div>
          <div class="muted small">${f.p.done}/${f.p.total} attività completate · ${f.p.pct}%</div>
          <ul class="subject-facts">
            <li>${ic('flag', 'sm')} ${next ? `${esc(next.title)} · <b>${relDays(daysBetween(today(), next.date))}</b>` : '<span class="muted">Nessuna scadenza</span>'}</li>
            <li>${ic('clock', 'sm')} ${fmtDur(f.ms30)} di studio negli ultimi 30 giorni</li>
            <li>${ic('folder', 'sm')} ${f.files.length} file · ${f.notes.length} note · ${f.open.length} attività da fare</li>
          </ul>
          <span class="subject-open">Apri ${ic('chevR', 'sm')}</span>
        </a>`;
      }).join('')}
      <button class="card subject-card add" data-action="subject-new">${ic('plus')}<span>Nuova materia</span></button>
    </div>`;
}

function viewSubjectDetail(s) {
  const f = subjectFacts(s);
  const td = today();
  // ultimi 14 giorni di studio
  const byDay = {};
  for (const x of f.sessions) byDay[x.date] = (byDay[x.date] || 0) + (x.ms || 0);
  const days14 = [...Array(14)].map((_, i) => ymd(addDays(new Date(), i - 13)));
  const max14 = Math.max(3600000, ...days14.map((k) => byDay[k] || 0));
  const canDrag = false;
  return `
    <a href="#materie" class="back-link">${ic('back', 'sm')} Tutte le materie</a>

    <section class="card subject-hero" style="--c:${esc(s.color)}">
      <div class="hero-main">
        <div class="hero-title"><span class="dot big"></span>
          <div><h2>${esc(s.name)}</h2><p class="muted small">${f.p.done}/${f.p.total} attività completate · ${f.p.pct}%</p></div>
        </div>
        <div class="hero-actions">
          <button class="btn primary sm" data-action="subject-study" data-id="${s.id}">${ic('play')} Studia ora</button>
          <button class="btn sm" data-action="plan-ask" data-id="${s.id}">${ic('sparkle')} Chiedi all'assistente</button>
          <button class="icon-btn" data-action="subject-edit" data-id="${s.id}" title="Modifica materia" aria-label="Modifica materia">${ic('edit')}</button>
        </div>
      </div>
      <div class="progress"><i style="width:${f.p.pct}%"></i></div>
      <div class="hero-tiles">
        <div class="tile"><span class="muted small">Prossimo esame</span>${f.nextExam
          ? `<b>${daysBetween(td, f.nextExam.date) === 0 ? 'Oggi!' : relDays(daysBetween(td, f.nextExam.date))}</b><span class="muted small">${cap(fmtLong(parseYmd(f.nextExam.date)))}</span>`
          : `<b>—</b><button class="link small" data-action="deadline-new" data-type="esame" data-subject="${s.id}">Aggiungi la data</button>`}</div>
        <div class="tile"><span class="muted small">Da fare</span><b>${f.open.length}</b><span class="muted small">attività</span></div>
        <div class="tile"><span class="muted small">Studio totale</span><b>${fmtDur(f.msTotal)}</b><span class="muted small">${fmtDur(f.ms7)} negli ultimi 7 giorni</span></div>
        <div class="tile"><span class="muted small">Libretto</span>${f.exam
          ? `<b><span class="grade ${gradeClass(f.exam)}">${gradeLabel(f.exam)}</span></b><span class="muted small">${f.exam.cfu} CFU · ${f.exam.date ? fmtShort(f.exam.date) : ''}</span>`
          : `<b>—</b><button class="link small" data-action="exam-new" data-subject="${s.id}">Registra il voto</button>`}</div>
      </div>
    </section>

    <div class="subject-detail-grid">
      <section class="card">
        <header class="card-head"><h2>${ic('plan', 'sm')} Attività</h2><button class="icon-btn" data-action="task-new" data-subject="${s.id}" title="Nuova attività" aria-label="Nuova attività">${ic('plus')}</button></header>
        <form class="quick-add" data-form="quick-task">
          <input name="title" placeholder="Nuova attività e Invio" autocomplete="off">
          <input type="hidden" name="subjectId" value="${s.id}">
          <button class="icon-btn solid" aria-label="Aggiungi">${ic('plus')}</button>
        </form>
        ${f.open.length ? `<ul class="task-list">${f.open.map((t) => taskRow(t, { showSubject: false, draggable: canDrag })).join('')}</ul>` : '<p class="muted small pad">Nessuna attività da fare 🎉</p>'}
        ${f.done.length ? `<details class="done-list"><summary>Completate (${f.done.length})</summary><ul class="task-list">${f.done.slice(0, 50).map((t) => taskRow(t, { showSubject: false })).join('')}</ul></details>` : ''}
      </section>

      <section class="card">
        <header class="card-head"><h2>${ic('flag', 'sm')} Scadenze</h2><button class="icon-btn" data-action="deadline-new" data-subject="${s.id}" title="Nuova scadenza" aria-label="Nuova scadenza">${ic('plus')}</button></header>
        ${f.upcoming.length ? `<ul class="deadline-list">${f.upcoming.map((d) => deadlineRow(d, { actions: true })).join('')}</ul>` : '<p class="muted small pad">Nessuna scadenza in arrivo.</p>'}
        ${f.past.length ? `<details class="done-list"><summary>Passate (${f.past.length})</summary><ul class="deadline-list">${f.past.map((d) => deadlineRow(d, { actions: true })).join('')}</ul></details>` : ''}
      </section>

      <section class="card">
        <header class="card-head"><h2>${ic('folder', 'sm')} Materiali</h2>
          <label class="btn sm">${ic('upload')} Carica<input type="file" multiple hidden data-change="file-upload" data-subject="${s.id}"></label></header>
        ${uploading.length ? `<div class="uploading">${uploading.map((u) => `<div class="row gap-sm"><span class="spinner"></span> ${esc(u.name)}…</div>`).join('')}</div>` : ''}
        ${f.files.length ? `<ul class="file-list">${f.files.map(fileRow).join('')}</ul>` : '<p class="muted small pad">Nessun file. Carica dispense, appunti o slide di questa materia.</p>'}
      </section>

      <section class="card">
        <header class="card-head"><h2>${ic('notes', 'sm')} Note</h2></header>
        <form class="note-inline" data-form="note-new">
          <textarea name="text" class="autosize" rows="1" placeholder="Un appunto su ${esc(s.name)}…"></textarea>
          <input type="hidden" name="subjectId" value="${s.id}">
          <button class="icon-btn solid" aria-label="Aggiungi nota">${ic('plus')}</button>
        </form>
        ${f.notes.length ? `<ul class="mini-notes">${f.notes.map((n) => `<li class="${n.pinned ? 'pinned' : ''}">
          <textarea class="autosize" data-input="note-text" data-id="${n.id}" aria-label="Nota">${esc(n.text)}</textarea>
          <span class="row">
            <button class="icon-btn ${n.pinned ? 'on' : ''}" data-action="note-pin" data-id="${n.id}" aria-label="Fissa">${ic('pin')}</button>
            <button class="icon-btn" data-action="note-delete" data-id="${n.id}" aria-label="Elimina">${ic('trash')}</button>
          </span>
        </li>`).join('')}</ul>` : '<p class="muted small pad">Nessuna nota per questa materia.</p>'}
      </section>

      <section class="card span-all" style="--c:${esc(s.color)}">
        <header class="card-head"><h2>${ic('stats', 'sm')} Studio negli ultimi 14 giorni</h2>
          <button class="btn ghost sm" data-action="session-new" data-subject="${s.id}">${ic('plus')} Aggiungi a mano</button></header>
        <div class="bars bars-14">
          ${days14.map((k) => `<div class="bar-col ${k === td ? 'today' : ''}">
            <span class="bar-val">${byDay[k] ? fmtDur(byDay[k]) : ''}</span>
            <div class="bar-track"><div class="bar" style="height:${((byDay[k] || 0) / max14) * 100}%; background: var(--c)"></div></div>
            <span class="bar-lbl">${parseYmd(k).getDate()}</span>
          </div>`).join('')}
        </div>
      </section>
    </div>`;
}

const VIEW_RENDERERS = { home: viewHome, piano: viewPlan, calendario: viewCalendar, materie: viewSubjects, libretto: viewLibretto, materiali: viewFiles, assistente: viewAssistant, statistiche: viewStats, note: viewNotes, impostazioni: viewSettings };

/* ---------------------------------------------------------------- modals */
function openModal({ title, body, submitLabel = 'Salva', onSubmit }) {
  const dlg = $('#modal');
  dlg.innerHTML = `
    <form class="modal-form" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-action="modal-close" aria-label="Chiudi">${ic('x')}</button></header>
      <div class="modal-body">${body}</div>
      <footer><button type="button" class="btn ghost" data-action="modal-close">Annulla</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></footer>
    </form>`;
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const req = [...form.querySelectorAll('[required]')].find((el) => !el.value.trim());
    if (req) { req.focus(); req.classList.add('invalid'); return; }
    const fd = Object.fromEntries(new FormData(form));
    if (onSubmit(fd, form) !== false) closeModal();
  });
  dlg.showModal();
  setTimeout(() => form.querySelector('[autofocus]')?.focus(), 40);
}
function closeModal() {
  const dlg = $('#modal');
  if (dlg.open) dlg.close();
}

function taskModal(task = null, preset = {}) {
  const t = task || { title: '', subjectId: preset.subjectId || '', priority: 'media', due: preset.due || '', day: preset.day || '' };
  const curDay = task ? taskDay(task) : t.day;
  openModal({
    title: task ? 'Modifica attività' : 'Nuova attività',
    submitLabel: task ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Attività</span><input name="title" required autofocus maxlength="200" value="${esc(t.title)}" placeholder="Es. Ripassare capitolo 3"></label>
      <div class="row2">
        <label class="field"><span>Materia</span><select name="subjectId">${subjectOptions(t.subjectId)}</select></label>
        <label class="field"><span>Priorità</span><select name="priority">${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${k === (t.priority || 'media') ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Giorno in cui farla (opzionale)</span><input type="date" name="day" value="${esc(curDay || '')}"></label>
        <label class="field"><span>Scadenza: finire entro (opzionale)</span><input type="date" name="due" value="${esc(t.due || '')}"></label>
      </div>`,
    onSubmit: (fd) => {
      const data = { title: fd.title.trim(), subjectId: fd.subjectId || '', priority: fd.priority || 'media', due: fd.due || '', day: fd.day || '', today: false };
      if (task) store.patch(task.id, data);
      else store.put('task', uid(), { ...data, done: false, completedAt: null, createdAt: Date.now() });
    },
  });
}

/** Imposta il giorno ('' = nessuno) per una o più attività. */
function setTasksDay(ids, day) {
  ids.forEach((id) => { if (store.get(id)) store.patch(id, { day, today: false }, { silent: true }); });
  render(true);
  scheduleSync();
  const n = ids.length;
  toast(!day ? (n === 1 ? 'Giorno rimosso' : `Giorno rimosso da ${n} attività`)
    : day === today() ? (n === 1 ? 'Aggiunta al piano di oggi' : `${n} attività aggiunte al piano di oggi`)
    : `${n === 1 ? 'Spostata' : `${n} attività spostate`} a ${dayLabel(day, { long: true }).toLowerCase()}`);
}

/** Scelta rapida del giorno: oggi, domani, i prossimi giorni, oppure una data. */
function dayPickerModal(ids) {
  const t = ids.length === 1 ? store.get(ids[0]) : null;
  const cur = t ? taskDay(t) : '';
  const now = new Date();
  const days = [...Array(7)].map((_, i) => ymd(addDays(now, i)));
  const nextMonday = ymd(addDays(weekStart(now), 7));
  if (!days.includes(nextMonday)) days.push(nextMonday);
  const idsAttr = esc(ids.join(','));
  openModal({
    title: t ? `Quando fai «${t.title}»?` : 'Scegli il giorno',
    submitLabel: 'Usa questa data',
    body: `
      <div class="day-grid">
        ${days.map((k) => `<button type="button" class="day-btn ${k === cur ? 'on' : ''}" data-action="pick-day" data-ids="${idsAttr}" data-date="${k}">
          <b>${daysBetween(today(), k) <= 1 ? dayLabel(k) : cap(WEEKDAYS[(parseYmd(k).getDay() + 6) % 7])}</b>
          <span>${parseYmd(k).getDate()} ${MONTHS[parseYmd(k).getMonth()].slice(0, 3)}</span>
        </button>`).join('')}
      </div>
      <label class="field"><span>Un altro giorno</span><input type="date" name="date" value="${esc(cur && !days.includes(cur) ? cur : '')}" min="${today()}"></label>
      ${cur ? `<button type="button" class="btn ghost sm" data-action="pick-day" data-ids="${idsAttr}" data-date="">${ic('x')} Nessun giorno</button>` : ''}`,
    onSubmit: (fd) => {
      if (!fd.date) { toast('Scegli una data'); return false; }
      setTasksDay(ids, fd.date);
    },
  });
}

/** Sceglie dal Piano le attività da mettere nel piano di oggi. */
function importTodayModal() {
  const candidates = store.all('task').filter((t) => !t.done && !inTodayPlan(t) && !(t.due && t.due <= today()));
  if (!candidates.length) {
    toast(store.all('task').some((t) => !t.done) ? 'Tutte le attività da fare sono già nel piano di oggi' : 'Il Piano è vuoto: aggiungi prima qualche attività');
    return;
  }
  const groups = [];
  for (const s of subjects()) {
    const list = candidates.filter((t) => t.subjectId === s.id);
    if (list.length) groups.push({ name: s.name, color: s.color, list });
  }
  const orphan = candidates.filter((t) => !subjectById(t.subjectId));
  if (orphan.length) groups.push({ name: 'Senza materia', color: 'var(--muted)', list: orphan });
  openModal({
    title: 'Importa nel piano di oggi',
    submitLabel: 'Aggiungi a oggi',
    body: `
      <p class="muted small">Scegli le attività del Piano che vuoi fare oggi.</p>
      <div class="import-list">
        ${groups.map((g) => `<div class="import-group" style="--c:${esc(g.color)}">
          <div class="import-head"><span class="chip"><i></i>${esc(g.name)}</span></div>
          ${sortTasks(g.list).map((t) => `<label class="check import-item">
            <input type="checkbox" name="t_${t.id}">
            <span class="import-title">${esc(t.title)}</span>
            <span class="import-meta">${dayBadge(t)}${t.priority === 'alta' ? '<span class="badge prio">Alta</span>' : ''}${t.due ? `<span class="badge">Entro ${fmtShort(t.due)}</span>` : ''}</span>
          </label>`).join('')}
        </div>`).join('')}
      </div>`,
    onSubmit: (fd) => {
      const ids = Object.keys(fd).filter((k) => k.startsWith('t_')).map((k) => k.slice(2));
      if (!ids.length) { toast('Seleziona almeno un\'attività'); return false; }
      setTasksDay(ids, today());
    },
  });
}

function deadlineModal(d = null, preset = {}) {
  const x = d || { title: '', type: preset.type || 'esame', subjectId: preset.subjectId || '', date: preset.date || today(), time: '' };
  openModal({
    title: d ? 'Modifica scadenza' : 'Nuova scadenza',
    submitLabel: d ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Titolo</span><input name="title" required autofocus maxlength="200" value="${esc(x.title)}" placeholder="Es. Esame di Analisi 2"></label>
      <div class="row2">
        <label class="field"><span>Tipo</span><select name="type">${Object.entries(DEADLINE_TYPES).map(([k, v]) => `<option value="${k}" ${k === x.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="field"><span>Materia</span><select name="subjectId">${subjectOptions(x.subjectId)}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Data</span><input type="date" name="date" required value="${esc(x.date)}"></label>
        <label class="field"><span>Ora (opzionale)</span><input type="time" name="time" value="${esc(x.time || '')}"></label>
      </div>`,
    onSubmit: (fd) => {
      const data = { title: fd.title.trim(), type: fd.type, subjectId: fd.subjectId || '', date: fd.date, time: fd.time || '' };
      if (d) store.patch(d.id, data);
      else store.put('deadline', uid(), { ...data, createdAt: Date.now() });
      ui.calSelected = fd.date;
    },
  });
}

function subjectModal(s = null) {
  const used = new Set(subjects().map((x) => x.color));
  const color = s?.color || SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[0];
  openModal({
    title: s ? 'Modifica materia' : 'Nuova materia',
    submitLabel: s ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Nome</span><input name="name" required autofocus maxlength="80" value="${esc(s?.name || '')}" placeholder="Es. Analisi 2"></label>
      <div class="field"><span>Colore</span><div class="swatches">
        ${SUBJECT_COLORS.map((c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span></span></label>`).join('')}
      </div></div>`,
    onSubmit: (fd) => {
      const data = { name: fd.name.trim(), color: fd.color || color };
      if (s) store.patch(s.id, data);
      else store.put('subject', uid(), { ...data, createdAt: Date.now() });
    },
  });
}

function sessionModal(subjectId = '') {
  openModal({
    title: 'Aggiungi sessione a mano',
    submitLabel: 'Aggiungi',
    body: `
      <p class="muted small">Hai studiato senza avviare il timer? Registralo qui.</p>
      <div class="row2">
        <label class="field"><span>Materia</span><select name="subjectId">${subjectOptions(subjectId, { none: 'Studio libero' })}</select></label>
        <label class="field"><span>Giorno</span><input type="date" name="date" required value="${today()}" max="${today()}"></label>
      </div>
      <div class="row2">
        <label class="field"><span>Ore</span><input type="number" name="h" min="0" max="16" value="1" inputmode="numeric"></label>
        <label class="field"><span>Minuti</span><input type="number" name="m" min="0" max="59" value="0" inputmode="numeric"></label>
      </div>`,
    onSubmit: (fd) => {
      const ms = ((parseInt(fd.h, 10) || 0) * 60 + (parseInt(fd.m, 10) || 0)) * 60000;
      if (ms < 60000) { toast('Inserisci almeno 1 minuto'); return false; }
      const start = parseYmd(fd.date).getTime() + 12 * 3600000;
      store.put('session', uid(), { subjectId: fd.subjectId || '', date: fd.date, start, end: start + ms, ms, manual: true });
    },
  });
}

/* ---------------------------------------------------------------- actions */
const ACTIONS = {
  'modal-close': () => closeModal(),
  'task-new': (el) => taskModal(null, {
    subjectId: el.dataset.subject || (ui.planSubject !== 'all' && ui.planSubject !== 'none' ? ui.planSubject : ''),
    due: el.dataset.due || '',
    day: el.dataset.day !== undefined ? el.dataset.day : (currentView() === 'home' ? today() : ''),
  }),
  'task-edit': (el) => { const t = store.get(el.dataset.id); if (t) taskModal(t); },
  'task-delete': (el) => { const t = store.get(el.dataset.id); if (t && confirm(`Eliminare l'attività "${t.title}"?`)) store.remove(t.id); },
  'task-today': (el) => {
    const t = store.get(el.dataset.id);
    if (!t) return;
    const was = inTodayPlan(t);
    store.patch(t.id, { day: was ? '' : today(), today: false });
    toast(was ? 'Tolta dal piano di oggi' : 'Aggiunta al piano di oggi');
  },
  'task-day': (el) => { const t = store.get(el.dataset.id); if (t) dayPickerModal([t.id]); },
  'pick-day': (el) => {
    const ids = (el.dataset.ids || '').split(',').filter(Boolean);
    setTasksDay(ids, el.dataset.date || '');
    closeModal();
  },
  'import-today': () => importTodayModal(),
  'menu-open': () => { const s = $('#sheet'); if (s) { s.hidden = false; requestAnimationFrame(() => s.classList.add('open')); } },
  'menu-close': () => closeSheet(),
  'plan-mode': (el) => { ui.planMode = el.dataset.mode; saveUi(); render(true); },
  'plan-week': (el) => { ui.planWeek = Math.max(0, (ui.planWeek || 0) + Number(el.dataset.dir)); render(true); },
  'plan-week-ask': () => {
    ui.chatDraft = 'Distribuisci le mie attività da fare sui prossimi 7 giorni, tenendo conto delle scadenze e degli esami. Non mettere troppe cose nello stesso giorno.';
    location.hash = '#assistente';
  },
  'deadline-new': (el) => deadlineModal(null, { date: el.dataset.date, type: el.dataset.type, subjectId: el.dataset.subject }),
  'subject-study': (el) => {
    const s = store.get(el.dataset.id);
    if (!s) return;
    ui.timerSubject = s.id;
    saveUi();
    if (timerState().state !== 'idle') { toast('C\'è già una sessione in corso: terminala dalla pagina Oggi'); return; }
    timerStart();
    toast(`Timer avviato: ${s.name}`);
  },
  'exam-new': (el) => examModal(null, { subjectId: el.dataset.subject || '' }),
  'exam-edit': (el) => { const e = store.get(el.dataset.id); if (e) examModal(e); },
  'exam-delete': (el) => { const e = store.get(el.dataset.id); if (e && confirm(`Eliminare l'esame "${e.name}" dal libretto?`)) store.remove(e.id); },
  'libretto-settings': () => librettoSettingsModal(),
  'deadline-edit': (el) => { const d = store.get(el.dataset.id); if (d) deadlineModal(d); },
  'deadline-delete': (el) => { const d = store.get(el.dataset.id); if (d && confirm(`Eliminare la scadenza "${d.title}"?`)) store.remove(d.id); },
  'subject-new': () => subjectModal(),
  'subject-edit': (el) => { const s = store.get(el.dataset.id); if (s) subjectModal(s); },
  'subject-delete': (el) => {
    const s = store.get(el.dataset.id);
    if (!s) return;
    const n = store.all('task').filter((t) => t.subjectId === s.id).length;
    if (!confirm(`Eliminare la materia "${s.name}"?${n ? `\nLe sue ${n} attività resteranno, "senza materia".` : ''}`)) return;
    if (ui.planSubject === s.id) { ui.planSubject = 'all'; saveUi(); }
    if (currentView() === 'materie' && routeArg() === s.id) history.replaceState(null, '', '#materie');
    store.remove(s.id);
  },
  'timer-start': () => timerStart(),
  'timer-pause': () => timerPause(),
  'timer-resume': () => timerResume(),
  'timer-stop': () => timerStop(),
  'session-new': (el) => sessionModal(el.dataset.subject || ''),
  'session-delete': (el) => { if (confirm('Eliminare questa sessione di studio?')) store.remove(el.dataset.id); },
  'note-pin': (el) => { const n = store.get(el.dataset.id); if (n) store.patch(n.id, { pinned: !n.pinned }); },
  'note-delete': (el) => { if (confirm('Eliminare questa nota?')) store.remove(el.dataset.id); },
  'plan-filter': (el) => { ui.planSubject = el.dataset.subject; saveUi(); render(true); },
  'cal-prev': () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); render(true); },
  'cal-next': () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); render(true); },
  'cal-today': () => { const n = new Date(); ui.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); ui.calSelected = today(); render(true); },
  'cal-day': (el) => {
    ui.calSelected = el.dataset.date;
    const d = parseYmd(el.dataset.date);
    if (d.getMonth() !== ui.calMonth.getMonth()) ui.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    render(true);
    if (window.innerWidth < 900) $('.day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'week-prev': () => { ui.weekOffset--; render(true); },
  'week-next': () => { if (ui.weekOffset < 0) ui.weekOffset++; render(true); },
  'sync-now': () => { sync.run(); },
  'auth-forgot': () => forgotPassword(),
  'gemini-key': () => geminiKeyModal(),
  'gemini-remove': () => { if (confirm('Rimuovere la chiave di Gemini da questo dispositivo?')) { geminiCfg.write({}); render(true); } },
  'change-password': () => passwordModal(false),
  'logout': async () => {
    const unsynced = store.dirty.size;
    if (!confirm(unsynced ? `Ci sono ${unsynced} modifiche non ancora sincronizzate che andranno perse. Uscire comunque?` : 'Uscire dall\'account? I dati restano salvati nel cloud.')) return;
    await sync.client.auth.signOut();
  },
  'export': () => {
    const blob = new Blob([JSON.stringify({ app: 'studyboard', version: 1, exportedAt: new Date().toISOString(), items: Object.values(store.items) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studyboard-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'install': async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    render(true);
  },
  'wipe': () => {
    if (!confirm('Cancellare TUTTI i dati? L\'operazione non si può annullare.')) return;
    if (!confirm('Sei proprio sicuro? Verranno eliminate materie, attività, scadenze, sessioni e note.')) return;
    for (const f of store.all('file')) deleteBlob(f);
    for (const id of Object.keys(store.items)) if (!store.items[id].deleted) store.remove(id, { silent: true });
    render(true);
    toast('Dati cancellati');
  },
  'demo': () => loadDemo(),
  // materiali
  'files-filter': (el) => { ui.filesSubject = el.dataset.subject; saveUi(); render(true); },
  'file-open': (el) => { const f = store.get(el.dataset.id); if (f) openFile(f); },
  'file-edit': (el) => { const f = store.get(el.dataset.id); if (f) fileModal(f); },
  'file-delete': (el) => {
    const f = store.get(el.dataset.id);
    if (!f || !confirm(`Eliminare il file "${f.name}"?`)) return;
    deleteBlob(f);
    store.remove(f.id);
  },
  'file-ask': (el) => {
    const f = store.get(el.dataset.id);
    if (!f) return;
    ui.chatAttachments = [f.id];
    ui.chatDraft = ui.chatDraft || `Fammi un riassunto di "${f.name}" e dimmi quali argomenti devo studiare.`;
    location.hash = '#assistente';
  },
  // assistente
  'chat-suggest': (el) => sendChat(el.dataset.text),
  'chat-attach': () => attachModal(),
  'chat-detach': (el) => { ui.chatAttachments = (ui.chatAttachments || []).filter((id) => id !== el.dataset.id); render(true); },
  'chat-clear': () => { if (confirm('Iniziare una nuova conversazione? Quella attuale verrà cancellata.')) store.put('chat', 'chat', { messages: [] }); },
  'chat-apply': (el) => applyProposals(el.dataset.msg, el.dataset.index === undefined ? null : Number(el.dataset.index)),
  'plan-ask': (el) => {
    const s = store.get(el.dataset.id);
    ui.chatDraft = `Aiutami a riorganizzare il piano di studio di ${s ? s.name : 'questa materia'} in vista della prossima scadenza.`;
    location.hash = '#assistente';
  },
};

const CHANGES = {
  'task-toggle': (el) => {
    const t = store.get(el.dataset.id);
    if (!t) return;
    const done = el.checked;
    store.patch(t.id, { done, completedAt: done ? Date.now() : null });
    if (done) toast('Fatto! ✓');
  },
  'timer-subject': (el) => { ui.timerSubject = el.value; saveUi(); },
  'upload-subject': (el) => { ui.uploadSubject = el.value; saveUi(); },
  'sim': () => updateSim(),
  'exam-subject': (el) => {
    const name = el.form && el.form.elements.name;
    if (name && el.value && (!name.value.trim() || subjects().some((s) => s.name === name.value.trim()))) name.value = subjectName(el.value);
  },
  'file-upload': (el) => {
    const list = el.files;
    if (list && list.length) uploadFiles(list, el.dataset.subject || currentUploadSubject());
    el.value = '';
  },
  'toggle-done': (el) => { ui.showDone = el.checked; saveUi(); render(true); },
  'import': async (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!json || json.app !== 'studyboard' || !Array.isArray(json.items)) throw new Error('formato');
      let n = 0;
      for (const r of json.items) if (r && r.id && r.kind && r.updated_at && store.merge(r, true)) n++;
      store.save();
      changed();
      toast(n ? `Importati ${n} elementi` : 'Niente di nuovo da importare');
    } catch (e) {
      toast('File di backup non valido');
    }
    el.value = '';
  },
};

const FORMS = {
  'quick-task': (form) => {
    const title = form.elements.title.value.trim();
    if (!title) { form.elements.title.focus(); return; }
    store.put('task', uid(), {
      title, subjectId: form.elements.subjectId.value || '', priority: 'media', due: '',
      day: form.dataset.today === '1' ? today() : (form.dataset.day || ''), today: false,
      done: false, completedAt: null, createdAt: Date.now(),
    });
    // Rimetti il focus sul campo per inserirne un'altra di seguito.
    const sel = form.dataset.today === '1' ? '[data-form="quick-task"][data-today="1"] input' : '[data-form="quick-task"]:not([data-today]) input';
    setTimeout(() => $(sel)?.focus(), 0);
  },
  'note-new': (form) => {
    const text = form.elements.text.value.trim();
    if (!text) { form.elements.text.focus(); return; }
    store.put('note', uid(), { text, subjectId: form.elements.subjectId.value || '', pinned: false, createdAt: Date.now() });
  },
  'auth': (form, submitter) => doAuth(form, submitter),
  'chat': (form) => sendChat(form.elements.text.value),
};

function currentUploadSubject() {
  const f = ui.filesSubject;
  if (f && f !== 'all' && f !== 'none' && subjectById(f)) return f;
  return ui.uploadSubject && subjectById(ui.uploadSubject) ? ui.uploadSubject : '';
}

const saveNoteText = debounce((id, text) => store.patch(id, { text }, { silent: true }), 500);

function autosize(el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }
function autosizeAll() { $$('textarea.autosize').forEach(autosize); }

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('textarea.autosize')) autosize(el);
    if (el.dataset.input === 'note-text') saveNoteText(el.dataset.id, el.value);
    if (el.dataset.input === 'chat-draft') ui.chatDraft = el.value;
    if (el.dataset.input === 'sim') updateSim();
  });
  // Invio per mandare il messaggio in chat (Maiusc+Invio per andare a capo), solo con tastiera fisica.
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  // Trascina un'attività su un giorno (vista "Per giorno" del Piano, su PC).
  const dropCol = (e) => (e.target.closest ? e.target.closest('[data-drop-day]') : null);
  document.addEventListener('dragstart', (e) => {
    const row = e.target.closest && e.target.closest('[data-drag-task]');
    if (!row) return;
    e.dataTransfer.setData('text/x-studyboard-task', row.dataset.dragTask);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  document.addEventListener('dragend', () => {
    $$('.dragging').forEach((x) => x.classList.remove('dragging'));
    $$('.day-col.over').forEach((x) => x.classList.remove('over'));
  });
  document.addEventListener('dragover', (e) => {
    const col = dropCol(e);
    if (col && e.dataTransfer.types.includes('text/x-studyboard-task')) { e.preventDefault(); col.classList.add('over'); }
  });
  document.addEventListener('dragleave', (e) => {
    const col = dropCol(e);
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    const col = dropCol(e);
    const id = e.dataTransfer.getData('text/x-studyboard-task');
    if (!col || !id) return;
    e.preventDefault();
    col.classList.remove('over');
    const t = store.get(id);
    if (t && taskDay(t) !== col.dataset.dropDay) setTasksDay([id], col.dataset.dropDay);
  });
  // Trascina e rilascia i file nella sezione Materiali.
  document.addEventListener('dragover', (e) => {
    const z = e.target.closest && e.target.closest('[data-dropzone]');
    if (z) { e.preventDefault(); z.classList.add('over'); }
  });
  document.addEventListener('dragleave', (e) => {
    const z = e.target.closest && e.target.closest('[data-dropzone]');
    if (z && !z.contains(e.relatedTarget)) z.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('[data-dropzone]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, currentUploadSubject());
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    FORMS[form.dataset.form]?.(form, e.submitter);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (pendingRender && !isEditing() && !$('#modal').open) render(); }, 50);
  });
  $('#modal').addEventListener('close', () => { if (pendingRender) setTimeout(() => render(), 0); });
  window.addEventListener('hashchange', () => { closeSheet(); render(true); window.scrollTo(0, 0); });
  // Pannello "Altro": si chiude toccando fuori o premendo Esc.
  document.addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('.sheet-item')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('online', () => sync.run());
  window.addEventListener('offline', () => { if (sync.user) setSyncStatus('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { sync.run(); render(); }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (currentView() === 'impostazioni') render(); });
  setInterval(tickClocks, 1000);
  setInterval(() => { if (document.visibilityState === 'visible') sync.run(); }, 30000);
  // Allo scoccare della mezzanotte aggiorna "oggi".
  let lastDay = today();
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);
}

/* ---------------------------------------------------------------- auth */
function renderAuth(message = '') {
  shellReady = false;
  $('#app').innerHTML = `
    <div class="auth">
      <form class="card auth-card" data-form="auth">
        <div class="brand big">${ic('book')}<span>StudyBoard</span></div>
        <p class="muted">Accedi per sincronizzare il tuo piano di studio su tutti i dispositivi.</p>
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
        <label class="field"><span>Password</span><input type="password" name="password" required minlength="6" autocomplete="current-password"></label>
        <p class="auth-msg ${message ? 'show' : ''}" id="auth-msg">${esc(message)}</p>
        <div class="row gap">
          <button class="btn primary" value="login">Accedi</button>
          <button class="btn ghost" value="signup">Crea account</button>
        </div>
        <button type="button" class="link small auth-forgot" data-action="auth-forgot">Password dimenticata?</button>      </form>
    </div>`;
}

// Indirizzo dell'app, usato nei link delle email (conferma account, recupero password).
const appUrl = () => location.origin + location.pathname;

function authErrorText(e) {
  const m = String((e && e.message) || e);
  return /invalid login/i.test(m) ? 'Email o password non corretti.'
    : /not confirmed/i.test(m) ? 'Devi prima confermare l\'email (controlla la posta, anche nello spam).'
    : /already registered/i.test(m) ? 'Esiste già un account con questa email: usa Accedi.'
    : /rate limit|too many/i.test(m) ? 'Troppe email inviate in poco tempo. Riprova tra un\'ora.'
    : /should be different/i.test(m) ? 'La nuova password deve essere diversa da quella vecchia.'
    : /fetch|network/i.test(m) ? 'Connessione assente. Riprova quando sei online.'
    : m;
}

async function forgotPassword() {
  const form = $('[data-form="auth"]');
  const msg = $('#auth-msg');
  const say = (t) => { msg.textContent = t; msg.classList.add('show'); };
  const email = form.elements.email.value.trim();
  if (!email) { say('Scrivi la tua email qui sopra, poi premi di nuovo "Password dimenticata?".'); form.elements.email.focus(); return; }
  const { error } = await sync.client.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  say(error ? authErrorText(error) : 'Se esiste un account con questa email, ti abbiamo mandato un link per scegliere una nuova password.');
}

function passwordModal(fromRecovery = false) {
  openModal({
    title: fromRecovery ? 'Scegli una nuova password' : 'Cambia password',
    submitLabel: 'Salva password',
    body: `
      ${fromRecovery ? '<p class="muted small">Sei entrato con il link dell\'email. Imposta ora la nuova password.</p>' : ''}
      <label class="field"><span>Nuova password</span><input type="password" name="p1" required minlength="6" autocomplete="new-password" autofocus></label>
      <label class="field"><span>Ripeti la password</span><input type="password" name="p2" required minlength="6" autocomplete="new-password"></label>`,
    onSubmit: (fd) => {
      if (fd.p1.length < 6) { toast('La password deve avere almeno 6 caratteri'); return false; }
      if (fd.p1 !== fd.p2) { toast('Le due password non coincidono'); return false; }
      sync.client.auth.updateUser({ password: fd.p1 }).then(({ error }) => toast(error ? authErrorText(error) : 'Password aggiornata'));
    },
  });
}

async function doAuth(form, submitter) {
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const msg = $('#auth-msg');
  const say = (t) => { msg.textContent = t; msg.classList.add('show'); };
  if (!email || password.length < 6) { say('Inserisci email e una password di almeno 6 caratteri.'); return; }
  const mode = submitter?.value || 'login';
  $$('button', form).forEach((b) => { b.disabled = true; });
  try {
    if (mode === 'signup') {
      const { data, error } = await sync.client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
      if (error) throw error;
      if (!data.session) say('Account creato! Controlla la tua email (anche nello spam) e clicca il link di conferma, poi torna qui e accedi.');
    } else {
      const { error } = await sync.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) {
    say(authErrorText(e));
  } finally {
    $$('button', form).forEach((b) => { b.disabled = false; });
  }
}

function onLogin(user) {
  if (sync.user && sync.user.id === user.id && shellReady) return;
  sync.user = user;
  if (store.owner === 'local' || store.owner === null) {
    // Dati creati in modalità locale: li carichiamo sull'account.
    store.owner = user.id;
    Object.keys(store.items).forEach((id) => store.dirty.add(id));
    store.save();
  } else if (store.owner !== user.id) {
    store.reset(user.id); // un altro utente: non mescolare i dati
  }
  showApp();
  sync.run().then(() => migrateLocalFiles());
}

function onLogout() {
  sync.user = null;
  store.reset(null);
  setSyncStatus('off');
  renderAuth();
}

async function initCloud() {
  sync.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'studyboard.auth' },
  });
  sync.client.auth.onAuthStateChange((event, session) => {
    // Rimandiamo il lavoro fuori dalla callback: chiamare Supabase qui dentro può bloccarlo.
    setTimeout(() => {
      if (event === 'SIGNED_OUT') { onLogout(); return; }
      if (session?.user && (!sync.user || sync.user.id !== session.user.id)) onLogin(session.user);
      if (event === 'PASSWORD_RECOVERY') passwordModal(true);
    }, 0);
  });
  const { data } = await sync.client.auth.getSession();
  if (data.session) onLogin(data.session.user);
  else if (!sync.user) renderAuth();
}

/* ---------------------------------------------------------------- demo */
function loadDemo() {
  const now = new Date();
  const d = (n) => ymd(addDays(now, n));
  const ids = [['Analisi 2', '#6366f1'], ['Fisica 1', '#ec4899'], ['Basi di dati', '#10b981']].map(([name, color], i) => {
    const id = uid();
    store.put('subject', id, { name, color, createdAt: Date.now() + i }, { silent: true });
    return id;
  });
  const tasks = [
    [0, 'Ripassare integrali doppi', 'alta', d(2), true],
    [0, 'Esercizi su serie di funzioni', 'media', d(5), false],
    [0, 'Teoremi di Green e Stokes', 'media', '', false],
    [1, 'Capitolo 5: dinamica del punto', 'alta', d(1), true],
    [1, 'Esercitazione moto circolare', 'media', '', false],
    [2, 'Progetto: schema ER biblioteca', 'alta', d(7), false],
    [2, 'Esercizi SQL con JOIN', 'bassa', '', true],
  ];
  tasks.forEach(([s, title, priority, due, todayFlag], i) => store.put('task', uid(), {
    title, subjectId: ids[s], priority, due, today: todayFlag, done: false, completedAt: null, createdAt: Date.now() + i,
  }, { silent: true }));
  [['Teoria dei limiti', 0], ['Vettori e cinematica', 1], ['Modello relazionale', 2], ['Normalizzazione', 2]].forEach(([title, s], i) =>
    store.put('task', uid(), { title, subjectId: ids[s], priority: 'media', due: '', today: false, done: true, completedAt: Date.now() - (i + 1) * 86400000, createdAt: Date.now() - 20 * 86400000 }, { silent: true }));
  store.put('deadline', uid(), { title: 'Esame di Analisi 2', type: 'esame', subjectId: ids[0], date: d(12), time: '09:00', createdAt: Date.now() }, { silent: true });
  store.put('deadline', uid(), { title: 'Esame di Fisica 1', type: 'esame', subjectId: ids[1], date: d(26), time: '14:30', createdAt: Date.now() }, { silent: true });
  store.put('deadline', uid(), { title: 'Consegna progetto Basi di dati', type: 'consegna', subjectId: ids[2], date: d(9), time: '23:59', createdAt: Date.now() }, { silent: true });
  store.put('deadline', uid(), { title: 'Ricevimento prof. Fisica', type: 'altro', subjectId: ids[1], date: d(3), time: '11:00', createdAt: Date.now() }, { silent: true });
  for (let back = 1; back <= 60; back++) {
    if (back > 4 && Math.random() < 0.35) continue;
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const day = addDays(now, -back);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9 + k * 5 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60)).getTime();
      const ms = (25 + Math.floor(Math.random() * 110)) * 60000;
      store.put('session', uid(), { subjectId: ids[Math.floor(Math.random() * 3)], date: ymd(day), start, end: start + ms, ms }, { silent: true });
    }
  }
  render(true);
  toast('Dati di esempio caricati');
}

/* ---------------------------------------------------------------- boot */
function showApp() {
  if (!shellReady) renderShell();
  render(true);
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non registrato', e));
  }
}

async function boot() {
  store.load();
  bindEvents();
  registerSW();
  if (CLOUD_CONFIGURED) {
    if (!window.supabase) {
      // Libreria non disponibile (es. primo avvio offline): usa i dati locali se ci sono.
      if (store.owner && store.owner !== 'local') { showApp(); setSyncStatus('offline'); }
      else $('#app').innerHTML = '<div class="boot">Serve una connessione a internet per il primo accesso.</div>';
      return;
    }
    try { await initCloud(); } catch (e) {
      console.error(e);
      if (store.owner && store.owner !== 'local') { showApp(); setSyncStatus('error'); } else renderAuth('Impossibile contattare il server. Riprova.');
    }
  } else {
    if (!store.owner) { store.owner = 'local'; store.save(); }
    showApp();
    setSyncStatus('off');
  }
}

boot();
