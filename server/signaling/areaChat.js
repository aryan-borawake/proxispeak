// server/signaling/areaChat.js — Person 1, v6
// Area chat: a text chat for the room you are standing in (a meeting room, a booth, the focus room,
// the stage hall…). Like Gather: messages reach only the people inside that area, and nothing is
// stored. Someone who walks in later does not see older messages.
//
// The server decides the area itself, from where it knows you stand (never from the browser), and
// sends the message only to the people standing in the same area right now.
//
// Example: Riya and Sam are in 'Meeting room 2', Lee is in the corridor.
//   Riya sends chat:send { text: 'Shall we start?' }
//   → Riya and Sam get chat:message { areaId: 'meeting-2', areaName: 'Meeting room 2',
//                                     from: { id: riya, name: 'Riya' }, text: 'Shall we start?', t }
//   → Lee gets nothing.

import { EVENTS } from '../../shared/events.js';
import { CHAT_MAX_CHARS, ERROR_CODES } from '../../shared/constants.js';
import { areaAt, isClosedArea } from '../geo/canHear.js';
import { getPlayer, listPlayersInRoom } from './players.js';
import { getRoomAreas } from './roomAreas.js';

/**
 * Check a chat:send payload. Returns the cleaned text, or an error message.
 * @returns {{ ok: true, text: string } | { ok: false, message: string }}
 */
export function readChatText(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (text === '') return { ok: false, message: 'Chat ignored: send { text } with some words in it.' };
  if (text.length > CHAT_MAX_CHARS) return { ok: false, message: `Chat ignored: a message can be at most ${CHAT_MAX_CHARS} characters.` };
  return { ok: true, text };
}

/**
 * A browser sent EVENTS.CHAT_SEND { text }.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {(socket, code, message) => void} sendError
 */
export function handleChat(io, socket, payload, sendError) {
  const sender = getPlayer(socket.id);
  if (!sender) {
    sendError(socket, ERROR_CODES.NOT_JOINED, 'Join first: send EVENTS.JOIN before chatting.');
    return;
  }
  const checked = readChatText(payload);
  if (!checked.ok) {
    sendError(socket, ERROR_CODES.BAD_CHAT, checked.message);
    return;
  }

  // Where is the sender standing, right now? (In memory: no database query per message.)
  const areas = getRoomAreas(sender.roomId);
  const area = areaAt(areas, sender.x, sender.y);
  if (!isClosedArea(area)) {
    sendError(socket, ERROR_CODES.BAD_CHAT, 'Chat ignored: area chat works inside a room (meeting room, booth, pod, focus room or stage hall).');
    return;
  }

  const message = { areaId: area.id, areaName: area.name, from: { id: sender.id, name: sender.name }, text: checked.text, t: Date.now() };
  let delivered = 0;
  for (const player of listPlayersInRoom(sender.roomId)) {
    if (areaAt(areas, player.x, player.y)?.id === area.id) {
      io.to(player.id).emit(EVENTS.CHAT_MESSAGE, message);
      delivered += 1;
    }
  }
  console.log(`[signaling] chat in ${area.name} (${sender.roomId}) from ${sender.name}: ${delivered} reader(s)`);
}
