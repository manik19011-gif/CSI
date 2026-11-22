'use strict';
const { db, hashPassword } = require('./db');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 2000) { console.error('Input too large.'); process.exit(1); }
});
process.stdin.on('end', () => {
  try {
    const { email, password } = JSON.parse(input);
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error('Enter a valid email address.');
    }
    if (typeof password !== 'string' || password.length < 16 || password.length > 300) {
      throw new Error('Use a password of 16–300 characters.');
    }
    // Requires local terminal access; there is no public first-run setup endpoint.
    const existing = db.prepare('SELECT id FROM admins ORDER BY id LIMIT 1').get();
    if (existing) {
      db.prepare('UPDATE admins SET email=?, password_hash=? WHERE id=?')
        .run(email.toLowerCase(), hashPassword(password), existing.id);
      db.prepare('DELETE FROM sessions').run();
      console.log('Admin credentials updated. Existing sessions signed out.');
    } else {
      db.prepare('INSERT INTO admins(email,password_hash) VALUES (?,?)')
        .run(email.toLowerCase(), hashPassword(password));
      console.log('Admin account created.');
    }
  } catch (err) {
    console.error('Admin setup failed:', err.message);
    process.exitCode = 1;
  }
});
