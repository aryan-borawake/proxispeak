// client/src/app/useVoiceSession.js — Person 1
// The voice wiring, in ONE place, used by both the office (OfficePage) and the test page (OfficeLab):
//
//   getMicStream ──► rtc manager (one WebRTC connection per nearby person, Person 1)
//                        │ onRemoteStream / onPeerClosed / onPeerMode
//                        ▼
//                     mixer (Person 4): volume by distance, left/right by position ──► speakers
//   WorldCanvas ── onFrame(frame) ──► mixer.update(frame)
//
// Remote voices play ONLY through the mixer (Web Audio). A normal <audio> element would play the
// voice at full volume whatever the distance, and the distance volume would not work.
//
// A "hook" is a function a React component calls; this one keeps the mixer, microphone and rtc
// manager in refs (boxes that hold a value without redrawing the page) and cleans them up when the
// component goes away. React StrictMode mounts, unmounts and mounts once in development, so nothing
// is created at mount time: startAudio() runs on a click ("Join"), when the browser allows sound.

import { useCallback, useEffect, useRef } from 'react';
import { net } from '../net/index.js';
import { getMicStream, createRtcManager } from '../rtc/index.js';
import { createMixer } from '../audio/index.js';

// How long startAudio waits for the browser to switch sound on before carrying on.
const RESUME_WAIT_MS = 1500;

export function useVoiceSession() {
  const mixerRef = useRef(null); // Person 4's mixer
  const rtcRef = useRef(null); // my rtc manager
  const micRef = useRef(null); // the microphone stream
  const frameRef = useRef(null); // the latest frame from WorldCanvas (60 times a second)
  const mutedRef = useRef(false); // kept across rtc rebuilds

  // onFrame must be a STABLE function (the same one on every redraw), because WorldCanvas restarts
  // its game loop when onFrame changes. useCallback with [] creates it once.
  const onFrame = useCallback((frame) => {
    frameRef.current = frame;
    if (mixerRef.current) {
      mixerRef.current.update(frame); // volume and left/right for every voice
    }
  }, []);

  /**
   * 1. The mixer, resumed straight away (browsers keep sound off until the user clicks; this click
   *    is our permission). 2. The microphone. Throws an Error with a clear message on failure.
   * @returns {Promise<MediaStream>}
   */
  const startAudio = useCallback(async () => {
    if (!mixerRef.current) {
      mixerRef.current = createMixer();
    }
    try {
      // Without a recent click (e.g. the office page was reloaded), the browser may keep resume()
      // waiting until the next click. Don't wait forever: carry on after RESUME_WAIT_MS; the page
      // resumes the sound on the first click (resumeOnClick).
      await Promise.race([mixerRef.current.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS))]);
    } catch (error) {
      throw new Error(`[audio] Could not start sound: ${error.message}`);
    }
    if (!micRef.current) {
      micRef.current = await getMicStream();
    }
    return micRef.current;
  }, []);

  /**
   * Make (or re-make) the rtc manager for my id. Call it IMMEDIATELY after joining (no other await
   * before it): the first peers:update, and maybe an offer, can arrive very soon after joining.
   * Also after a re-join (new selfId) or a floor change (same id, new people): the old manager is
   * closed first, and its onPeerClosed takes every old voice out of the mixer.
   */
  const startRtc = useCallback((selfId) => {
    const mixer = mixerRef.current;
    const micStream = micRef.current;
    if (!mixer || !micStream) return;
    if (rtcRef.current) {
      rtcRef.current.closeAll();
    }
    rtcRef.current = createRtcManager({
      net,
      selfId,
      micStream,
      onRemoteStream: (id, remoteStream) => mixer.addPeer(id, remoteStream),
      onPeerClosed: (id) => mixer.removePeer(id),
      onPeerMode: (id, mode) => mixer.setMode(id, mode),
    });
    rtcRef.current.setMuted(mutedRef.current);
  }, []);

  /** Mute: turn my microphone track off, so nobody hears me. */
  const setMuted = useCallback((muted) => {
    mutedRef.current = muted;
    if (rtcRef.current) {
      rtcRef.current.setMuted(muted);
    }
  }, []);

  /** Hang up on everyone, turn the microphone off, and take every voice out of the mixer. */
  const stopAll = useCallback(() => {
    if (rtcRef.current) {
      rtcRef.current.closeAll();
      rtcRef.current = null;
    }
    if (micRef.current) {
      for (const track of micRef.current.getTracks()) track.stop();
      micRef.current = null;
    }
    if (mixerRef.current) {
      // The mixer has no "close"; removePeer for each voice is all we can do (closeAll already did
      // it through onPeerClosed; this is a safety net).
      for (const { id } of mixerRef.current.getPeerDiagnostics()) {
        mixerRef.current.removePeer(id);
      }
      mixerRef.current = null;
    }
  }, []);

  /** Is the sound actually on? false while the browser waits for a click. */
  const isSoundOn = useCallback(() => mixerRef.current?.getState() === 'running', []);

  /** Try again to switch the sound on (call it from a click). */
  const resumeSound = useCallback(() => {
    mixerRef.current?.resume().catch(() => {});
  }, []);

  // When the page goes away, stop everything.
  useEffect(() => stopAll, [stopAll]);

  return { mixerRef, rtcRef, micRef, frameRef, onFrame, startAudio, startRtc, setMuted, stopAll, isSoundOn, resumeSound };
}
