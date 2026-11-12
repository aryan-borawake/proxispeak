// server/scripts/rooms-test.js — Person 1, v6
// A robot test for ROOM PERSISTENCE: loading a floor's stored layout, uploading a new one (with the
// server's checks), the floor being told, the new area working, and going back to the generated layout.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev      (ADMIN_PASSWORD set, e.g. in .env)
//   2. In a second terminal, inside server/:   node scripts/rooms-test.js
// It leaves floor-1 on the generated layout again at the end (one more version number).

import { EVENTS } from '../../shared/events.js';
import { AUDIO_MODES, ZONE_TYPES } from '../../shared/constants.js';
import { call, connectRobot, createChecker, jumpTo, pause, signIn, topLeftFor, waitFor } from './robots.js';

const { check, finish } = createChecker('rooms-test');

async function main() {
  // ---- 1. load ----
  const stored = await call('GET', '/api/rooms/floor-1');
  const layerNames = stored.body?.map?.layers?.map((layer) => layer.name) || [];
  check('1a. GET /api/rooms/floor-1 → the stored Tiled map, a version and the areas', stored.status === 200 && stored.body.version >= 1 && layerNames.includes('zones') && stored.body.areas.length > 0, `${stored.status} ${layerNames.join(',')}`);
  check('1b. a floor that does not exist → 404', (await call('GET', '/api/rooms/floor-99')).status === 404);
  check('1c. the list of layouts needs an admin token → 401 without one', (await call('GET', '/api/rooms')).status === 401);

  const admin = await call('POST', '/api/auth/admin', { body: { email: 'admin@infotact.demo', password: process.env.ADMIN_PASSWORD || '' } });
  if (admin.status !== 200) {
    console.error('[rooms-test] admin sign-in failed: set ADMIN_PASSWORD (same value as the server).');
    process.exit(1);
  }
  const token = admin.body.token;
  const list = await call('GET', '/api/rooms', { token });
  check('1d. admin: GET /api/rooms lists floor-1 with its version and date', list.status === 200 && list.body.some((room) => room._id === 'floor-1' && room.version === stored.body.version && room.updatedAt));
  const employeeToken = await signIn('riya@infotact.demo');
  check('1e. an employee may not upload a layout → 403', (await call('POST', '/api/rooms/floor-1/layout', { token: employeeToken, body: stored.body.map })).status === 403);

  // ---- 2. the server checks uploads ----
  const notAMap = await call('POST', '/api/rooms/floor-1/layout', { token, body: { hello: 'world' } });
  check('2a. not a Tiled map → 400 with a clear message', notAMap.status === 400 && /Tiled/.test(notAMap.body?.error), JSON.stringify(notAMap.body));
  const withoutZones = { ...stored.body.map, layers: stored.body.map.layers.filter((layer) => layer.name !== 'zones' && layer.name !== 'walls') };
  const missing = await call('POST', '/api/rooms/floor-1/layout', { token, body: withoutZones });
  check('2b. layers missing → 400 listing them ("walls", "zones")', missing.status === 400 && missing.body.errors.some((e) => e.includes('"walls"')) && missing.body.errors.some((e) => e.includes('"zones"')), JSON.stringify(missing.body?.errors));
  const badZone = JSON.parse(JSON.stringify(stored.body.map));
  badZone.layers.find((layer) => layer.name === 'zones').objects[0].properties = [{ name: 'zoneType', type: 'string', value: 'disco' }];
  const bad = await call('POST', '/api/rooms/floor-1/layout', { token, body: badZone });
  check('2c. a zone with an unknown zoneType → 400', bad.status === 400 && bad.body.errors.some((e) => e.includes('zoneType')), JSON.stringify(bad.body?.errors?.slice(0, 2)));

  // ---- 3. a valid upload: the stored map plus a new private "Test corner" on the open terrace ----
  const robot = await connectRobot('Riya', { token: employeeToken, floorId: 'floor-1' });
  const updated = JSON.parse(JSON.stringify(stored.body.map));
  const zones = updated.layers.find((layer) => layer.name === 'zones');
  const corner = { x: 30 * 32, y: 76 * 32, width: 8 * 32, height: 3 * 32 }; // on the plaza, outside
  zones.objects.unshift({
    id: 9999,
    name: 'Test corner',
    type: '',
    ...corner,
    rotation: 0,
    visible: true,
    properties: [
      { name: 'zoneType', type: 'string', value: ZONE_TYPES.PRIVATE },
      { name: 'name', type: 'string', value: 'Test corner' },
      { name: 'areaId', type: 'string', value: 'test-corner' },
    ],
  });
  const told = waitFor(robot.socket, EVENTS.LAYOUT_UPDATE).catch(() => null);
  const saved = await call('POST', '/api/rooms/floor-1/layout', { token, body: updated });
  check(`3a. a valid upload → saved as version ${stored.body.version + 1}, source uploaded`, saved.status === 200 && saved.body.version === stored.body.version + 1 && saved.body.source === 'uploaded', JSON.stringify(saved.body));
  const update = await told;
  check('3b. everyone on floor-1 gets layout:update with the new version', update?.floorId === 'floor-1' && update?.version === saved.body.version, JSON.stringify(update));
  const reloaded = await call('GET', '/api/rooms/floor-1');
  check('3c. GET again → the new version, with the new area', reloaded.body.version === saved.body.version && reloaded.body.areas.some((area) => area.id === 'test-corner' && area.type === ZONE_TYPES.PRIVATE));
  check('3d. the desks are kept (they belong to the directory)', reloaded.body.desks.length === stored.body.desks.length);

  // ---- 4. the new area works at once: two people 7 tiles apart inside it hear each other at full ----
  const other = await connectRobot('Arjun', { token: await signIn('arjun@infotact.demo'), floorId: 'floor-1' });
  const left = topLeftFor(corner.x + 20, corner.y + 50);
  const right = topLeftFor(corner.x + corner.width - 20, corner.y + 50);
  jumpTo(robot, left.x, left.y);
  jumpTo(other, right.x, right.y);
  await pause(900);
  check(`4. inside the uploaded "Test corner", ${Math.round(right.x - left.x)} px apart → connected, mode full`, robot.peers.get(other.id) === AUDIO_MODES.FULL, JSON.stringify([...robot.peers]));

  // ---- 5. back to the generated layout ----
  const restored = await call('POST', '/api/rooms/floor-1/generated', { token });
  const after = await call('GET', '/api/rooms/floor-1');
  check(`5. back to the generated layout → version ${saved.body.version + 1}, source generated, no test area`, restored.status === 200 && after.body.version === saved.body.version + 1 && after.body.source === 'generated' && !after.body.areas.some((area) => area.id === 'test-corner'));

  finish([robot, other]);
}

main().catch((error) => {
  console.error(`[rooms-test] stopped: ${error.message}`);
  process.exit(1);
});
