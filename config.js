export const CAPTURE_SUPPORTED =
  typeof window.MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  "captureStream" in HTMLCanvasElement.prototype;

export const MP4_MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];

export const ANALYSER_FFT_SIZE = 1024;
export const ANALYSER_SMOOTHING = 0.38;
export const BAR_ATTACK = 0.82;
export const BAR_RELEASE = 0.34;
export const BASS_ATTACK = 0.72;
export const BASS_RELEASE = 0.24;
export const BASS_FLOOR_RISE = 0.022;
export const BASS_FLOOR_FALL = 0.06;
