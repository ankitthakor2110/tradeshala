import crypto from "node:crypto";

/**
 * Server-only symmetric encryption for sensitive broker credentials
 * (api_secret, access_token, totp_secret) before they are written to the
 * database. Uses AES-256-GCM with a per-value random IV.
 *
 * Stored format:  enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * The key comes from the server-only env var BROKER_ENCRYPTION_KEY. Any string
 * is accepted and normalised to 32 bytes via SHA-256, so an
 * `openssl rand -base64 32` value works directly.
 *
 * NEVER import this from client code — it relies on node:crypto and the key
 * must never reach the browser.
 */

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.BROKER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BROKER_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your server env."
    );
  }
  // Normalise any-length secret to a fixed 32-byte key.
  return crypto.createHash("sha256").update(raw).digest();
}

/** True if the value is already in our encrypted envelope format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a plaintext secret. Returns null for null/empty input. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (isEncrypted(plain)) return plain; // already encrypted — don't double-wrap

  const iv = crypto.randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":")
  );
}

/**
 * Decrypt a stored secret. Backward-compatible: if the value is not in the
 * encrypted envelope format (e.g. a legacy plaintext row written before
 * encryption was introduced), it is returned unchanged.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!isEncrypted(stored)) return stored; // legacy plaintext — pass through

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret envelope.");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
