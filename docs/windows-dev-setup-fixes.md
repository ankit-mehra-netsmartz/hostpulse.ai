# Windows Dev Setup Fixes

Issues encountered when running the project on Windows (vs Mac) and how they were resolved.

---

## 1. `NODE_ENV` not recognized

**Error:**

```
'NODE_ENV' is not recognized as an internal or external command
```

**Cause:** Unix-style inline env var syntax (`NODE_ENV=value command`) doesn't work on Windows CMD/PowerShell.

**Fix:** Installed `cross-env` and prefixed the script with it.

```bash
npm install --save-dev cross-env
```

```json
"dev": "cross-env NODE_ENV=development tsx server/index.ts"
```

---

## 2. `tsx` shell script fails on Windows

**Error:**

```
SyntaxError: missing ) after argument list
```

**Cause:** `node_modules/.bin/tsx` is a bash shell script. Calling it directly via `node node_modules/.bin/tsx` executes the bash script as JS on Windows.

**Fix:** Call `tsx` directly in the npm script — npm automatically resolves `node_modules/.bin/tsx.cmd` on Windows.

---

## 3. `SESSION_SECRET` undefined / `.env` not loaded

**Error:**

```
Error: secret option required for sessions
```

**Cause:** `--env-file=.env` is a Node.js flag that `tsx` does not forward, so `.env` was never loaded and `SESSION_SECRET` was empty.

**Fix:** Installed `dotenv` and loaded it programmatically at the top of `server/config.ts`, before any `process.env` reads.

```bash
npm install dotenv
```

```ts
// server/config.ts
import dotenv from "dotenv";
dotenv.config();
```
