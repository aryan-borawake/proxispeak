// server/geo/routes.js — Module 2 (Geospatial engine), v6 ("Room Persistence", spec Week 4)
// The two web addresses of the brief ("one to load a saved office, one to save it"), plus a list:
//   GET  /api/rooms/:id           anyone   → the floor's stored layout { _id, floorId, name, version,
//                                            source, updatedAt, map (Tiled JSON), desks, areas }
//   GET  /api/rooms               admin    → every stored layout, without the maps
//   POST /api/rooms/:id/layout    admin    body = a Tiled JSON map → validated, saved as the next version
//   POST /api/rooms/:id/generated admin    → back to the generated layout (saved as the next version)
// Person 1 mounts this router in server/index.js and passes the admin check and what to do afterwards.

import express, { Router } from 'express';
import { listRooms, loadRoom, saveUploadedRoom, validateTiledMap } from './rooms.js';

// A Tiled map of our office is about 150 KB; allow up to 5 MB for bigger uploads.
const MAX_UPLOAD = '5mb';

/**
 * @param {{
 *   requireAdmin: Function,                       // Express middleware: admins only
 *   isFloor: (id: string) => boolean,             // does this floor exist?
 *   ensureRoom: (id: string, options?: { force: boolean }) => Promise<object>,  // the stored room, created
 *                                                 // from the generated one if missing (force: replace it)
 *   onLayoutSaved: (room: object) => void,        // after an upload: reload areas, tell the floor
 * }} options
 */
export function createRoomsRouter({ requireAdmin, isFloor, ensureRoom, onLayoutSaved }) {
  const router = Router();

  router.get('/api/rooms', requireAdmin, async (req, res) => {
    try {
      res.json(await listRooms());
    } catch (error) {
      res.status(500).json({ error: `Could not list the layouts: ${error.message}` });
    }
  });

  router.get('/api/rooms/:id', async (req, res) => {
    try {
      if (!isFloor(req.params.id)) {
        res.status(404).json({ error: `No floor with id "${req.params.id}".` });
        return;
      }
      const room = (await loadRoom(req.params.id)) || (await ensureRoom(req.params.id));
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: `Could not load the layout: ${error.message}` });
    }
  });

  router.post('/api/rooms/:id/layout', requireAdmin, express.json({ limit: MAX_UPLOAD }), async (req, res) => {
    try {
      if (!isFloor(req.params.id)) {
        res.status(404).json({ error: `No floor with id "${req.params.id}".` });
        return;
      }
      const check = validateTiledMap(req.body);
      if (!check.ok) {
        res.status(400).json({ error: `This layout can't be used: ${check.errors.slice(0, 6).join('; ')}${check.errors.length > 6 ? ` (and ${check.errors.length - 6} more)` : ''}.`, errors: check.errors });
        return;
      }
      await ensureRoom(req.params.id); // so the upload keeps the stored desks
      const room = await saveUploadedRoom(req.params.id, req.body, check.areas);
      console.log(`[geo] ${req.params.id}: uploaded layout saved as version ${room.version} (${check.areas.length} areas)`);
      onLayoutSaved(room);
      res.json({ _id: room._id, floorId: room.floorId, version: room.version, source: room.source, updatedAt: room.updatedAt, areas: room.areas.length });
    } catch (error) {
      res.status(500).json({ error: `Could not save the layout: ${error.message}` });
    }
  });

  router.post('/api/rooms/:id/generated', requireAdmin, async (req, res) => {
    try {
      if (!isFloor(req.params.id)) {
        res.status(404).json({ error: `No floor with id "${req.params.id}".` });
        return;
      }
      const room = await ensureRoom(req.params.id, { force: true });
      console.log(`[geo] ${req.params.id}: back to the generated layout, version ${room.version}`);
      onLayoutSaved(room);
      res.json({ _id: room._id, floorId: room.floorId, version: room.version, source: room.source, updatedAt: room.updatedAt, areas: room.areas.length });
    } catch (error) {
      res.status(500).json({ error: `Could not restore the generated layout: ${error.message}` });
    }
  });

  return router;
}
