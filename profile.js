/* =============================================
   FOCUSFLOW – PROFILE PAGE LOGIC
   ============================================= */

const AVATARS = [
  '🧑‍🎓','👩‍🎓','🧑‍💻','👩‍💻','🧑‍🔬','👩‍🔬','🧑‍🏫','👩‍🏫',
  '🦸','🦸‍♀️','🧙','🧙‍♀️','🧝','🧝‍♀️','🥷','🦊',
  '🐺','🦁','🐯','🐻','🐼','🦅','🦋','🌟',
  '🚀','⚡','🔥','💎','🏆','🎯','📚','🎵',
];

function calcLevel(xp) {
  let level = 1, needed = 100;
  while (xp >= needed) { xp -= needed; level++; needed = Math.floor(needed * 1.3); }
  return { level, current: xp, needed };
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Particles ──────────────────────────────
(function() {
  const c = document.getElementById('particles');
  const ctx = c.getContext('2d');
  let W, H, pts = [];
  function resize() { W = c.width = innerWidth; H = c.height = innerHeight; }
  resize(); window.addEventListener('resize', resize);
  for (let i=0;i<45;i++) pts.push({x:Math.random()*1920,y:Math.random()*1080,r:Math.random()*1.3+0.3,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,o:Math.random()*.3+.04});
  function draw() {
    ctx.clearRect(0,0,W,H);
    pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(124,58,237,${p.o})`;ctx.fill();});
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Auth guard
  if (!requireAuth()) return;

  const user = getCurrentUser();

  // Load theme
  const theme = localStorage.getItem(`ff_theme_${user.id}`) || 'violet';
  document.documentElement.setAttribute('data-theme', theme);

  // Populate identity fields
  document.getElementById('pfName').value    = user.name    || '';
  document.getElementById('pfUsername').value= user.username|| '';
  document.getElementById('pfBio').value     = user.bio     || '';
  document.getElementById('pfEmail').value   = user.email   || '';
  document.getElementById('avatarDisplay').textContent = user.avatar || '🧑‍🎓';
  document.getElementById('avatarName').textContent    = user.name   || 'No Name';
  document.getElementById('avatarEmail').textContent   = user.email  || '';

  // XP / Level
  const state = getUserState(user.id);
  const { level } = calcLevel(state.xp || 0);
  document.getElementById('avatarLevel').textContent = `Level ${level}`;
  document.getElementById('avatarXP').textContent    = `${state.xp || 0} XP`;

  // Study prefs
  document.getElementById('pfSubject').value    = user.subject    || '';
  document.getElementById('pfSchedule').value   = user.schedule   || 'morning';
  document.getElementById('pfDailyGoal').value  = user.dailyGoal  || 8;
  document.getElementById('pfFocusStyle').value = user.focusStyle || 'pomodoro';

  // Stats
  document.getElementById('psTotalSessions').textContent = state.totalSessions  || 0;
  document.getElementById('psTodaySessions').textContent = state.todaySessions  || 0;
  document.getElementById('psMinutes').textContent       = (state.todayMinutes  || 0) + 'm';
  document.getElementById('psTasks').textContent         = state.tasksCompleted || 0;
  document.getElementById('psStreak').textContent        = (state.streak || 1) + '🔥';
  document.getElementById('psLevel').textContent         = level;

  // Build emoji picker
  const picker = document.getElementById('emojiPicker');
  AVATARS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-opt'; btn.textContent = emoji;
    btn.addEventListener('click', () => {
      document.getElementById('avatarDisplay').textContent = emoji;
      picker.classList.remove('open');
    });
    picker.appendChild(btn);
  });

  // Toggle emoji picker
  document.getElementById('avatarDisplay').addEventListener('click', () => {
    picker.classList.toggle('open');
  });

  // ── Save identity ──
  document.getElementById('saveIdentity').addEventListener('click', () => {
    const name   = document.getElementById('pfName').value.trim();
    const uname  = document.getElementById('pfUsername').value.trim().replace(/^@/,'');
    const bio    = document.getElementById('pfBio').value.trim();
    const avatar = document.getElementById('avatarDisplay').textContent;

    if (!name) { showToast('Name cannot be empty!'); return; }

    updateUserProfile({ name, username: uname, bio, avatar });
    document.getElementById('avatarName').textContent = name;
    showToast('Profile saved! ✅');
  });

  // ── Save preferences ──
  document.getElementById('savePrefs').addEventListener('click', () => {
    const subject    = document.getElementById('pfSubject').value.trim();
    const schedule   = document.getElementById('pfSchedule').value;
    const dailyGoal  = +document.getElementById('pfDailyGoal').value;
    const focusStyle = document.getElementById('pfFocusStyle').value;

    // Update daily goal in cfg too
    const cfgKey = `ff_cfg_${user.id}`;
    try {
      const cfg = JSON.parse(localStorage.getItem(cfgKey)) || {};
      cfg.dailyGoal = dailyGoal;

      // Apply preset durations for focus style
      if (focusStyle === 'deep')     { cfg.focusMins = 50; cfg.shortMins = 10; cfg.longMins = 20; }
      else if (focusStyle === 'light') { cfg.focusMins = 15; cfg.shortMins = 3;  cfg.longMins = 10; }
      else if (focusStyle === 'pomodoro') { cfg.focusMins = 25; cfg.shortMins = 5; cfg.longMins = 15; }
      localStorage.setItem(cfgKey, JSON.stringify(cfg));
    } catch {}

    updateUserProfile({ subject, schedule, dailyGoal, focusStyle });
    showToast('Preferences saved! ⚙️');
  });

  // ── Change password ──
  document.getElementById('changePassBtn').addEventListener('click', async () => {
    const current = document.getElementById('pfCurrentPass').value;
    const newPass  = document.getElementById('pfNewPass').value;
    if (!current || !newPass) { showToast('Fill in both password fields!'); return; }
    try {
      await changePassword(current, newPass);
      document.getElementById('pfCurrentPass').value = '';
      document.getElementById('pfNewPass').value = '';
      showToast('Password changed! 🔒');
    } catch(e) { showToast('❌ ' + e.message); }
  });

  // ── Logout ──
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) authLogout();
  });

  // ── Delete account ──
  document.getElementById('deleteAccountBtn').addEventListener('click', () => {
    const ok = confirm('⚠️ This will permanently delete your account and all data. Are you absolutely sure?');
    if (!ok) return;
    const ok2 = confirm('Last chance! All your progress, tasks, and achievements will be gone forever.');
    if (ok2) deleteAccount();
  });
});

function getUserState(userId) {
  try { return JSON.parse(localStorage.getItem(`ff_state_${userId}`)) || {}; } catch { return {}; }
}
