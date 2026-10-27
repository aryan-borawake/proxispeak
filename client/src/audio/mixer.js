/**
 * Spatial Audio Mixer for ProxiSpeak (Module 4)
 * 
 * Manages Web Audio API graph for peer audio streams:
 *   MediaStream -> MediaStreamSourceNode -> GainNode -> StereoPannerNode -> Destination
 */

import { distanceToGain, dxToPan } from './formulas.js';

export function createMixer() {
  let audioCtx = null;
  const peers = new Map();

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    return audioCtx;
  }

  return {
    /**
     * Exposes current AudioContext state ('suspended', 'running', etc.)
     */
    getState: () => {
      return audioCtx ? audioCtx.state : 'uninitialized';
    },

    /**
     * Resumes the AudioContext after user interaction (clicks/taps).
     */
    resume: async () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      return ctx.state;
    },

    /**
     * Adds a peer audio stream to the mixer.
     * @param {string} id - Peer user identifier
     * @param {MediaStream} mediaStream - The incoming WebRTC or simulated MediaStream
     */
    addPeer: (id, mediaStream) => {
      if (peers.has(id)) {
        return; // Already added
      }

      const ctx = getAudioContext();

      // Chrome quirk: remote MediaStreams must be attached to a muted <audio> element to flow into Web Audio API
      let audioElement = null;
      try {
        audioElement = document.createElement('audio');
        audioElement.muted = true;
        audioElement.srcObject = mediaStream;
        audioElement.play().catch(() => {
          // Auto-play might be pending click; safe to ignore error here
        });
      } catch (err) {
        console.warn('Audio element binding error:', err);
      }

      // Create Web Audio Nodes
      const sourceNode = ctx.createMediaStreamSource(mediaStream);
      const gainNode = ctx.createGain();
      const pannerNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

      // Start muted until positions are calculated
      gainNode.gain.setValueAtTime(0, ctx.currentTime);

      // Connect graph: source -> gain -> (panner) -> destination
      if (pannerNode) {
        pannerNode.pan.setValueAtTime(0, ctx.currentTime);
        sourceNode.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(ctx.destination);
      } else {
        sourceNode.connect(gainNode);
        gainNode.connect(ctx.destination);
      }

      peers.set(id, {
        id,
        mediaStream,
        audioElement,
        sourceNode,
        gainNode,
        pannerNode,
        mode: 'falloff', // 'falloff' (default) or 'full' (private rooms)
        lastGain: 0,
        lastPan: 0,
      });
    },

    /**
     * Removes a peer and properly disconnects all audio nodes to prevent memory leaks.
     * @param {string} id - Peer user identifier
     */
    removePeer: (id) => {
      const peer = peers.get(id);
      if (!peer) return;

      try {
        peer.sourceNode.disconnect();
        peer.gainNode.disconnect();
        if (peer.pannerNode) {
          peer.pannerNode.disconnect();
        }
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
          peer.audioElement.remove();
        }
      } catch (err) {
        console.warn(`Error disconnecting peer ${id}:`, err);
      }

      peers.delete(id);
    },

    /**
     * Sets playback mode for a peer:
     * - 'falloff': regular distance attenuation (quieter as you move away)
     * - 'full': maximum volume regardless of distance (e.g. inside private room)
     */
    setMode: (id, mode) => {
      const peer = peers.get(id);
      if (peer) {
        peer.mode = mode;
      }
    },

    /**
     * Updates gain and panning for all active peers based on the latest position frame.
     * Called on each frame (60 FPS) from the 2D world loop.
     * 
     * @param {Object} frame - { self: { id, x, y }, others: [{ id, x, y, blocked }] }
     */
    update: (frame) => {
      if (!audioCtx || audioCtx.state !== 'running' || !frame || !frame.self) {
        return;
      }

      const { self, others } = frame;
      const now = audioCtx.currentTime;
      // Smooth interpolation constant (50ms) to avoid pops/clicks
      const TIME_CONSTANT = 0.05;

      const otherMap = new Map();
      if (Array.isArray(others)) {
        for (const other of others) {
          otherMap.set(other.id, other);
        }
      }

      for (const [id, peer] of peers.entries()) {
        const other = otherMap.get(id);
        if (!other) {
          // Peer not found in position frame; smoothly silence them
          peer.gainNode.gain.setTargetAtTime(0, now, TIME_CONSTANT);
          peer.lastGain = 0;
          continue;
        }

        const dx = other.x - self.x;
        const dy = other.y - self.y;
        const distance = Math.hypot(dx, dy);

        let targetGain = 0;
        if (peer.mode === 'full') {
          targetGain = 1.0;
        } else {
          targetGain = distanceToGain(distance);
        }

        // If line of sight is blocked by a wall, apply attenuation
        if (other.blocked) {
          targetGain *= 0.3; // Muffled by wall
        }

        const targetPan = dxToPan(dx);

        // Apply smoothly using setTargetAtTime
        peer.gainNode.gain.setTargetAtTime(targetGain, now, TIME_CONSTANT);
        peer.lastGain = targetGain;

        if (peer.pannerNode) {
          peer.pannerNode.pan.setTargetAtTime(targetPan, now, TIME_CONSTANT);
          peer.lastPan = targetPan;
        }
      }
    },

    /**
     * Returns peer diagnostics for UI meters/debugging.
     */
    getPeerDiagnostics: () => {
      const diagnostics = [];
      for (const [id, peer] of peers.entries()) {
        diagnostics.push({
          id,
          mode: peer.mode,
          gain: peer.lastGain,
          pan: peer.lastPan,
        });
      }
      return diagnostics;
    },

    /**
     * Helper to create a synthetic continuous tone MediaStream for testing in AudioLab.
     * Generates a pleasant synthesized audio stream without needing external files.
     */
    createSyntheticStream: (freq = 440, label = 'Tone') => {
      const ctx = getAudioContext();
      const dest = ctx.createMediaStreamDestination();
      
      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();

      osc.type = 'triangle'; // Softer, warmer than sine or saw
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      toneGain.gain.setValueAtTime(0.2, ctx.currentTime); // pleasant default volume

      osc.connect(toneGain);
      toneGain.connect(dest);
      osc.start();

      return {
        stream: dest.stream,
        stop: () => {
          try {
            osc.stop();
            osc.disconnect();
            toneGain.disconnect();
          } catch (_) {}
        }
      };
    }
  };
}
