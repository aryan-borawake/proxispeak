/**
 * Microphone Level Meter using Web Audio AnalyserNode (Module 4)
 */

export function createMicMeter(stream) {
  if (!stream) {
    return {
      getLevel: () => 0,
      stop: () => {},
    };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContextClass();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.4;

  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  return {
    /**
     * Returns audio volume level from 0.0 (silent) to 1.0 (loud).
     */
    getLevel: () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      return Math.min(1.0, avg / 128); // Normalized 0..1
    },

    stop: () => {
      try {
        source.disconnect();
        analyser.disconnect();
        ctx.close();
      } catch (_) {}
    }
  };
}
