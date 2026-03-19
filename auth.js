/* =============================================
   FOCUSFLOW – AUTH SYSTEM (localStorage-based)
   ============================================= */

const AUTH_USERS_KEY = 'ff_users';
const AUTH_SESSION_KEY = 'ff_session';

// ── Helpers ──────────────────────────────────

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'ff_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || {}; } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

// ── Public API ────────────────────────────────

async function authRegister(name, email, password) {
  const users = getUsers();
  const emailKey = email.toLowerCase().trim();

  if (users[emailKey]) {
    throw new Error('An account with this email already exists.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const id = generateId();
  const hash = await hashPassword(password);

  users[emailKey] = {
    id,
    name: name.trim(),
    email: emailKey,
    passwordHash: hash,
    createdAt: Date.now(),
    avatar: '🧑‍🎓',
    username: '',
    bio: '',
    subject: '',
    schedule: 'morning',
  };
  saveUsers(users);

  // Start session
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ id, email: emailKey }));
  return users[emailKey];
}

async function authLogin(email, password) {
  const users = getUsers();
  const emailKey = email.toLowerCase().trim();
  const user = users[emailKey];

  if (!user) throw new Error('No account found with this email.');

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) throw new Error('Incorrect password.');

  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ id: user.id, email: emailKey }));
  return user;
}

function authLogout() {
  localStorage.removeItem(AUTH_SESSION_KEY);
  window.location.href = 'login.html';
}

function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY));
    if (!session) return null;
    const users = getUsers();
    return users[session.email] || null;
  } catch { return null; }
}

function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function requireGuest() {
  if (getCurrentUser()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ── User-scoped localStorage key helper ───────
function userKey(name) {
  const user = getCurrentUser();
  if (!user) return `ff_${name}_guest`;
  return `ff_${name}_${user.id}`;
}

function updateUserProfile(fields) {
  const users = getUsers();
  const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY));
  if (!session) return;
  const user = users[session.email];
  if (!user) return;
  Object.assign(user, fields);
  saveUsers(users);
}

async function changePassword(currentPassword, newPassword) {
  const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY));
  const users = getUsers();
  const user = users[session.email];

  const currentHash = await hashPassword(currentPassword);
  if (currentHash !== user.passwordHash) throw new Error('Current password is incorrect.');
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

  user.passwordHash = await hashPassword(newPassword);
  saveUsers(users);
}

function deleteAccount() {
  const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY));
  const users = getUsers();
  const user = users[session.email];
  if (!user) return;

  // Remove all user data
  const id = user.id;
  ['state', 'tasks', 'cfg', 'theme'].forEach(k => {
    localStorage.removeItem(`ff_${k}_${id}`);
  });
  delete users[session.email];
  saveUsers(users);
  localStorage.removeItem(AUTH_SESSION_KEY);
  window.location.href = 'login.html';
}
