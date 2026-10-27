// client/src/rtc/rtcManager.js — Person 1 (Module 1: Signaling + WebRTC)
// The rtc manager: one direct voice connection (RTCPeerConnection) per nearby person.
// Exact names and shapes: CONTRACTS.md, sections 5 and 7. Plan: docs/briefs/module-1-signaling-webrtc.md,
// Tasks 8–10.
//
// The handshake for one pair, Riya ('a1') and Sam ('b7'), after the server says they are near:
//   1. Both get peers:update entered. Both create a connection and add their microphone to it.
//   2. 'a1' < 'b7', so Riya makes the OFFER ("here are the audio formats I can send") and sends it.
//   3. Sam gets the offer, makes an ANSWER ("okay, here are mine") and sends it back.
//   4. Meanwhile both browsers find ICE CANDIDATES (possible network addresses) and send each one over.
//   5. The browsers try the addresses until one works. connectionState becomes 'connected',
//      ontrack fires, and each side hears the other's voice.
// All the notes travel through our server (net.sendSignal / net.onSignal). The voice does not.

import { EVENTS } from '@shared/events.js';

// STUN: a free Google helper server that tells the browser its public internet address,
// so it can hand that address to the other browser as a candidate.
const STUN_SERVER = { urls: 'stun:stun.l.google.com:19302' };

/**
 * The ICE servers every connection uses: Google's STUN, plus our TURN relay if one is configured.
 * TURN passes the audio along when routers block a direct connection. VITE_TURN_URL is unset
 * for now (Week 4). Vite only gives the browser env variables that start with VITE_.
 */
function buildIceServers() {
  const iceServers = [STUN_SERVER];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return iceServers;
}

/**
 * Create the manager that opens and closes one voice connection per nearby person.
 * It listens to net.onPeersUpdate and net.onSignal. The person with the smaller id
 * (plain string comparison) sends the offer; the other only answers (CONTRACTS.md, section 5).
 *
 * Example: const rtc = createRtcManager({ net, selfId, micStream,
 *            onRemoteStream: (id, stream) => { audioElement.srcObject = stream; },
 *            onPeerClosed: (id) => { ...remove that audio... },
 *            onPeerMode: (id, mode) => { ...'falloff' or 'full'... } });
 *          rtc.setMuted(true);   // nobody hears me
 *          rtc.closeAll();       // hang up on everyone
 *
 * @param {{
 *   net: object,                                   // the net object from client/src/net
 *   selfId: string,                                // my id from net.connect()
 *   micStream: MediaStream,                        // from getMicStream()
 *   onRemoteStream: (id: string, stream: MediaStream) => void,  // a voice arrived
 *   onPeerClosed: (id: string) => void,            // a connection closed
 *   onPeerMode: (id: string, mode: 'falloff' | 'full') => void, // a voice's mode changed
 * }} options
 * @returns {{ setMuted: (muted: boolean) => void, closeAll: () => void,
 *   getPeerStates: () => Array<{ id: string, state: string }> }}
 *   getPeerStates is an extra debug helper for the lab page (not in CONTRACTS.md).
 */
export function createRtcManager({ net, selfId, micStream, onRemoteStream, onPeerClosed, onPeerMode }) {
  const iceServers = buildIceServers();

  // One entry per person I have a connection with:
  //   id → { pc, pendingCandidates, remoteStream }
  //   pc                 the RTCPeerConnection (the browser object for one direct connection)
  //   pendingCandidates  candidates that arrived too early, waiting in a queue (see addOrQueueCandidate)
  //   remoteStream       their voice once it arrives (null until then)
  const peers = new Map();

  // ---------------------------------------------------------------- connections

  /**
   * Create a connection to one person and add my microphone to it.
   * Must stay synchronous (no await): the entry must be in `peers` straight away, so a
   * candidate arriving a moment later finds it and is queued instead of lost.
   */
  function createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers });
    const peer = { pc, pendingCandidates: [], remoteStream: null };
    peers.set(id, peer);

    // Send every microphone track (normally one) over this connection.
    // All connections share the same tracks, so setMuted affects all of them at once.
    for (const track of micStream.getAudioTracks()) {
      pc.addTrack(track, micStream);
    }

    // The browser found a possible network address for us: send it to the other side.
    // event.candidate is null once the browser has finished looking; there is nothing to send then.
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      // toJSON() turns the candidate into a plain object, which Socket.io can send.
      net.sendSignal({ to: id, data: { type: 'candidate', candidate: event.candidate.toJSON() } });
    };

    // Their audio arrived. ontrack fires once per incoming track; we report the stream only once.
    // event.streams[0] is the stream the other side added the track with. If the browser gave
    // no stream, we wrap the bare track in a new MediaStream ourselves.
    pc.ontrack = (event) => {
      if (peer.remoteStream !== null) {
        return;
      }
      peer.remoteStream = event.streams[0] || new MediaStream([event.track]);
      console.log(`[rtc] remote audio from ${id}`);
      callSafely('onRemoteStream', onRemoteStream, id, peer.remoteStream);
    };

    // 'new' → 'connecting' → 'connected' is the happy path. 'failed' means no address worked.
    pc.onconnectionstatechange = () => {
      console.log(`[rtc] connection to ${id}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        // No automatic retry yet (Task 11). Close it so the page doesn't keep a dead connection.
        closePeer(id);
      }
    };

    console.log(`[rtc] connection created for ${id}`);
    return peer;
  }

  /** Close one connection, forget it, and tell the page (onPeerClosed). Does nothing if unknown. */
  function closePeer(id) {
    const peer = peers.get(id);
    if (!peer) {
      return;
    }
    peers.delete(id);

    // Remove our handlers first, so a closing connection can't call us any more.
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();

    console.log(`[rtc] connection closed for ${id}`);
    callSafely('onPeerClosed', onPeerClosed, id);
  }

  /**
   * Is this still the connection we started with? Between two `await`s the person may have
   * walked away (closePeer) or come back (a new entry), so we check before sending anything.
   */
  function isCurrent(id, peer) {
    return peers.get(id) === peer;
  }

  /** I have the smaller id: make the offer and send it. */
  async function sendOffer(id, peer) {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      if (!isCurrent(id, peer)) {
        return;
      }
      net.sendSignal({ to: id, data: { type: 'offer', sdp: peer.pc.localDescription.sdp } });
      console.log(`[rtc] offer sent to ${id}`);
    } catch (error) {
      console.warn(`[rtc] could not make an offer for ${id}:`, error);
    }
  }

  // ---------------------------------------------------------------- ICE candidates

  /**
   * Add a candidate now, or queue it (CONTRACTS.md, section 5, rule 3).
   * Why a queue? The browser can only use a candidate after it knows the other side's
   * description (setRemoteDescription). Candidates can arrive before that finishes;
   * adding them then fails, and the connection may never be made.
   */
  async function addOrQueueCandidate(peer, candidate) {
    if (peer.pc.remoteDescription) {
      await peer.pc.addIceCandidate(candidate);
    } else {
      peer.pendingCandidates.push(candidate);
    }
  }

  /** The remote description is set now: add every queued candidate, then empty the queue. */
  async function flushPendingCandidates(id, peer) {
    // Take the list and empty the queue first, so nothing is added twice.
    const waiting = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of waiting) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn(`[rtc] a queued candidate from ${id} could not be added:`, error);
      }
    }
  }

  // ---------------------------------------------------------------- net listeners

  /**
   * EVENTS.PEERS_UPDATE from the server: { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }.
   */
  function handlePeersUpdate(update) {
    try {
      for (const { id, mode } of update.entered) {
        // The connection may exist already: their offer can arrive before this peers:update.
        let peer = peers.get(id);
        const isNew = !peer;
        if (isNew) {
          peer = createPeer(id);
        }
        callSafely('onPeerMode', onPeerMode, id, mode);

        // Only the smaller id sends the offer, so both sides never offer at once ("glare").
        // Example: 'a1' < 'b7', so a1 offers and b7 waits.
        if (isNew && selfId < id) {
          sendOffer(id, peer); // not awaited: it catches its own errors
        }
      }

      // They walked away (or left): close and forget the connection (rule 4).
      for (const id of update.left) {
        closePeer(id);
      }

      // Same person, new mode (e.g. both walked into a private room; Week 3).
      for (const { id, mode } of update.changed) {
        callSafely('onPeerMode', onPeerMode, id, mode);
      }
    } catch (error) {
      console.warn(`[rtc] could not handle ${EVENTS.PEERS_UPDATE}:`, error);
    }
  }

  /**
   * EVENTS.SIGNAL from the server: { from, data }. `from` was written by the server, so we can trust it.
   * data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
   * Each branch has its own try/catch: one bad note must never break the page.
   */
  async function handleSignal(signal) {
    // `?.` reads a field only if the thing before it exists, so a broken message can't throw here.
    const from = signal?.from;
    const data = signal?.data;

    if (data?.type === 'offer') {
      try {
        // The offer can come before our own peers:update, so create the connection if needed.
        const peer = peers.get(from) || createPeer(from);
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await flushPendingCandidates(from, peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        if (!isCurrent(from, peer)) {
          return;
        }
        net.sendSignal({ to: from, data: { type: 'answer', sdp: peer.pc.localDescription.sdp } });
        console.log(`[rtc] answer sent to ${from}`);
      } catch (error) {
        console.warn(`[rtc] could not answer the offer from ${from}:`, error);
      }
    } else if (data?.type === 'answer') {
      try {
        const peer = peers.get(from);
        // Only use an answer if we are waiting for one (we sent an offer and got nothing back yet).
        if (!peer || peer.pc.signalingState !== 'have-local-offer') {
          console.warn(`[rtc] ignored an answer from ${from}: no offer of ours is waiting for one`);
          return;
        }
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await flushPendingCandidates(from, peer);
        console.log(`[rtc] answer received from ${from}`);
      } catch (error) {
        console.warn(`[rtc] could not use the answer from ${from}:`, error);
      }
    } else if (data?.type === 'candidate') {
      try {
        const peer = peers.get(from);
        // No connection: they walked away a moment ago and this note was already on its way.
        if (!peer) {
          console.warn(`[rtc] ignored a candidate from ${from}: no connection to them`);
          return;
        }
        await addOrQueueCandidate(peer, data.candidate);
      } catch (error) {
        console.warn(`[rtc] could not add a candidate from ${from}:`, error);
      }
    } else {
      console.warn(`[rtc] ignored a signal from ${from} with unknown type:`, data?.type);
    }
  }

  // Start listening. Each on… returns an unsubscribe function, used by closeAll.
  const stopPeersUpdate = net.onPeersUpdate(handlePeersUpdate);
  const stopSignal = net.onSignal(handleSignal);

  // ---------------------------------------------------------------- the manager's functions

  /**
   * Mute or unmute my microphone on every connection at once.
   * A disabled track sends silence; the connections stay open, so unmuting is instant.
   */
  function setMuted(muted) {
    for (const track of micStream.getAudioTracks()) {
      track.enabled = !muted;
    }
    console.log(`[rtc] ${muted ? 'muted' : 'unmuted'}`);
  }

  /** Hang up on everyone and stop listening to net. Safe to call more than once. */
  function closeAll() {
    // Copy the ids first, because closePeer deletes from the Map while we loop.
    for (const id of Array.from(peers.keys())) {
      closePeer(id);
    }
    stopPeersUpdate();
    stopSignal();
  }

  /** Debug helper for the lab: every connection and its state, e.g. [{ id: 'b7', state: 'connected' }]. */
  function getPeerStates() {
    return Array.from(peers, ([id, peer]) => ({ id, state: peer.pc.connectionState }));
  }

  return { setMuted, closeAll, getPeerStates };
}

/**
 * Call one of the page's callbacks, and log (don't throw) if it fails.
 * A mistake in the page's code must not break the voice connections.
 */
function callSafely(name, callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    console.warn(`[rtc] the ${name} callback threw:`, error);
  }
}
