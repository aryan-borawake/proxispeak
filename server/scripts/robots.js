// server/scripts/robots.js — Person 1, v6
// Small helpers shared by the robot tests (area-test.js, peer-cap-test.js) and the load test:
// a "robot" is a pretend browser (a socket.io client) that records every message it receives.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { AVATAR_MIDDLE, MOVE_SEND_HZ, RUN_SPEED_PX_PER_SEC } from '../../shared/constants.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

export const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// How long to wait for a reply before calling it a failure.
const WAIT_MS = 3000;

// One walking step: what a running player covers between two moves (440 px/s ÷ 10/s = 44 px).
const STEP_PX = RUN_SPEED_PX_PER_SEC / MOVE_SEND_HZ;
const STEP_MS = 1000 / MOVE_SEND_HZ;

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A REST call. Answers { status, body }. */
export async function call(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${SERVER_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** Sign in a demo employee by email; returns their token. */
export async function signIn(email) {
  const answer = await call('POST', '/api/auth/employee', { body: { email } });
  if (answer.status !== 200) throw new Error(`could not sign in ${email}: ${JSON.stringify(answer.body)}`);
  return answer.body.token;
}

/** Wait for one event on a socket, or fail after WAIT_MS. */
export function waitFor(socket, eventName, ms = WAIT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${eventName} within ${ms} ms`)), ms);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const RECORDED = [EVENTS.PEERS_UPDATE, EVENTS.SERVER_ERROR, EVENTS.CHAT_MESSAGE, EVENTS.PLAYER_JOINED, EVENTS.FLOOR_CHANGED];

/**
 * Connect a robot and join. `join` is the JOIN payload ({ name } or { token, floorId }).
 * The robot keeps every recorded message in robot.inbox, and its peers in robot.peers (id → mode),
 * updated from peers:update exactly like a browser would.
 */
export async function connectRobot(label, join, { record = true } = {}) {
  const socket = io(SERVER_URL, { reconnection: false, transports: ['websocket'] });
  const robot = { label, socket, id: null, x: 0, y: 0, inbox: [], peers: new Map() };
  socket.on(EVENTS.PEERS_UPDATE, (update) => {
    for (const { id, mode } of update.entered) robot.peers.set(id, mode);
    for (const id of update.left) robot.peers.delete(id);
    for (const { id, mode } of update.changed) robot.peers.set(id, mode);
  });
  if (record) {
    for (const eventName of RECORDED) socket.on(eventName, (data) => robot.inbox.push({ eventName, data }));
  }
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => reject(new Error(`${label} could not connect to ${SERVER_URL}: ${error.message}. Is the server running?`)));
  });
  const init = waitFor(socket, EVENTS.WORLD_INIT);
  socket.emit(EVENTS.JOIN, join);
  const world = await init;
  robot.id = world.selfId;
  robot.x = world.spawn.x;
  robot.y = world.spawn.y;
  robot.world = world;
  return robot;
}

/** Jump straight to (x, y). Only works as the FIRST move after joining (or for name joins). */
export function jumpTo(robot, x, y, dir = 'down') {
  robot.x = x;
  robot.y = y;
  robot.socket.emit(EVENTS.MOVE, { x, y, dir });
}

/** Walk to (x, y) at running speed, one move every 100 ms, like a browser holding Shift. */
export async function walkTo(robot, x, y) {
  for (;;) {
    const dx = x - robot.x;
    const dy = y - robot.y;
    const left = Math.hypot(dx, dy);
    if (left < 0.5) return;
    const step = Math.min(STEP_PX, left);
    robot.x += (dx / left) * step;
    robot.y += (dy / left) * step;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    robot.socket.emit(EVENTS.MOVE, { x: robot.x, y: robot.y, dir });
    await pause(STEP_MS);
  }
}

/** The avatar position (top-left) whose MIDDLE is at (mx, my). */
export function topLeftFor(mx, my) {
  return { x: mx - AVATAR_MIDDLE.x, y: my - AVATAR_MIDDLE.y };
}

/** The messages of one kind a robot received. */
export function messagesOf(robot, eventName) {
  return robot.inbox.filter((m) => m.eventName === eventName).map((m) => m.data);
}

/** A PASS/FAIL printer that counts failures. */
export function createChecker(tag) {
  const checker = {
    failures: 0,
    check(name, passed, detail = '') {
      if (passed) console.log(`[${tag}] PASS  ${name}`);
      else {
        checker.failures += 1;
        console.log(`[${tag}] FAIL  ${name}  ${detail}`);
      }
    },
    finish(robots = []) {
      for (const robot of robots) robot.socket.disconnect();
      if (checker.failures > 0) {
        console.log(`[${tag}] ${checker.failures} check(s) FAILED`);
        process.exit(1);
      }
      console.log(`[${tag}] all checks passed`);
      process.exit(0);
    },
  };
  return checker;
}
