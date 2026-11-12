// server/signaling/officeRooms.js — Person 1 (Module 1: Signaling + WebRTC), v5
// The Infotact office's part of signaling: joining with a sign-in token, floors as rooms, the
// elevator, telling a floor when it changed, and the "closed wing" move check.
//
// Rooms: a Socket.io room is a named group of sockets. Every floor is one room, named with the floor
// id ('floor-1', 'floor-2', …). Labs and robot tests still join DEFAULT_ROOM ('office-1') with a name.
// Because broadcasts, the proximity tick and the geo engine are all per room, people on different
// floors never see each other and never get voice connections to each other.

import { EVENTS } from '../../shared/events.js';
import { AVATAR_COLORS, STATUSES } from '../../shared/constants.js';
import { authenticate } from '../auth/middleware.js';
import { layout, wingAt } from '../office/layout.js';
import { floorSnapshot, getDepartment, getEmployee, getFloor, isWingClosed, officeEvents, profileOf } from '../office/store.js';
import { getPlayer, listPlayers, listPlayersInRoom } from './players.js';
import { disconnectAllPeers } from './tick.js';
import { allowFreeMove } from './moveCheck.js';

// New players face down (towards the screen) when they appear.
const SPAWN_DIR = 'down';

/** The player shape in WORLD_INIT / PLAYER_JOINED: { id, name, x, y, dir } plus the v5 extras. */
export function toJoinedShape(player) {
  const shape = { id: player.id, name: player.name, x: player.x, y: player.y, dir: player.dir, status: player.status };
  if (player.employeeId) {
    shape.employeeId = player.employeeId;
    shape.role = player.role;
    shape.avatarColor = player.avatarColor;
    shape.department = player.department;
  }
  return shape;
}

/**
 * Read a token JOIN payload. Returns the fields for addPlayer, or an error message.
 * { token, avatarColor?, floorId?, status? }:
 *   token        from /api/auth/employee or /api/auth/admin (checked here, on the server)
 *   avatarColor  one of AVATAR_COLORS (else a colour picked from the employee id)
 *   floorId      which floor to join (after a reconnect, the floor I was on); default: my desk's floor
 *   status       one of STATUSES (after a reconnect); default available
 *
 * @returns {{ ok: true, fields: object, roomId: string, spawn: { x, y } } | { ok: false, message: string }}
 */
export function readTokenJoin(payload) {
  const auth = authenticate(payload.token);
  if (!auth) {
    return { ok: false, message: 'Join refused: your sign-in token is missing, expired or not valid. Sign in again.' };
  }
  const { employee } = auth;
  const floorId = typeof payload.floorId === 'string' && getFloor(payload.floorId) ? payload.floorId : employee.floorId;
  const avatarColor = AVATAR_COLORS.includes(payload.avatarColor) ? payload.avatarColor : colourFor(employee._id);
  const status = Object.values(STATUSES).includes(payload.status) ? payload.status : STATUSES.AVAILABLE;
  // On my own floor I start in the lobby; on another floor, at the elevator.
  const spawn = floorId === employee.floorId ? layout.spawn : { x: layout.elevator.x, y: layout.elevator.y };

  return {
    ok: true,
    roomId: floorId,
    spawn: { x: spawn.x, y: spawn.y },
    fields: {
      name: employee.name,
      x: spawn.x,
      y: spawn.y,
      dir: SPAWN_DIR,
      roomId: floorId,
      status,
      avatarColor,
      ...employeeFields(employee),
    },
  };
}

/** The directory facts a player carries (refreshed when the admin changes something). */
function employeeFields(employee) {
  const department = getDepartment(employee.departmentId);
  return {
    employeeId: employee._id,
    role: employee.role,
    department: department ? { id: department._id, name: department.name, color: department.color } : null,
    floorId: employee.floorId,
    deskId: employee.deskId,
  };
}

/** A colour from the id, so a person without a choice always gets the same one. */
function colourFor(id) {
  let sum = 0;
  for (const letter of id) sum += letter.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/**
 * The WORLD_INIT / FLOOR_CHANGED payload for a player who is (now) in `roomId`.
 * For employees it adds `profile` (who I am, my desk) and `office` (the floor snapshot).
 */
export function buildWorldInit(player, spawn) {
  const players = listPlayersInRoom(player.roomId)
    .filter((other) => other.id !== player.id)
    .map(toJoinedShape);
  const init = { selfId: player.id, roomId: player.roomId, spawn: { x: spawn.x, y: spawn.y }, players };
  if (player.employeeId) {
    const employee = getEmployee(player.employeeId);
    if (employee) init.profile = profileOf(employee);
    init.office = floorSnapshot(player.roomId);
  }
  return init;
}

/**
 * Is this move into a wing that is closed on the player's floor? Labs (DEFAULT_ROOM) have no wings.
 * Example: floor-1 at tier 1 (only wing A open), move to (2100, 300) inside wing B → true.
 */
export function isMoveIntoClosedWing(player, x, y) {
  if (!player.employeeId) return false;
  return isWingClosed(player.roomId, wingAt(x, y));
}

/**
 * Move one connected player to another floor (elevator, Floors button, or the admin moved their
 * department). Their socket id stays the same; only their room changes:
 *   1. hang up all their voice connections (both sides get peers:update "left");
 *   2. forget their position in the old room's geo engine;
 *   3. leave the old room (everyone there gets player:left);
 *   4. join the new room at the elevator, get FLOOR_CHANGED (a fresh world), everyone there gets
 *      player:joined. The next tick connects them to whoever is near the elevator.
 */
export function movePlayerToFloor(io, socket, floorId, geoFor) {
  const player = getPlayer(socket.id);
  if (!player) return;
  const oldRoomId = player.roomId;

  disconnectAllPeers(io, player.id);
  const oldGeo = geoFor(oldRoomId);
  if (oldGeo) {
    oldGeo.removeUser(player.id).catch((error) => console.error(`[signaling] geo.removeUser failed for ${player.id}:`, error));
  }
  socket.leave(oldRoomId);
  io.to(oldRoomId).emit(EVENTS.PLAYER_LEFT, { id: player.id });

  const spawn = { x: layout.elevator.x, y: layout.elevator.y };
  player.roomId = floorId;
  player.x = spawn.x;
  player.y = spawn.y;
  player.dir = SPAWN_DIR;
  player.moved = true; // the next tick checks who is near the elevator
  allowFreeMove(player); // v6: a new floor starts a fresh movement budget
  const employee = getEmployee(player.employeeId);
  if (employee) Object.assign(player, employeeFields(employee));

  socket.join(floorId);
  socket.emit(EVENTS.FLOOR_CHANGED, buildWorldInit(player, spawn));
  socket.to(floorId).emit(EVENTS.PLAYER_JOINED, toJoinedShape(player));
  console.log(`[signaling] ${player.name} (${player.id}) moved from ${oldRoomId} to ${floorId}`);
}

/** The employee ids of everyone in the office right now (for the admin page's "online"). */
export function getOnlineEmployeeIds() {
  const ids = new Set();
  for (const player of listPlayers()) {
    if (player.employeeId) ids.add(player.employeeId);
  }
  return ids;
}

/**
 * Listen to the office store. When the admin changes something:
 *   - every connected employee's directory facts are refreshed (desk, department name/colour);
 *   - every changed floor gets EVENTS.OFFICE_UPDATE with its new snapshot (a wing opened, a block moved);
 *   - people whose department moved to another floor are moved there (movePlayerToFloor).
 */
export function watchOfficeChanges(io, geoFor) {
  officeEvents.on('change', ({ floorIds, moved }) => {
    for (const player of listPlayers()) {
      if (!player.employeeId) continue;
      const employee = getEmployee(player.employeeId);
      if (employee) Object.assign(player, employeeFields(employee));
    }
    for (const floorId of floorIds) {
      io.to(floorId).emit(EVENTS.OFFICE_UPDATE, floorSnapshot(floorId));
    }
    for (const { employeeId, toFloorId } of moved) {
      for (const player of listPlayers().filter((p) => p.employeeId === employeeId && p.roomId !== toFloorId)) {
        const socket = io.sockets.sockets.get(player.id);
        if (socket) movePlayerToFloor(io, socket, toFloorId, geoFor);
      }
    }
  });
}
