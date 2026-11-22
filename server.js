'use strict';
// Zero-dependency Node.js HTTP server (Node 22+ with --experimental-sqlite).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, verifyPassword } = require('./db');

// Configuration is optional; normal local startup needs no configuration.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_BODY = 20 * 1024;
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.html': ['admin.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/site.js': ['site.js', 'text/javascript; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8']
};
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

class ValidationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const bad = (message, status = 400) => { throw new ValidationError(message, status); };
function send(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function requiredStr(value, field, max, required = true) {
  if (typeof value !== 'string') bad(`${field} must be text.`);
  const s = value.trim();
  if ((required && !s) || s.length > max) bad(`${field} must be ${required ? '1' : '0'}–${max} characters.`);
  return s;
}
function email(value) {
  const s = requiredStr(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad('Enter a valid email address.');
  return s;
}
function webUrl(value, name) {
  const s = requiredStr(value, name, 600, false);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') bad(`${name} must be an http(s) URL.`);
    return u.href;
  } catch { bad(`${name} must be an http(s) URL.`); }
}
function checkDate(value) {
  const d = requiredStr(value || '', 'Date', 10, false);
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(`${d}T00:00:00Z`)) ||
      new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) {
    bad('Date must be valid YYYY-MM-DD.');
  }
  return d;
}
const contentTypes = {
  events: {
    columns: ['title', 'type', 'date', 'location', 'description', 'link', 'featured'],
    validate(d) { return [requiredStr(d.title, 'Title', 110), requiredStr(d.type, 'Type', 60),
      checkDate(d.date), requiredStr(d.location, 'Location', 140),
      requiredStr(d.description, 'Description', 1200), webUrl(d.link || '', 'Event link'),
      d.featured === true ? 1 : 0]; }
  },
  team: {
    columns: ['name', 'role', 'department', 'photo_url'],
    validate(d) { return [requiredStr(d.name, 'Name', 90), requiredStr(d.role, 'Role', 100),
      requiredStr(d.department, 'Department', 90), webUrl(d.photo_url || '', 'Photo URL')]; }
  },
  gallery: {
    columns: ['title', 'category', 'image_url', 'alt_text'],
    validate(d) { return [requiredStr(d.title, 'Title', 110), requiredStr(d.category, 'Category', 80),
      webUrl(d.image_url || '', 'Image URL'), requiredStr(d.alt_text || '', 'Alt text', 180, false)]; }
  }
};
function idOf(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) bad('Invalid record ID.');
  return n;
}
function mutationRequest(req) {
  if (req.headers['x-csi-request'] !== 'website') bad('Request header missing.', 403);
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { bad('Invalid request origin.', 403); }
    if (origin.host !== req.headers.host) bad('Invalid request origin.', 403);
  }
}
function getCookies(req) {
  const raw = String(req.headers.cookie || '');
  const found = raw.match(/(?:^|;\s*)csi_session=([a-f0-9]{64})(?:;|$)/);
  return found?.[1] || '';
}
function authenticated(req) {
  const token = getCookies(req);
  if (!token) bad('Please log in.', 401);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = db.prepare(`SELECT admins.id, admins.email FROM sessions
    JOIN admins ON admins.id=sessions.admin_id
    WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(hash, Date.now());
  if (!user) bad('Session expired. Please log in.', 401);
  return user;
}
async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    bad('Expected application/json request.', 415);
  }
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString('utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY) bad('Request too large.', 413);
  }
  try {
    const data = JSON.parse(text);
    if (!data || Array.isArray(data) || typeof data !== 'object') bad('Expected JSON object.');
    return data;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    bad('Invalid JSON payload.');
  }
}
// Per-IP throttles protect form and login endpoints against easy abuse.
const attempts = new Map();
function limit(req, category, max = 8) {
  const now = Date.now();
  const key = category + ':' + req.socket.remoteAddress;
  let current = attempts.get(key);
  if (!current || now - current.start > 15 * 60 * 1000) current = { start: now, hits: 0 };
  current.hits++;
  attempts.set(key, current);
  if (attempts.size > 3000) {
    for (const [k, v] of attempts) if (now - v.start > 15 * 60 * 1000) attempts.delete(k);
  }
  if (current.hits > max) bad('Too many requests. Try again later.', 429);
}
function createRecord(resource, d) {
  const config = contentTypes[resource];
  const values = config.validate(d);
  return db.prepare(`INSERT INTO ${resource} (${config.columns.join(',')}) VALUES (${config.columns.map(() => '?').join(',')})`)
    .run(...values).lastInsertRowid;
}
function updateRecord(resource, id, d) {
  const config = contentTypes[resource];
  const result = db.prepare(`UPDATE ${resource} SET ${config.columns.map(c => `${c}=?`).join(',')} WHERE id=?`)
    .run(...config.validate(d), id);
  if (!result.changes) bad('Record not found.', 404);
}
async function api(req, res, pathname) {
  const method = req.method;
  if (method === 'GET' && pathname === '/api/health') return send(res, 200, { ok: true, service: 'CSI Bennett API' });
  if (method === 'GET' && ['/api/events', '/api/team', '/api/gallery'].includes(pathname)) {
    const resource = pathname.slice('/api/'.length);
    try {
      const sql = resource === 'events'
        ? "SELECT * FROM events ORDER BY featured DESC, COALESCE(date,'9999') DESC, id DESC"
        : `SELECT * FROM ${resource} ORDER BY id DESC`;
      return send(res, 200, db.prepare(sql).all());
    } catch {
      if (resource === 'events') {
        return send(res, 200, [
          {
            id: 1, title: 'Hackaccino', type: 'Flagship hackathon', date: null,
            location: 'Bennett University',
            description: 'A hackathon community bringing builders, designers and problem-solvers together.',
            link: 'https://www.instagram.com/hackaccino/', featured: 1
          },
          {
            id: 2, title: 'HYPE 4.0 · Hack Your Profile', type: 'Workshop', date: '2026-09-28',
            location: 'Bennett University',
            description: 'An introduction to Git and GitHub for aspiring developers.',
            link: 'https://luma.com/k6dsna5h', featured: 0
          }
        ]);
      }
      if (resource === 'gallery') {
        return send(res, 200, [
          { id: 1, title: 'Build the future', category: 'Community', image_url: '', alt_text: 'Abstract community graphic' },
          { id: 2, title: 'Learn together', category: 'Workshops', image_url: '', alt_text: 'Abstract workshop graphic' },
          { id: 3, title: 'Ship something great', category: 'Hackathons', image_url: '', alt_text: 'Abstract hackathon graphic' }
        ]);
      }
      return send(res, 200, []);
    }
  }
  if (method === 'POST' && pathname === '/api/submissions') {
    mutationRequest(req); limit(req, 'submission');
    const data = await readJson(req);
    if (!['join', 'contact'].includes(data.kind)) bad('Choose join or contact.');
    const kind = data.kind;
    const values = [kind, requiredStr(data.name, 'Name', 100), email(data.email),
      kind === 'join' ? requiredStr(data.department, 'Department', 70) : '',
      kind === 'join' ? requiredStr(data.study_year, 'Year', 30) : '',
      requiredStr(data.message || '', 'Message', 2000, kind === 'contact')];
    const row = db.prepare(`INSERT INTO submissions
      (kind,name,email,department,study_year,message) VALUES (?,?,?,?,?,?)`).run(...values);
    return send(res, 201, { ok: true, id: row.lastInsertRowid, message: 'Your submission has been received.' });
  }
  if (method === 'POST' && pathname === '/api/admin/login') {
    mutationRequest(req); limit(req, 'login');
    const data = await readJson(req);
    const address = email(data.email);
    const pass = requiredStr(data.password, 'Password', 500);
    const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(address);
    if (!admin || !verifyPassword(pass, admin.password_hash)) bad('Incorrect credentials.', 401);
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES (?,?,?)')
      .run(hash, admin.id, Date.now() + 12 * 60 * 60 * 1000);
    return send(res, 200, { ok: true, email: admin.email }, {
      'Set-Cookie': `csi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${IS_PROD ? '; Secure' : ''}`
    });
  }
  if (method === 'GET' && pathname === '/api/admin/me') {
    return send(res, 200, { email: authenticated(req).email });
  }
  if (method === 'POST' && pathname === '/api/admin/logout') {
    mutationRequest(req); authenticated(req);
    const hash = crypto.createHash('sha256').update(getCookies(req)).digest('hex');
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `csi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${IS_PROD ? '; Secure' : ''}`
    });
  }
  if (pathname === '/api/admin/submissions') {
    if (method !== 'GET') bad('Not found.', 404);
    authenticated(req);
    return send(res, 200, db.prepare('SELECT * FROM submissions ORDER BY id DESC').all());
  }
  let match = pathname.match(/^\/api\/admin\/submissions\/(\d+)$/);
  if (match && ['PATCH', 'DELETE'].includes(method)) {
    mutationRequest(req); authenticated(req);
    const id = idOf(match[1]);
    if (method === 'DELETE') {
      const result = db.prepare('DELETE FROM submissions WHERE id=?').run(id);
      if (!result.changes) bad('Record not found.', 404);
    } else {
      const data = await readJson(req);
      if (!['new', 'reviewed', 'closed'].includes(data.status)) bad('Invalid status.');
      const result = db.prepare('UPDATE submissions SET status=? WHERE id=?').run(data.status, id);
      if (!result.changes) bad('Record not found.', 404);
    }
    return send(res, 200, { ok: true });
  }
  match = pathname.match(/^\/api\/admin\/(events|team|gallery)(?:\/(\d+))?$/);
  if (match) {
    const resource = match[1];
    mutationRequest(req); authenticated(req);
    if (method === 'POST' && !match[2]) {
      const id = createRecord(resource, await readJson(req));
      return send(res, 201, { ok: true, id });
    }
    if (match[2] && (method === 'PUT' || method === 'DELETE')) {
      const id = idOf(match[2]);
      if (method === 'PUT') updateRecord(resource, id, await readJson(req));
      else {
        const result = db.prepare(`DELETE FROM ${resource} WHERE id=?`).run(id);
        if (!result.changes) bad('Record not found.', 404);
      }
      return send(res, 200, { ok: true });
    }
  }
  bad('API endpoint not found.', 404);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', csp);
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    if (pathname.startsWith('/public/api/')) pathname = pathname.slice('/public'.length);
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') bad('Method not allowed.', 405);
    if (!Object.hasOwn(STATIC, pathname)) bad('Page not found.', 404);
    const [name, type] = STATIC[pathname];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(path.join(__dirname, 'public', name)).pipe(res);
  } catch (err) {
    if (!(err instanceof ValidationError)) console.error('Server error:', err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Unexpected server error.' });
  }
});
server.on('error', err => {
  console.error(`Could not start server: ${err.message}`);
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Close the other server or change PORT in .env.`);
  process.exitCode = 1;
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`CSI Bennett is running: http://localhost:${PORT}`);
  console.log('Keep this terminal open to use the website.');
  if (db.prepare('SELECT COUNT(*) AS n FROM admins').get().n === 0) {
    console.log('Admin login is not yet configured. Run setup-admin-windows.bat if needed.');
  }
});
