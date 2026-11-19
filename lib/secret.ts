import { randomBytes } from "node:crypto";

/**
 * The key that signs cookies and summary tokens. Set SESSION_SECRET in production.
 * Without it, each server instance makes up a random one: still safe, but sign-ins
 * and free-scan counts won't carry across instances or deploys.
 */
const fallback = randomBytes(32).toString("hex");
let warned = false;

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (!warned) { console.warn("SESSION_SECRET is missing or too short; using a random per-instance secret"); warned = true; }
  return fallback;
}
