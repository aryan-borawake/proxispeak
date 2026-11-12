// server/auth/secrets.js — Person 1
// The two secrets of the sign-in system. Both come ONLY from the environment (.env on a laptop,
// the "Environment" tab on Render). They are never written in code or docs.
//
//   AUTH_SECRET     the key that signs tokens (see token.js). Any long random text.
//   ADMIN_PASSWORD  the password for the admin sign-in.
//
// They are read when first needed (not when this file loads), because server/index.js loads .env
// AFTER the imports at the top of the file have run.

import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';

let authSecret = null;

/**
 * The token-signing key. If AUTH_SECRET is not set we make a random one for this run, so a laptop
 * works with no set-up, and we warn: every token then stops working when the server restarts.
 * @returns {string}
 */
export function getAuthSecret() {
  if (authSecret !== null) return authSecret;
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim() !== '') {
    authSecret = process.env.AUTH_SECRET;
  } else {
    authSecret = randomBytes(32).toString('hex');
    console.warn('[auth] AUTH_SECRET is not set: using a random key for this run. Everyone must sign in again after a restart. Set AUTH_SECRET in .env (or on Render).');
  }
  return authSecret;
}

/** Is admin sign-in possible at all? Only when ADMIN_PASSWORD is set. */
export function isAdminPasswordSet() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD !== '');
}

/**
 * Is `given` the admin password? We compare SHA-256 fingerprints with timingSafeEqual, so the
 * comparison takes the same time for every wrong guess (and both sides have the same length).
 * @param {unknown} given
 * @returns {boolean}
 */
export function checkAdminPassword(given) {
  if (!isAdminPasswordSet() || typeof given !== 'string') return false;
  const expected = createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
  const actual = createHash('sha256').update(given).digest();
  return timingSafeEqual(expected, actual);
}
