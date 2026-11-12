// server/auth/token.js — Person 1
// Sign-in tokens, made with Node's built-in `crypto` (no package).
//
// What is a token? After you sign in, the server gives your browser a short text "pass". The browser
// sends it back with every request (and in EVENTS.JOIN), so the server knows who you are without
// asking for your email again.
//
// Why can't someone just write their own pass saying "I'm the admin"? Because the pass is SIGNED.
//   token = <payload>.<signature>
//   payload   = the facts, e.g. { sub: 'emp-riya', role: 'lead', admin: false, exp: 1760800000000 },
//               turned into JSON and then into base64url (text that is safe in a web address)
//   signature = HMAC-SHA256(AUTH_SECRET, payload)
// HMAC is a "keyed fingerprint": only someone who knows AUTH_SECRET can compute the right signature
// for a payload. Change one letter of the payload (e.g. admin: false → true) and the fingerprint no
// longer matches, so verifyToken refuses it. AUTH_SECRET lives only on the server (.env / Render).
//
// Example:
//   const token = createToken({ sub: 'emp-riya', role: 'lead', admin: false }, secret, TOKEN_TTL_MS);
//   verifyToken(token, secret)  → { sub: 'emp-riya', role: 'lead', admin: false, exp: … }
//   verifyToken(token + 'x', secret) → null   (signature does not match)

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Text → base64url (base64 with - and _ instead of + and /, and no = padding). */
function toBase64Url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

/** The HMAC-SHA256 signature of `payloadPart`, as base64url. */
function sign(payloadPart, secret) {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/**
 * Make a signed token that stops working after `ttlMs` milliseconds.
 * @param {object} claims - e.g. { sub: employeeId, role, admin }
 * @param {string} secret - AUTH_SECRET
 * @param {number} ttlMs - how long it works, e.g. TOKEN_TTL_MS (12 h)
 * @returns {string}
 */
export function createToken(claims, secret, ttlMs) {
  const payload = { ...claims, exp: Date.now() + ttlMs };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart, secret)}`;
}

/**
 * Check a token. Returns its payload if the signature is right and it has not expired, else null.
 * @param {unknown} token
 * @param {string} secret
 * @returns {object | null}
 */
export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadPart, signaturePart] = parts;

  // Compare signatures with timingSafeEqual: it takes the same time whether the first letter or the
  // last letter differs, so an attacker can't guess the signature letter by letter by timing us.
  const expected = Buffer.from(sign(payloadPart, secret));
  const given = Buffer.from(signaturePart);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null; // expired
  return payload;
}
