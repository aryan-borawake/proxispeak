// server/auth/routes.js — Person 1
// The sign-in web addresses (REST routes). CONTRACTS.md v5, section 9b.
//
//   POST /api/auth/employee  { email }            → 200 { token, profile } | 404 not in the directory
//   POST /api/auth/admin     { email, password }  → 200 { token, profile } | 401
//   GET  /api/auth/demo      → { employees: [{ email, name, department }], admin: email }  (the clickable chips)
//   GET  /api/me             (token) → { profile, admin }
//
// In production Infotact's dashboard would vouch for the person (single sign-on). This demo looks
// the email up in the employee directory instead, so anyone can try it with a demo email.

import { Router } from 'express';
import { ROLES, TOKEN_TTL_MS } from '../../shared/constants.js';
import { findEmployeeByEmail, getDepartment, listEmployees, profileOf } from '../office/store.js';
import { requireEmployee } from './middleware.js';
import { checkAdminPassword, getAuthSecret, isAdminPasswordSet } from './secrets.js';
import { createToken } from './token.js';

// How many demo emails the sign-in page offers as chips.
const DEMO_CHIP_COUNT = 6;

export function createAuthRouter() {
  const router = Router();

  router.post('/api/auth/employee', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const employee = findEmployeeByEmail(email);
    if (!employee) {
      res.status(404).json({ error: 'Not in the Infotact directory' });
      return;
    }
    // An employee token never has the admin flag, even for the admin person.
    const token = createToken({ sub: employee._id, role: employee.role, admin: false }, getAuthSecret(), TOKEN_TTL_MS);
    console.log(`[auth] employee signed in: ${employee.email}`);
    res.json({ token, profile: profileOf(employee), admin: false });
  });

  router.post('/api/auth/admin', (req, res) => {
    if (!isAdminPasswordSet()) {
      res.status(401).json({ error: 'Admin sign-in is switched off: ADMIN_PASSWORD is not set on the server.' });
      return;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const employee = findEmployeeByEmail(email);
    // Same answer for "unknown email", "not an admin" and "wrong password", so the page can't be used
    // to find out which emails are admins.
    if (!employee || employee.role !== ROLES.ADMIN || !checkAdminPassword(req.body?.password)) {
      console.warn(`[auth] admin sign-in refused for "${email}"`);
      res.status(401).json({ error: 'Wrong admin email or password.' });
      return;
    }
    const token = createToken({ sub: employee._id, role: employee.role, admin: true }, getAuthSecret(), TOKEN_TTL_MS);
    console.log(`[auth] admin signed in: ${employee.email}`);
    res.json({ token, profile: profileOf(employee), admin: true });
  });

  router.get('/api/auth/demo', (req, res) => {
    const employees = listEmployees()
      .filter((e) => e.role !== ROLES.ADMIN && e.email.endsWith('@infotact.demo'))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, DEMO_CHIP_COUNT)
      .map((e) => ({ email: e.email, name: e.name, department: getDepartment(e.departmentId)?.name || '' }));
    const admin = listEmployees().find((e) => e.role === ROLES.ADMIN);
    res.json({ employees, admin: admin ? admin.email : null });
  });

  router.get('/api/me', requireEmployee, (req, res) => {
    res.json({ profile: profileOf(req.employee), admin: req.claims.admin === true });
  });

  return router;
}
