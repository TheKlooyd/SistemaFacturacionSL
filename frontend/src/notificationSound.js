// Generic computer-generated alert tone (Web Audio API, no audio file needed).
let audioCtx = null;
let intervalId = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function beep(delay = 0, frequency = 880) {
  const ctx = getAudioContext();
  const startAt = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.25);
}

function chime() {
  beep(0, 880);
  beep(0.18, 1046);
}

/** Starts a repeating chime; safe to call repeatedly, it's a no-op while already playing. */
export function startNotificationSound() {
  if (intervalId) return;
  chime();
  intervalId = window.setInterval(chime, 1800);
}

/** Stops the repeating chime. */
export function stopNotificationSound() {
  if (intervalId) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
