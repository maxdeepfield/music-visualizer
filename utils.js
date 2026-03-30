export const lerp = (from, to, amount) => from + (to - from) * amount;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const randomInRange = (min, max) => min + Math.random() * (max - min);

export function stripExtension(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

export function sanitizeFileName(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 96) || "music-video";
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
