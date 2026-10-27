// client/src/rtc/mic.js — Person 1 (Module 1: Signaling + WebRTC)
// Task 7: turn on the microphone. Other code imports getMicStream from ./index.js, not from here.

// What we ask the microphone for. Echo cancellation stops my speakers' sound going back into
// my microphone; noise suppression lowers fans and keyboard noise. No camera.
const MIC_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true },
  video: false,
};

/**
 * Ask the browser for the microphone. The browser shows a permission pop-up the first time.
 * Errors become clear messages that say what went wrong and what to do.
 *
 * Example: const micStream = await getMicStream();   // MediaStream with one audio track
 *
 * @returns {Promise<MediaStream>} live microphone audio
 */
export async function getMicStream() {
  // Browsers only allow the microphone on a "secure context": an https page, or localhost.
  // On http://192.168.x.x the browser hides navigator.mediaDevices completely.
  if (!window.isSecureContext) {
    throw new Error(
      '[rtc] The microphone needs https or localhost. Open the app at http://localhost:5173 ' +
        '(not your IP address), or serve it over https.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('[rtc] This browser cannot use the microphone (no getUserMedia). Try a recent Chrome or Firefox.');
  }

  try {
    const micStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    console.log(`[rtc] microphone on: ${micStream.getAudioTracks()[0]?.label || 'unnamed microphone'}`);
    return micStream;
  } catch (error) {
    // error.name tells us what kind of failure it was.
    if (error.name === 'NotAllowedError') {
      throw new Error(
        '[rtc] Microphone permission was denied. Click the icon left of the address bar, ' +
          'allow the microphone for this site, then reload the page.',
      );
    }
    if (error.name === 'NotFoundError') {
      throw new Error('[rtc] No microphone was found. Plug one in (or turn it on in your system settings) and try again.');
    }
    throw new Error(`[rtc] Could not start the microphone (${error.name}): ${error.message}`);
  }
}
