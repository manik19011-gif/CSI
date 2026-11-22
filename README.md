# CSI Bennett University — Easy start (full-stack)

This version is **self-contained**. It uses Node.js 22+ and its built-in SQLite module.
There is **no `npm install` step**, no database server and no initial `.env` requirement.

## Windows, easiest method

1. Install Node.js 22 or newer from https://nodejs.org/ (if not already installed).
2. Extract this ZIP completely to a folder (do not run the batch file inside the ZIP preview).
3. Double-click **start-site-windows.bat**.
4. In your browser open **http://localhost:3000**. Leave the black terminal window open.
5. To activate the admin dashboard, double-click **setup-admin-windows.bat** and enter your own email and password (16+ characters).
6. Open **http://localhost:3000/admin** and sign in. If the server was already running, refresh the admin page.

The public website works even before an admin account has been configured.

## macOS / Linux / terminal

```sh
node --version       # Requires v22+
npm start            # No npm install needed
```

Admin setup from a terminal (the JSON must be supplied through stdin, not as command-line arguments):

```sh
printf '%s\n' '{"email":"admin@example.org","password":"choose-a-unique-password-16+"}' | npm run setup-admin
```

Use real private credentials, not the example values above. Avoid storing your password in shell history: a secure interactive input method is recommended.

## Configuration

Optional `.env` file: copy `.env.example` and set `PORT=3000` or another free port. The Windows launcher prints 3000; if you change PORT, open the new port instead. Data is saved under `data/csi.sqlite`. Do not commit or publicly serve that directory.

## API routes

Public: `GET /api/health`, `GET /api/events`, `GET /api/team`, `GET /api/gallery`, `POST /api/submissions`.

Admin: `POST /api/admin/login`, `GET /api/admin/me`, `POST /api/admin/logout`, `GET /api/admin/submissions`, `PATCH/DELETE /api/admin/submissions/:id`, `POST /api/admin/:resource`, `PUT/DELETE /api/admin/:resource/:id` (`resource` is `events`, `team` or `gallery`).

## Important

This is a *local* website, not a publicly hosted URL. Other people cannot access it until it is deployed. Do not put an unrestricted admin API online without an additional production security and deployment review; enable HTTPS, persistent backups, logging and privacy controls for student submissions.

Node's `node:sqlite` module is experimental in Node 22; this project explicitly enables it with `--experimental-sqlite`.

If the website cannot start, run `node --version`, double-click `start-site-windows.bat`, and send the exact error text from the terminal.
