// server/office/routes.js — Person 1
// The office's web addresses (REST routes). CONTRACTS.md v5, section 9b.
//
// For everyone signed in:
//   GET  /api/office/layout              the floor plan (desks, wings, rooms, elevator). No token needed.
//   GET  /api/office/floors/:floorId     (token) that floor's snapshot (tier, open wings, departments)
// For admins only (every route checks the ADMIN token on the server, see requireAdmin):
//   GET   /api/admin/overview            headcount, desks, tiers, hot desks, alerts, per-floor numbers
//   GET   /api/admin/departments         POST /api/admin/departments { name, color, size, floorId }
//   PATCH /api/admin/departments/:id     { name?, color?, size? }   (size re-runs the desk rule)
//   GET   /api/admin/employees           POST /api/admin/employees { name, email, role, departmentId }
//   POST  /api/admin/employees/sample    { departmentId, count }    (random demo hires)
//   GET   /api/admin/floors              POST /api/admin/floors     (add the next floor)
//   POST  /api/admin/floors/apply        { moves: [{ departmentId, floorId }] }   (rebalance)
//   GET   /api/admin/alerts              POST /api/admin/alerts/:id/resolve

import { Router } from 'express';
import { requireAdmin, requireEmployee } from '../auth/middleware.js';
import { layout } from './layout.js';
import * as store from './store.js';

/**
 * Run an async route and turn its errors into JSON answers.
 * OfficeError (e.g. 404 "No department …") keeps its status; anything else is a 500.
 */
function handle(work) {
  return async (req, res) => {
    try {
      res.json(await work(req));
    } catch (error) {
      if (error instanceof store.OfficeError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error('[office] request failed:', error);
      res.status(500).json({ error: `The server could not do that: ${error.message}` });
    }
  };
}

/**
 * @param {{ getOnlineEmployeeIds: () => Set<string> }} options — from the signaling server
 */
export function createOfficeRouter({ getOnlineEmployeeIds }) {
  const router = Router();

  router.get('/api/office/layout', (req, res) => {
    res.json(layout);
  });

  router.get(
    '/api/office/floors/:floorId',
    requireEmployee,
    handle((req) => {
      if (!store.getFloor(req.params.floorId)) throw new store.OfficeError(404, `No floor with id "${req.params.floorId}".`);
      return store.floorSnapshot(req.params.floorId);
    }),
  );

  // ---- admin ----
  router.use('/api/admin', requireAdmin);

  router.get(
    '/api/admin/overview',
    handle(() => ({
      ...store.overview(getOnlineEmployeeIds()),
      snapshots: store.listFloors().map((floor) => store.floorSnapshot(floor._id)),
    })),
  );

  router.get(
    '/api/admin/departments',
    handle(() => {
      const employees = store.listEmployees();
      return store.listDepartments().map((department) => ({
        ...department,
        people: employees.filter((e) => e.departmentId === department._id).length,
        floorName: store.getFloor(department.floorId)?.name || department.floorId,
      }));
    }),
  );
  router.post('/api/admin/departments', handle((req) => store.addDepartment(req.body || {})));
  router.patch('/api/admin/departments/:id', handle((req) => store.updateDepartment(req.params.id, req.body || {})));

  router.get(
    '/api/admin/employees',
    handle(() => {
      const online = getOnlineEmployeeIds();
      return store.listEmployees().map((employee) => ({ ...store.profileOf(employee), online: online.has(employee._id) }));
    }),
  );
  router.post('/api/admin/employees', handle((req) => store.addEmployee(req.body || {})));
  router.post('/api/admin/employees/sample', handle((req) => store.addSampleEmployees(req.body || {})));

  router.get('/api/admin/floors', handle(() => store.listFloors().map((floor) => store.floorSnapshot(floor._id))));
  router.post('/api/admin/floors', handle(() => store.addFloor()));
  router.post('/api/admin/floors/apply', handle((req) => store.applyFloorMoves(req.body?.moves)));

  router.get('/api/admin/alerts', handle(() => store.listAlerts()));
  router.post('/api/admin/alerts/:id/resolve', handle((req) => store.resolveAlert(req.params.id)));

  return router;
}
