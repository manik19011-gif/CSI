'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'csi.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL,
    date TEXT, location TEXT NOT NULL, description TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '', featured INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS team (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
    department TEXT NOT NULL, photo_url TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '', alt_text TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('join','contact')),
    name TEXT NOT NULL, email TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '', study_year TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const alreadySeeded = !!db.prepare("SELECT value FROM meta WHERE key='seeded'").get();
if (!alreadySeeded) {
  if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 0) {
    const add = db.prepare(`INSERT INTO events
      (title,type,date,location,description,link,featured) VALUES (?,?,?,?,?,?,?)`);
    add.run('Hackaccino', 'Flagship hackathon', null, 'Bennett University',
      'A hackathon community bringing builders, designers and problem-solvers together.',
      'https://www.instagram.com/hackaccino/', 1);
    add.run('HYPE 4.0 · Hack Your Profile', 'Workshop', '2026-09-28',
      'Bennett University', 'An introduction to Git and GitHub for aspiring developers.',
      'https://luma.com/k6dsna5h', 0);
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM gallery').get().n === 0) {
    const add = db.prepare('INSERT INTO gallery(title,category,image_url,alt_text) VALUES(?,?,?,?)');
    add.run('Build the future', 'Community', '', 'Abstract community graphic');
    add.run('Learn together', 'Workshops', '', 'Abstract workshop graphic');
    add.run('Ship something great', 'Hackathons', '', 'Abstract hackathon graphic');
  }
  db.prepare("INSERT INTO meta(key,value) VALUES('seeded','yes')").run();
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}
function verifyPassword(password, encoded) {
  const [salt, digest] = String(encoded || '').split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(digest || '')) return false;
  return crypto.timingSafeEqual(
    crypto.scryptSync(password, salt, 64), Buffer.from(digest, 'hex')
  );
}
module.exports = { db, hashPassword, verifyPassword };
