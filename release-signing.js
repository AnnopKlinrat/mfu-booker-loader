// Ed25519 signing of release bundles. The PRIVATE key stays on the owner's PC (license-signing-key.pem,
// gitignored) and is used only by tools/publish.mjs; the Worker never has it, so someone who takes over
// the Worker or its KV cannot push code to customers' machines. The loader embeds the PUBLIC key and
// refuses to run anything whose signature does not verify. This file is copied into the loader repo.
import crypto from "node:crypto";

// Domain separation: a signature made for a release is never valid over arbitrary other bytes.
const DOMAIN = "mfu-booker-release-v1";
const message = (version, code) => Buffer.from(`${DOMAIN}\n${version}\n${code}`, "utf8");

export function generateSigningKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}

/** Returns the signature as base64. */
export function signRelease(privateKeyPem, version, code) {
  return crypto.sign(null, message(version, code), crypto.createPrivateKey(privateKeyPem)).toString("base64");
}

/** Never throws: anything malformed simply does not verify. */
export function verifyRelease(publicKeyPem, version, code, signatureB64) {
  try {
    if (typeof signatureB64 !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(signatureB64)) return false;
    return crypto.verify(null, message(version, code), crypto.createPublicKey(publicKeyPem), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
