// A per-computer id that cannot be carried to another PC by copying this folder: it is derived from
// the operating system's own machine id (never sent as-is, only a salted hash of it). Only when the OS
// offers none does it fall back to a random id kept in .machine-id, which is weaker (a copied folder
// would carry it along).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const SALT = "mfu-booker-machine-v1:";

export function osMachineId({ platform = process.platform, readFile = fs.readFileSync, exec = execFileSync } = {}) {
  try {
    if (platform === "win32") {
      const out = String(exec("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true, timeout: 5000 }));
      return out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{16,})/)?.[1] ?? null;
    }
    if (platform === "darwin") {
      const out = String(exec("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 5000 }));
      return out.match(/"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{16,})"/)?.[1] ?? null;
    }
    if (platform === "linux") {
      for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        try {
          const v = String(readFile(file, "utf8")).trim();
          if (/^[0-9a-f]{16,}$/i.test(v)) return v;
        } catch {}
      }
    }
  } catch {}
  return null;
}

export function getMachineId(dir, deps) {
  const osId = osMachineId(deps);
  if (osId) return crypto.createHash("sha256").update(SALT + osId).digest("hex").slice(0, 32);

  const file = path.join(dir, ".machine-id");
  try {
    const v = fs.readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{8,64}$/.test(v)) return v;
  } catch {}
  const v = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(file, `${v}\n`);
  return v;
}
