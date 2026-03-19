/* =====================================================
   FOCUSFLOW – COMPLETE APP JAVASCRIPT
   ===================================================== */

// ────────────────────────────────────────────────────
// STATE & CONFIG
// ────────────────────────────────────────────────────
const THEMES = ['violet','ocean','sunset','forest'];

let cfg = loadCfg();
let state = loadState();
let tasks = loadTasks();

let timerInterval = null;
let secondsLeft = 0;
let totalSeconds = 0;
let isRunning = false;
let currentMode = 'focus';  // 'focus' | 'short' | 'long'
let sessionsDone = 0;       // sessions in current cycle
let currentSound = null;
let audioCtx = null;
let ambientNodes = [];
let activeTaskId = null;
let focusModeOn = false;
let breatheInterval = null;

const CIRCUMFERENCE = 2 * Math.PI * 130; // r=130

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Focus on being productive instead of busy.",
  "One task at a time — that's mastery.",
  "Your future self will thank you.",
  "Deep work is the superpower of the 21st century.",
  "Do the hard thing first.",
  "Every minute of focus counts.",
  "Discipline is choosing between what you want now and what you want most.",
  "Small steps every day lead to big results.",
  "You don't have to be great to start, but you have to start to be great.",
  "The quality of your work is determined by the depth of your focus.",
  "Concentrate all your thoughts upon the work at hand.",
];

const ACHIEVEMENTS = [
  { id:'first_session', icon:'🚀', name:'Lift Off',       desc:'Complete your first session',       check: s => s.totalSessions >= 1 },
  { id:'five_sessions', icon:'🔥', name:'On Fire',        desc:'Complete 5 sessions',               check: s => s.totalSessions >= 5 },
  { id:'ten_sessions',  icon:'⚡', name:'Flow State',     desc:'Complete 10 sessions',              check: s => s.totalSessions >= 10 },
  { id:'fifty_sessions',icon:'💎', name:'Diamond Mind',   desc:'Complete 50 sessions',              check: s => s.totalSessions >= 50 },
  { id:'first_task',    icon:'✅', name:'Task Master',    desc:'Complete your first task',          check: s => s.tasksCompleted >= 1 },
  { id:'ten_tasks',     icon:'📋', name:'List Legend',    desc:'Complete 10 tasks',                 check: s => s.tasksCompleted >= 10 },
  { id:'level5',        icon:'🏅', name:'Level 5',        desc:'Reach level 5',                    check: s => calcLevel(s.xp).level >= 5 },
  { id:'level10',       icon:'🏆', name:'Level 10',       desc:'Reach level 10',                   check: s => calcLevel(s.xp).level >= 10 },
  { id:'streak3',       icon:'📅', name:'Consistent',     desc:'3 day streak',                     check: s => s.streak >= 3 },
  { id:'streak7',       icon:'🗓️', name:'Week Warrior',   desc:'7 day streak',                     check: s => s.streak >= 7 },
  { id:'goal_reached',  icon:'🎯', name:'Goal Getter',    desc:'Hit daily session goal',            check: s => s.todaySessions >= cfg.dailyGoal },
  { id:'early_bird',    icon:'🌅', name:'Early Bird',     desc:'Start a session before 8 AM',      check: s => s.earlyBird },
];

// ────────────────────────────────────────────────────
// PERSISTENCE  (per-user scoped via userKey() from auth.js)
// ────────────────────────────────────────────────────
function loadCfg() {
  try { return JSON.parse(localStorage.getItem(userKey('cfg'))) || {}; } catch { return {}; }
}
function saveCfg() { localStorage.setItem(userKey('cfg'), JSON.stringify(cfg)); }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(userKey('state'))) || {};
    const today = dateKey();
    if (s.lastDate !== today) {
      s.streak = (s.lastDate === prevDateKey()) ? (s.streak || 0) + 1 : 1;
      s.todaySessions = 0;
      s.todayMinutes = 0;
      s.lastDate = today;
    }
    return {
      totalSessions:  s.totalSessions  || 0,
      tasksCompleted: s.tasksCompleted || 0,
      xp:             s.xp             || 0,
      streak:         s.streak         || 1,
      todaySessions:  s.todaySessions  || 0,
      todayMinutes:   s.todayMinutes   || 0,
      lastDate:       today,
      weekSessions:   s.weekSessions   || [0,0,0,0,0,0,0],
      unlockedAchs:   s.unlockedAchs   || [],
      earlyBird:      s.earlyBird      || false,
    };
  } catch { return { totalSessions:0,tasksCompleted:0,xp:0,streak:1,todaySessions:0,todayMinutes:0,lastDate:dateKey(),weekSessions:[0,0,0,0,0,0,0],unlockedAchs:[],earlyBird:false }; }
}
function saveState() { localStorage.setItem(userKey('state'), JSON.stringify(state)); }
function loadTasks() {
  try { return JSON.parse(localStorage.getItem(userKey('tasks'))) || []; } catch { return []; }
}
function saveTasks() { localStorage.setItem(userKey('tasks'), JSON.stringify(tasks)); }
function dateKey() { return new Date().toISOString().slice(0,10); }
function prevDateKey() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}

// ────────────────────────────────────────────────────
// XP / LEVELS
// ────────────────────────────────────────────────────
function calcLevel(xp) {
  let level = 1, needed = 100;
  while (xp >= needed) { xp -= needed; level++; needed = Math.floor(needed * 1.3); }
  return { level, current: xp, needed };
}

function addXP(amount) {
  const before = calcLevel(state.xp);
  state.xp += amount;
  const after = calcLevel(state.xp);
  if (after.level > before.level) showToast(`🎉 Level Up! You're now Level ${after.level}!`);
  saveState();
  renderXP();
}

function renderXP() {
  const { level, current, needed } = calcLevel(state.xp);
  document.getElementById('xpLevel').textContent = `Lv ${level}`;
  document.getElementById('xpFill').style.width = `${(current/needed)*100}%`;
  document.getElementById('xpLabel').textContent = `${current} / ${needed} XP`;
}

// ────────────────────────────────────────────────────
// TIMER CORE
// ────────────────────────────────────────────────────
function getModeDuration(mode) {
  const m = { focus: cfg.focusMins||25, short: cfg.shortMins||5, long: cfg.longMins||15 };
  return m[mode] * 60;
}

function getModeLabel(mode) {
  return { focus:'Focus Time', short:'Short Break', long:'Long Break' }[mode];
}

function initTimer(mode) {
  isRunning = false;
  clearInterval(timerInterval);
  currentMode = mode;
  totalSeconds = getModeDuration(mode);
  secondsLeft = totalSeconds;
  updateTimerDisplay();
  setRingProgress(1);
  document.getElementById('timerLabel').textContent = getModeLabel(mode);
  document.getElementById('playIcon').textContent = '▶';
  document.getElementById('timerContainer').classList.remove('running');
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  document.getElementById('playIcon').textContent = '⏸';
  document.getElementById('timerContainer').classList.add('running');

  // Early bird check
  if (new Date().getHours() < 8) { state.earlyBird = true; saveState(); }

  timerInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft < 0) { secondsLeft = 0; onTimerEnd(); return; }
    updateTimerDisplay();
    setRingProgress(secondsLeft / totalSeconds);
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  document.getElementById('playIcon').textContent = '▶';
  document.getElementById('timerContainer').classList.remove('running');
}

function toggleTimer() {
  isRunning ? pauseTimer() : startTimer();
}

function resetTimer() {
  pauseTimer();
  secondsLeft = totalSeconds;
  updateTimerDisplay();
  setRingProgress(1);
}

function skipToNext() {
  pauseTimer();
  if (currentMode === 'focus') {
    sessionsDone++;
    if (sessionsDone >= (cfg.sessionsBeforeLong || 4)) {
      sessionsDone = 0;
      initTimer('long');
    } else {
      initTimer('short');
    }
    if (cfg.autoBreak) startTimer();
  } else {
    initTimer('focus');
  }
  updateModeTabs();
}

function onTimerEnd() {
  pauseTimer();
  playNotifSound();

  if (currentMode === 'focus') {
    const mins = (cfg.focusMins || 25);
    state.totalSessions++;
    state.todaySessions++;
    state.todayMinutes += mins;
    const dayIdx = new Date().getDay(); // 0=Sun
    state.weekSessions[dayIdx] = (state.weekSessions[dayIdx] || 0) + 1;
    saveState();
    addXP(50);

    // Credit pomodoro to active task
    if (activeTaskId) {
      const t = tasks.find(t => t.id === activeTaskId);
      if (t) { t.pomodoros = (t.pomodoros||0)+1; saveTasks(); renderTasks(); }
    }

    showToast(`✅ Focus session done! +50 XP`);
    checkAchievements();
    updateDailyGoal();
    sessionsDone++;
    if (sessionsDone >= (cfg.sessionsBeforeLong||4)) {
      sessionsDone = 0;
      initTimer('long');
    } else {
      initTimer('short');
    }
    if (cfg.autoBreak) startTimer();
  } else {
    showToast("Break's over! Time to focus 🎯");
    initTimer('focus');
  }

  updateModeTabs();
  renderSessionDots();
  updateModeTabs();
  changeQuote();
}

function updateTimerDisplay() {
  const m = String(Math.floor(secondsLeft / 60)).padStart(2,'0');
  const s = String(secondsLeft % 60).padStart(2,'0');
  document.getElementById('timerDisplay').textContent = `${m}:${s}`;
  document.title = `${m}:${s} – FocusFlow`;
}

function setRingProgress(fraction) {
  const offset = CIRCUMFERENCE * (1 - fraction);
  document.getElementById('ringProgress').style.strokeDashoffset = offset;
  document.getElementById('ringProgress').style.strokeDasharray = CIRCUMFERENCE;
}

function updateModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === currentMode);
  });
}

// ────────────────────────────────────────────────────
// SESSION DOTS
// ────────────────────────────────────────────────────
function renderSessionDots() {
  const max = cfg.sessionsBeforeLong || 4;
  const el = document.getElementById('sessionDots');
  el.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const dot = document.createElement('div');
    dot.className = 'session-dot' + (i < sessionsDone ? ' done' : '');
    el.appendChild(dot);
  }
}

// ────────────────────────────────────────────────────
// TASKS
// ────────────────────────────────────────────────────
let taskFilter = 'all';

function addTask() {
  const input = document.getElementById('taskInput');
  const name = input.value.trim();
  if (!name) return;
  const priority = document.getElementById('prioritySelect').value;
  const task = { id: Date.now().toString(), name, priority, done: false, pomodoros: 0 };
  tasks.unshift(task);
  saveTasks();
  input.value = '';
  renderTasks();
  showToast('Task added! 📝');
}

function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) { state.tasksCompleted++; saveState(); addXP(20); checkAchievements(); showToast('Task completed! +20 XP ✅'); }
  saveTasks();
  renderTasks();
  updateTaskCount();
}

function deleteTask(id) {
  if (activeTaskId === id) { activeTaskId = null; updateActiveTaskPill(); }
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

function setActiveTask(id) {
  activeTaskId = activeTaskId === id ? null : id;
  updateActiveTaskPill();
  renderTasks();
}

function updateActiveTaskPill() {
  const pill = document.getElementById('activeTaskPill');
  const t = tasks.find(t => t.id === activeTaskId);
  if (t) { pill.style.display = ''; document.getElementById('activeTaskName').textContent = `🎯 ${t.name}`; }
  else { pill.style.display = 'none'; }
}

function renderTasks() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyMsg');
  let filtered = tasks;
  if (taskFilter === 'active') filtered = tasks.filter(t => !t.done);
  else if (taskFilter === 'done')  filtered = tasks.filter(t => t.done);
  else if (taskFilter === 'high')  filtered = tasks.filter(t => t.priority === 'high');

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.appendChild(empty || createEmptyMsg());
    document.getElementById('emptyMsg') && (document.getElementById('emptyMsg').style.display = '');
    updateTaskCount();
    return;
  }

  filtered.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task-item' + (t.done ? ' done' : '') + (t.id === activeTaskId ? ' active-focus' : '');
    li.innerHTML = `
      <div class="task-check ${t.done ? 'checked':''}" data-id="${t.id}"></div>
      <span class="task-name">${escHtml(t.name)}</span>
      <div class="task-meta">
        <span class="task-priority priority-${t.priority}">${{high:'🔴 High',med:'🟡 Med',low:'🟢 Low'}[t.priority]}</span>
        ${t.pomodoros > 0 ? `<span class="task-pomodoros">🍅×${t.pomodoros}</span>` : ''}
        <button class="task-focus-btn" data-id="${t.id}">${t.id === activeTaskId ? '⭐ Active':'🎯 Focus'}</button>
        <button class="task-delete" data-id="${t.id}">✕</button>
      </div>`;
    list.appendChild(li);
  });

  list.querySelectorAll('.task-check').forEach(el => el.addEventListener('click', () => toggleTask(el.dataset.id)));
  list.querySelectorAll('.task-delete').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); deleteTask(el.dataset.id); }));
  list.querySelectorAll('.task-focus-btn').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); setActiveTask(el.dataset.id); }));
  updateTaskCount();
}

function createEmptyMsg() {
  const li = document.createElement('li'); li.id='emptyMsg'; li.className='empty-tasks'; li.textContent='✨ Add your first task above!'; return li;
}

function updateTaskCount() {
  const done = tasks.filter(t => t.done).length;
  document.getElementById('taskCount').textContent = `${done} / ${tasks.length} done`;
}

function clearDone() {
  tasks = tasks.filter(t => !t.done);
  if (tasks.findIndex(t => t.id === activeTaskId) === -1) { activeTaskId = null; updateActiveTaskPill(); }
  saveTasks();
  renderTasks();
  showToast('Cleared completed tasks!');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ────────────────────────────────────────────────────
// ACHIEVEMENTS
// ────────────────────────────────────────────────────
function checkAchievements() {
  ACHIEVEMENTS.forEach(ach => {
    if (!state.unlockedAchs.includes(ach.id) && ach.check(state)) {
      state.unlockedAchs.push(ach.id);
      saveState();
      showAchievementPopup(ach);
      renderBadges();
    }
  });
}

function renderBadges() {
  const grid = document.getElementById('badgesGrid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(ach => {
    const unlocked = state.unlockedAchs.includes(ach.id);
    const div = document.createElement('div');
    div.className = 'badge-item' + (unlocked ? ' unlocked':'');
    div.title = ach.desc;
    div.innerHTML = `<div class="badge-icon">${ach.icon}</div><div class="badge-name">${ach.name}</div>`;
    grid.appendChild(div);
  });
}

function showAchievementPopup(ach) {
  const p = document.getElementById('achPopup');
  document.getElementById('achPopupIcon').textContent = ach.icon;
  document.getElementById('achPopupTitle').textContent = '🏆 ' + ach.name;
  document.getElementById('achPopupDesc').textContent = ach.desc;
  p.classList.add('show');
  setTimeout(() => p.classList.remove('show'), 4000);
}

// ────────────────────────────────────────────────────
// DAILY GOAL
// ────────────────────────────────────────────────────
function updateDailyGoal() {
  const goal = cfg.dailyGoal || 8;
  const done = state.todaySessions;
  document.getElementById('goalProgress').textContent = `${done} / ${goal} sessions`;
  document.getElementById('goalFill').style.width = `${Math.min(100,(done/goal)*100)}%`;
}

// ────────────────────────────────────────────────────
// SOUND ENGINE (Web Audio API – no files needed)
// ────────────────────────────────────────────────────
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function stopAmbient() {
  ambientNodes.forEach(n => { try { n.stop(); } catch {} });
  ambientNodes = [];
}

function playAmbient(type) {
  stopAmbient();
  if (type === 'none') return;
  const ctx = getAudioCtx();
  const master = ctx.createGain(); master.gain.value = 0.12; master.connect(ctx.destination);

  if (type === 'whitenoise') {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=1200;
    src.connect(filter); filter.connect(master); src.start();
    ambientNodes.push(src);
    return;
  }

  // Layered oscillator noise for rain / ocean / forest
  const makeNoise = (freq, q=1, gain=0.05) => {
    const bufSize = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) d[i]=Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q;
    const g = ctx.createGain(); g.gain.value=gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    ambientNodes.push(src);
  };

  if (type === 'rain') {
    makeNoise(600,0.5,0.4); makeNoise(1200,0.3,0.25); makeNoise(200,0.8,0.2);
    // Add random drip pings
    let interval = setInterval(() => {
      if (ambientNodes.length === 0) { clearInterval(interval); return; }
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 800 + Math.random()*400;
      g.gain.setValueAtTime(0.03, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.3);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.3);
    }, 400 + Math.random()*600);
    ambientNodes.push({ stop: () => clearInterval(interval) });
  } else if (type === 'ocean') {
    makeNoise(300,0.4,0.35); makeNoise(150,0.6,0.3); makeNoise(80,1,0.15);
    const lfo = ctx.createOscillator(); const lfoG = ctx.createGain();
    lfo.frequency.value=0.15; lfoG.gain.value=0.08;
    lfo.connect(lfoG); lfoG.connect(master.gain);
    lfo.start(); ambientNodes.push(lfo);
  } else if (type === 'forest') {
    makeNoise(2000,2,0.1); makeNoise(4000,3,0.06); makeNoise(800,1,0.08);
    // Chirps
    let chirp = setInterval(() => {
      if (ambientNodes.length===0) { clearInterval(chirp); return; }
      [1200,1400,1600].forEach((f,i) => {
        const o=ctx.createOscillator(); const g=ctx.createGain();
        o.frequency.value=f; o.type='sine';
        const t=ctx.currentTime+i*0.05;
        g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.02,t+0.05); g.gain.exponentialRampToValueAtTime(0.0001,t+0.2);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+0.2);
      });
    }, 2000+Math.random()*3000);
    ambientNodes.push({ stop: ()=>clearInterval(chirp) });
  }
}

function playNotifSound() {
  if (!cfg.notifSound && cfg.notifSound !== undefined) return;
  const ctx = getAudioCtx();
  [0, 0.25, 0.5].forEach((delay, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = [523, 659, 784][i];
    o.type = 'sine';
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + delay + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.5);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + 0.5);
  });
}

// ────────────────────────────────────────────────────
// PARTICLES CANVAS
// ────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    particles.push({ x: Math.random()*1920, y: Math.random()*1080, r: Math.random()*1.5+0.3, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3, o:Math.random()*0.4+0.05 });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const root = getComputedStyle(document.documentElement);
    const c1 = root.getPropertyValue('--accent1').trim() || '#7c3aed';
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = c1 + Math.floor(p.o*255).toString(16).padStart(2,'0');
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ────────────────────────────────────────────────────
// STATS MODAL
// ────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('stToday').textContent   = state.todaySessions;
  document.getElementById('stMinutes').textContent = state.todayMinutes + 'm';
  document.getElementById('stTasks').textContent   = state.tasksCompleted;
  document.getElementById('stStreak').textContent  = state.streak + '🔥';
  document.getElementById('stTotal').textContent   = state.totalSessions;
  document.getElementById('stLevel').textContent   = calcLevel(state.xp).level;

  // Chart
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date().getDay();
  const bars = document.getElementById('chartBars');
  const daysEl = document.getElementById('chartDays');
  bars.innerHTML = ''; daysEl.innerHTML = '';
  const max = Math.max(...state.weekSessions, 1);
  state.weekSessions.forEach((v, i) => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar' + (i === today ? ' today':'');
    bar.style.height = `${Math.max(4,(v/max)*96)}px`;
    bar.title = `${v} sessions`;
    bars.appendChild(bar);
    const d = document.createElement('div');
    d.className = 'chart-day'; d.textContent = days[i];
    daysEl.appendChild(d);
  });
}

// ────────────────────────────────────────────────────
// SETTINGS
// ────────────────────────────────────────────────────
function loadSettingsUI() {
  document.getElementById('setFocus').value   = cfg.focusMins   || 25;
  document.getElementById('setShort').value   = cfg.shortMins   || 5;
  document.getElementById('setLong').value    = cfg.longMins    || 15;
  document.getElementById('setSessions').value= cfg.sessionsBeforeLong || 4;
  document.getElementById('setGoal').value    = cfg.dailyGoal   || 8;
  document.getElementById('setAutoBreak').checked   = !!cfg.autoBreak;
  document.getElementById('setNotifSound').checked  = cfg.notifSound !== false;
  document.getElementById('setBreathing').checked   = cfg.breathing !== false;
}
function saveSettingsUI() {
  cfg.focusMins           = +document.getElementById('setFocus').value;
  cfg.shortMins           = +document.getElementById('setShort').value;
  cfg.longMins            = +document.getElementById('setLong').value;
  cfg.sessionsBeforeLong  = +document.getElementById('setSessions').value;
  cfg.dailyGoal           = +document.getElementById('setGoal').value;
  cfg.autoBreak           = document.getElementById('setAutoBreak').checked;
  cfg.notifSound          = document.getElementById('setNotifSound').checked;
  cfg.breathing           = document.getElementById('setBreathing').checked;
  saveCfg();
  pauseTimer();
  initTimer(currentMode);
  renderSessionDots();
  updateDailyGoal();
  closeModal('settingsModal');
  showToast('Settings saved! ⚙️');
}

// ────────────────────────────────────────────────────
// BREATHING GUIDE
// ────────────────────────────────────────────────────
let breathePhase = 0; // 0=inhale 1=hold 2=exhale
const breatheLabels = ['Inhale...','Hold...','Exhale...'];
const breatheTimes = [4000, 4000, 6000];

function openBreathe() {
  document.getElementById('breatheOverlay').classList.add('open');
  breathePhase = 0;
  runBreathe();
}
function closeBreathe() {
  document.getElementById('breatheOverlay').classList.remove('open');
  clearTimeout(breatheInterval);
}
function runBreathe() {
  document.getElementById('breatheText').textContent = breatheLabels[breathePhase];
  breatheInterval = setTimeout(() => {
    breathePhase = (breathePhase+1) % 3;
    runBreathe();
  }, breatheTimes[breathePhase]);
}

// ────────────────────────────────────────────────────
// THEMES
// ────────────────────────────────────────────────────
let themeIdx = 0;
function cycleTheme() {
  themeIdx = (themeIdx+1) % THEMES.length;
  document.documentElement.setAttribute('data-theme', THEMES[themeIdx]);
  showToast(`Theme: ${THEMES[themeIdx].charAt(0).toUpperCase()+THEMES[themeIdx].slice(1)} 🎨`);
  localStorage.setItem(userKey('theme'), THEMES[themeIdx]);
}
function loadTheme() {
  const saved = localStorage.getItem(userKey('theme')) || 'violet';
  themeIdx = THEMES.indexOf(saved);
  if (themeIdx < 0) themeIdx = 0;
  document.documentElement.setAttribute('data-theme', saved);
}

// ────────────────────────────────────────────────────
// QUOTES
// ────────────────────────────────────────────────────
function changeQuote() {
  const el = document.getElementById('quoteText');
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = QUOTES[Math.floor(Math.random()*QUOTES.length)];
    el.style.transition = 'opacity 0.8s';
    el.style.opacity = 1;
  }, 300);
}

// ────────────────────────────────────────────────────
// TOAST
// ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ────────────────────────────────────────────────────
// MODALS
// ────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ────────────────────────────────────────────────────
// TICK MARKS ON SVG
// ────────────────────────────────────────────────────
function drawTicks() {
  const g = document.getElementById('tickMarks');
  const cx = 150, cy = 150, r1 = 140, r2 = 146;
  for (let i=0; i<60; i++) {
    const angle = (i/60)*Math.PI*2 - Math.PI/2;
    const x1 = cx+Math.cos(angle)*r1, y1 = cy+Math.sin(angle)*r1;
    const x2 = cx+Math.cos(angle)*r2, y2 = cy+Math.sin(angle)*r2;
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',x1); line.setAttribute('y1',y1);
    line.setAttribute('x2',x2); line.setAttribute('y2',y2);
    line.setAttribute('stroke', i%5===0 ? 'rgba(255,255,255,0.25)':'rgba(255,255,255,0.07)');
    line.setAttribute('stroke-width', i%5===0?2:1);
    g.appendChild(line);
  }
}

// ────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space')   { e.preventDefault(); toggleTimer(); }
  if (e.key  === 'r' || e.key === 'R') resetTimer();
  if (e.key  === 's' || e.key === 'S') skipToNext();
  if (e.key  === 'f' || e.key === 'F') toggleFocusMode();
});

function toggleFocusMode() {
  focusModeOn = !focusModeOn;
  document.body.classList.toggle('focus-mode', focusModeOn);
  showToast(focusModeOn ? '🎯 Focus mode ON (press F to exit)' : 'Focus mode OFF');
}

// ────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────
function initUserPill() {
  const user = getCurrentUser();
  if (!user) return;
  document.getElementById('headerAvatar').textContent = user.avatar || '🧑‍🎓';
  document.getElementById('headerName').textContent   = user.name  || 'User';

  // Toggle dropdown
  const pill    = document.getElementById('userPill');
  const dropdown= document.getElementById('userDropdown');
  pill.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  // Logout
  document.getElementById('headerLogout').addEventListener('click', () => {
    if (confirm('Log out of FocusFlow?')) authLogout();
  });
}

function init() {
  // Auth guard – redirect to login if not signed in
  if (!requireAuth()) return;

  loadTheme();
  initUserPill();
  loadSettingsUI();
  initTimer('focus');
  drawTicks();
  renderSessionDots();
  renderTasks();
  renderBadges();
  renderXP();
  updateDailyGoal();
  changeQuote();
  setInterval(changeQuote, 30000);
  initParticles();

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => { initTimer(tab.dataset.mode); updateModeTabs(); });
  });

  // Timer controls
  document.getElementById('playBtn').addEventListener('click', toggleTimer);
  document.getElementById('resetBtn').addEventListener('click', resetTimer);
  document.getElementById('skipBtn').addEventListener('click', skipToNext);

  // Sound
  document.querySelectorAll('.sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSound = btn.dataset.sound;
      playAmbient(currentSound);
    });
  });

  // Task actions
  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  document.getElementById('taskInput').addEventListener('keydown', e => e.key === 'Enter' && addTask());
  document.getElementById('clearDoneBtn').addEventListener('click', clearDone);

  // Task filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      taskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  // Modals
  document.getElementById('statsBtn').addEventListener('click', () => { renderStats(); openModal('statsModal'); });
  document.getElementById('settingsBtn').addEventListener('click', () => { loadSettingsUI(); openModal('settingsModal'); });
  document.getElementById('closeStats').addEventListener('click', () => closeModal('statsModal'));
  document.getElementById('closeSettings').addEventListener('click', () => closeModal('settingsModal'));
  document.getElementById('saveSettings').addEventListener('click', saveSettingsUI);
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if(e.target===m) m.classList.remove('open'); }));

  // Breathing
  document.getElementById('breatheBtn').addEventListener('click', openBreathe);
  document.getElementById('breatheOverlay').addEventListener('click', closeBreathe);

  // Theme
  document.getElementById('themeBtn').addEventListener('click', cycleTheme);
}

document.addEventListener('DOMContentLoaded', init);
