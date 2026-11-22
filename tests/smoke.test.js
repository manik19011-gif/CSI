'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
async function ready(url, proc) {
  for (let i = 0; i < 40; i++) {
    if (proc.exitCode != null) throw new Error(`Server exited ${proc.exitCode}`);
    try { const res = await fetch(url + '/api/health'); if (res.ok) return; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server never became ready');
}
test('Complete public and admin smoke test', { timeout: 30000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csi-smoke-'));
  fs.cpSync(path.resolve(__dirname, '..'), tmp, { recursive: true,
    filter: p => !p.includes('/data/csi.sqlite') && !p.endsWith('.sqlite-wal') && !p.endsWith('.sqlite-shm') });
  const setup = spawnSync(process.execPath, ['--no-warnings', '--experimental-sqlite', 'setup-admin.js'], {
    cwd: tmp, encoding: 'utf8', input: JSON.stringify({ email: 'admin@example.org', password: 'temporary-test-password-1234' })
  });
  assert.equal(setup.status, 0, setup.stderr);
  const port = await freePort();
  const server = spawn(process.execPath, ['--no-warnings', '--experimental-sqlite', 'server.js'], {
    cwd: tmp, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  server.stdout.on('data', c => { logs += c; });
  server.stderr.on('data', c => { logs += c; });
  const base = 'http://127.0.0.1:' + port;
  async function query(endpoint, method, data, cookie) {
    const res = await fetch(base + endpoint, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-CSI-Request': 'website',
        ...(cookie ? { Cookie: cookie } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {})
    });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie') };
  }
  try {
    await ready(base, server);
    for (const filename of ['/', '/styles.css', '/site.js', '/admin', '/admin.js']) {
      const r = await fetch(base + filename);
      assert.equal(r.status, 200, filename);
      assert.ok((await r.text()).length > 30);
    }
    assert.equal((await query('/api/health')).data.ok, true);
    assert.equal((await query('/api/events')).data.length, 2);
    assert.equal((await query('/api/gallery')).data.length, 3);
    assert.equal((await query('/api/team')).data.length, 0);
    const badSubmission = await query('/api/submissions', 'POST', {
      kind: 'contact', name: '', email: 'bad', message: ''
    });
    assert.equal(badSubmission.status, 400);
    const submit = await query('/api/submissions', 'POST', {
      kind: 'contact', name: 'Student', email: 'student@example.org', message: 'Hello CSI!'
    });
    assert.equal(submit.status, 201);
    const noAuth = await query('/api/admin/submissions');
    assert.equal(noAuth.status, 401);
    const badLogin = await query('/api/admin/login', 'POST', {
      email: 'admin@example.org', password: 'invalidpassword'
    });
    assert.equal(badLogin.status, 401);
    const login = await query('/api/admin/login', 'POST', {
      email: 'admin@example.org', password: 'temporary-test-password-1234'
    });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const cookie = login.cookie.split(';')[0];
    assert.equal((await query('/api/admin/me', 'GET', undefined, cookie)).data.email, 'admin@example.org');
    assert.equal((await query('/api/admin/submissions', 'GET', undefined, cookie)).data.length, 1);
    const created = await query('/api/admin/events', 'POST', {
      title: 'Test event', type: 'Workshop', date: '2026-12-12',
      location: 'Campus', description: 'Learn and build', link: '', featured: true
    }, cookie);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const eventId = created.data.id;
    assert.equal((await query('/api/events')).data.length, 3);
    const edited = await query('/api/admin/events/' + eventId, 'PUT', {
      title: 'Edited event', type: 'Workshop', date: '',
      location: 'Campus', description: 'Learn more', link: '', featured: false
    }, cookie);
    assert.equal(edited.status, 200);
    assert.ok((await query('/api/events')).data.some(x => x.title === 'Edited event'));
    assert.equal((await query('/api/admin/events/' + eventId, 'DELETE', undefined, cookie)).status, 200);
    assert.equal((await query('/api/events')).data.length, 2);
    const submissions = (await query('/api/admin/submissions', 'GET', undefined, cookie)).data;
    assert.equal((await query('/api/admin/submissions/' + submissions[0].id, 'PATCH', { status: 'reviewed' }, cookie)).status, 200);
    assert.equal((await query('/api/admin/submissions/' + submissions[0].id, 'DELETE', undefined, cookie)).status, 200);
    assert.equal((await query('/api/admin/logout', 'POST', undefined, cookie)).status, 200);
    assert.equal((await query('/api/admin/me', 'GET', undefined, cookie)).status, 401);
    assert.equal((await fetch(base + '/../db.js')).status, 404);
  } catch (err) {
    err.message += '\nSERVER LOGS:\n' + logs;
    throw err;
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
