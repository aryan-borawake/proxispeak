// client/src/app/session.js — Person 1
// Who is signed in in this tab, and a helper to call the server's REST routes.
//
// The token (from /api/auth/employee or /api/auth/admin) is kept in sessionStorage: a small
// per-tab store the browser keeps until the tab is closed. Every read and write is wrapped in
// try/catch, because some browsers (private windows, blocked site data) throw instead of storing.
// If storing fails, the app still works for this page; you'd just sign in again after a reload.

import { SERVER_URL } from '../net/index.js';

const TOKEN_KEY = 'proxispeak.token';
const ADMIN_KEY = 'proxispeak.admin';
const COLOR_KEY = 'proxispeak.avatarColor';

// A copy in memory, used when sessionStorage is not available.
const memory = {};

function read(key) {
  try {
    const value = window.sessionStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // storage blocked: fall back to memory
  }
  return memory[key] ?? null;
}

function write(key, value) {
  memory[key] = value;
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // storage blocked: the memory copy is enough for this page
  }
}

/** The signed-in token, or null. */
export function getToken() {
  return read(TOKEN_KEY);
}

/** Did this tab sign in on the Admin tab? (The server checks it anyway.) */
export function isAdminSession() {
  return read(ADMIN_KEY) === 'yes';
}

export function saveSession({ token, admin }) {
  write(TOKEN_KEY, token);
  write(ADMIN_KEY, admin ? 'yes' : null);
}

export function clearSession() {
  write(TOKEN_KEY, null);
  write(ADMIN_KEY, null);
}

/** The avatar colour picked in the lobby, or null. */
export function getAvatarColor() {
  return read(COLOR_KEY);
}

export function saveAvatarColor(color) {
  write(COLOR_KEY, color);
}

/**
 * Call a REST route on the server. Sends the token if there is one. Throws an Error with the
 * server's own message (e.g. "Not in the Infotact directory") when the answer is not 2xx.
 * Example: const { profile } = await api('/api/me');
 *
 * @param {string} path - e.g. '/api/admin/overview'
 * @param {{ method?: string, body?: object }} options
 * @returns {Promise<any>} the JSON answer
 */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`Could not reach the server at ${SERVER_URL}. Is it running?`);
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    // no JSON body
  }
  if (!response.ok) {
    const error = new Error(json?.error || `The server answered ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return json;
}
