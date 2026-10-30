// MFU Booker loader. This small file is all you get in the repo: the booking program itself is
// downloaded from the license server each time you start, after your license token is checked, and
// is run from memory. See README.md for what that means.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyRelease } from "./release-signing.js";
import { isValidVersion, compareVersions } from "./release-version.js";
import { getMachineId } from "./machine-id.mjs";

// Filled in when this repo is generated (tools/make-loader-repo.mjs). Deliberately not overridable
// through the environment: pointing the loader at another server must mean editing this file.
const SERVER = "https://mfu-license.shockolate-tech.workers.dev";
const HEARTBEAT_MS = 1800000;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAz+BdqlH0nuftY1eU0tSXmIGRU0+z0VmEzver9rl4CXs=
-----END PUBLIC KEY-----`;

const OFFLINE_GRACE_MS = 6 * 3_600_000;
const dir = path.dirname(fileURLToPath(import.meta.url));

// Synchronous writes, so a message is never lost to process.exit().
const write = (fd, msg) => {
  try {
    fs.writeSync(fd, `[license] ${msg}\n`);
  } catch {}
};
const say = (msg) => write(1, msg);
const die = (msg) => {
  write(2, msg);
  process.exit(1);
};

async function readToken() {
  const fromEnv = (process.env.MFU_LICENSE || "").trim();
  if (fromEnv) return { token: fromEnv, save: false };
  try {
    const fromFile = fs.readFileSync(path.join(dir, "license.txt"), "utf8").trim();
    if (fromFile) return { token: fromFile, save: false };
  } catch {}
  if (!process.stdin.isTTY) die("No license token. Put it in license.txt next to loader.mjs (or set MFU_LICENSE).");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = (await rl.question("License token: ")).trim();
  rl.close();
  if (!token) die("No token entered.");
  return { token, save: true };
}

async function activate(token, id, haveVersion) {
  try {
    const res = await fetch(`${SERVER}/api/license/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, machineId: id, ...(haveVersion ? { haveVersion } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  } catch (err) {
    return { network: err };
  }
}

const clean = (s) => String(s ?? "").replace(/[^\x20-\x7e฀-๿]/g, " ").slice(0, 200);
const denial = (r) => clean(r.json?.message || r.json?.error || `HTTP ${r.status}`);
const isDenied = (r) => r.status === 401 || r.status === 403;
const isLicense = (l) => l !== null && typeof l === "object" && typeof l.name === "string" && (l.expiresAt === null || Number.isFinite(l.expiresAt));

// --- start ----------------------------------------------------------------------------------------
const { token, save } = await readToken();
const id = getMachineId(dir);

const first = await activate(token, id);
if (first.network) die(`Cannot reach the license server (${clean(first.network.cause?.code || first.network.message)}). Check your internet connection and try again.`);
if (isDenied(first) || first.status === 400 || first.status === 429) die(denial(first));
const rel = first.json;
if (first.status !== 200 || typeof rel?.code !== "string" || typeof rel.signature !== "string" || typeof rel.version !== "string" || !isLicense(rel.license)) {
  die(`The license server could not provide the program right now (${denial(first)}). Try again later.`);
}
// The version label is part of what is signed, so it must be exactly the fixed format (a free-form
// label could be used to shift where the signed text starts).
if (!isValidVersion(rel.version)) die("The server sent a program with an unrecognised version label - refusing to run it.");
if (!verifyRelease(PUBLIC_KEY, rel.version, rel.code, rel.signature)) {
  die("The downloaded program is not signed by its publisher (signature check failed) - refusing to run it.");
}
// Never go back to an older (even if validly signed) program than one that has already run here.
const versionFile = path.join(dir, ".release-version");
let newest = "";
try {
  newest = fs.readFileSync(versionFile, "utf8").trim();
} catch {}
if (isValidVersion(newest) && compareVersions(rel.version, newest) < 0) {
  die(`The server offered program ${rel.version}, older than ${newest} which already ran on this computer - refusing to go back.`);
}

// Server time + our own monotonic clock, so setting the PC's clock back does not extend a license.
const t0 = performance.now();
const serverNow = () => (Number(rel.serverTime) || Date.now()) + (performance.now() - t0);
let expiresAt = rel.license.expiresAt;
const expired = () => expiresAt !== null && serverNow() >= expiresAt;
if (expired()) die("This license has expired.");

if (save) {
  try {
    fs.writeFileSync(path.join(dir, "license.txt"), `${token}\n`);
  } catch {}
}
try {
  if (compareVersions(rel.version, newest) > 0 || !isValidVersion(newest)) fs.writeFileSync(versionFile, `${rel.version}\n`);
} catch {}
say(`Licensed to ${clean(rel.license.name)}, ${expiresAt === null ? "no expiry" : `valid until ${new Date(expiresAt).toISOString().slice(0, 10)}`}. Program version ${rel.version}.`);

// --- run the program from memory -----------------------------------------------------------------
globalThis.__MFU_BASE_URL__ = pathToFileURL(path.join(dir, "loader.mjs")).href; // data/ and logs live next to this file
const localRequire = createRequire(import.meta.url);
const mod = { exports: {} };
try {
  const fn = vm.runInThisContext(`(function (require, module, exports, __filename, __dirname) {${rel.code}\n})`, { filename: "mfu-core.js" });
  fn(localRequire, mod, mod.exports, path.join(dir, "mfu-core.js"), dir);
} catch (err) {
  die(`The program failed to start: ${clean(err instanceof Error ? err.message : err)}`);
}

// --- keep checking while it runs ------------------------------------------------------------------
let lastOk = performance.now();
setInterval(async () => {
  const r = await activate(token, id, rel.version); // already running this version: no need to send it again
  if (r.status === 200 && isLicense(r.json?.license)) {
    lastOk = performance.now();
    expiresAt = r.json.license.expiresAt;
    if (r.json.version !== rel.version) say(`A newer program version (${clean(r.json.version)}) is available - restart to update.`);
    if (expired()) die("This license has expired.");
    return;
  }
  if (isDenied(r)) die(denial(r));
  if (performance.now() - lastOk > OFFLINE_GRACE_MS) die("Could not reach the license server for 6 hours - stopping.");
}, HEARTBEAT_MS);
setInterval(() => {
  if (expired()) die("This license has expired.");
}, 60_000);
