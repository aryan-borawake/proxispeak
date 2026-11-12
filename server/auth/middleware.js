// server/auth/middleware.js — Person 1
// Express "middleware": small functions that run BEFORE a route's own code. They read the token
// from the request, and either let the request through (calling next()) or answer 401 / 403.
//
// The browser sends the token in a header:   Authorization: Bearer <token>
//
//   requireEmployee   any valid token whose employee still exists      (else 401)
//   requireAdmin      a valid ADMIN token (from /api/auth/admin) whose employee's role is
//                     still 'admin'                                     (else 401 or 403)
// Every /api/admin route uses requireAdmin, so the server itself checks, whatever the page shows.

import { ROLES } from '../../shared/constants.js';
import { getEmployee } from '../office/store.js';
import { getAuthSecret } from './secrets.js';
import { verifyToken } from './token.js';

/** The token from "Authorization: Bearer <token>", or null. */
function readBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Check a token and find its employee. Used by the middleware below and by the join handler.
 * @returns {{ claims: object, employee: object } | null}
 */
export function authenticate(token) {
  const claims = verifyToken(token, getAuthSecret());
  if (!claims) return null;
  const employee = getEmployee(claims.sub);
  if (!employee) return null;
  return { claims, employee };
}

export function requireEmployee(req, res, next) {
  const result = authenticate(readBearerToken(req));
  if (!result) {
    res.status(401).json({ error: 'Please sign in again: your sign-in is missing, expired or not valid.' });
    return;
  }
  req.claims = result.claims;
  req.employee = result.employee;
  next();
}

export function requireAdmin(req, res, next) {
  const result = authenticate(readBearerToken(req));
  if (!result) {
    res.status(401).json({ error: 'Please sign in as an admin: your sign-in is missing, expired or not valid.' });
    return;
  }
  if (result.claims.admin !== true || result.employee.role !== ROLES.ADMIN) {
    res.status(403).json({ error: 'Only an admin can do this. Sign in on the Admin tab with the admin password.' });
    return;
  }
  req.claims = result.claims;
  req.employee = result.employee;
  next();
}
