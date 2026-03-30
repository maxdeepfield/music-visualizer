import { clamp, lerp, randomInRange } from "./utils.js";

export const COLOR_THEME_KEYS = [
  "backgroundStart",
  "backgroundMid",
  "backgroundEnd",
  "vignetteCenter",
  "vignetteMid",
  "vignetteEdge",
  "orbGlow",
  "orbCore",
  "ring",
  "frame",
  "logoGlow",
  "progressTrack",
  "progressFill",
  "mirrorPrimary",
  "mirrorSecondary",
  "overlayTitle",
  "overlayMeta",
  "winterWhite",
  "winterSnow",
  "winterFrost",
];

export function rgbFromHsl(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const s = clamp(saturation / 100, 0, 1);
  const l = clamp(lightness / 100, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = secondary;
  } else if (segment < 2) {
    red = secondary;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = secondary;
  } else if (segment < 4) {
    green = secondary;
    blue = chroma;
  } else if (segment < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const match = l - chroma / 2;
  const r = Math.round((red + match) * 255);
  const g = Math.round((green + match) * 255);
  const b = Math.round((blue + match) * 255);

  return [r, g, b];
}

export function rgbaFromRgb(red, green, blue, alpha) {
  return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
}

export function rgbaFromHsl(hue, saturation, lightness, alpha) {
  return rgbaFromRgb(...rgbFromHsl(hue, saturation, lightness), alpha);
}

export function mixColor(from, to, amount) {
  return from.map((value, index) => lerp(value, to[index], amount));
}

function createDefaultColorTheme(template) {
  if (template === "winter-neon") {
    return {
      backgroundStart: [9, 19, 29],
      backgroundMid: [168, 216, 255],
      backgroundEnd: [2, 7, 13],
      vignetteCenter: [236, 248, 255],
      vignetteMid: [34, 58, 78],
      vignetteEdge: [2, 8, 12],
      orbGlow: [228, 245, 255],
      orbCore: [10, 22, 33],
      ring: [232, 247, 255],
      frame: [214, 238, 255],
      logoGlow: [214, 238, 255],
      progressTrack: [214, 237, 255],
      progressFill: [245, 251, 255],
      mirrorPrimary: [214, 237, 255],
      mirrorSecondary: [179, 224, 255],
      overlayTitle: [255, 255, 255],
      overlayMeta: [165, 188, 201],
      winterWhite: [245, 251, 255],
      winterSnow: [214, 237, 255],
      winterFrost: [179, 224, 255],
      crossHueBase: 0,
    };
  }

  if (template === "cross") {
    return {
      backgroundStart: [7, 19, 28],
      backgroundMid: [17, 65, 83],
      backgroundEnd: [5, 11, 17],
      vignetteCenter: [255, 255, 255],
      vignetteMid: [8, 16, 22],
      vignetteEdge: [2, 8, 12],
      orbGlow: [159, 240, 214],
      orbCore: [4, 16, 24],
      ring: [247, 178, 103],
      frame: [247, 178, 103],
      logoGlow: [255, 255, 255],
      progressTrack: [159, 240, 214],
      progressFill: [247, 178, 103],
      mirrorPrimary: [159, 240, 214],
      mirrorSecondary: [247, 178, 103],
      overlayTitle: [255, 255, 255],
      overlayMeta: [165, 188, 201],
      winterWhite: [245, 251, 255],
      winterSnow: [214, 237, 255],
      winterFrost: [179, 224, 255],
      crossHueBase: 0,
    };
  }

  return {
    backgroundStart: [7, 19, 28],
    backgroundMid: [17, 65, 83],
    backgroundEnd: [5, 11, 17],
    vignetteCenter: [255, 255, 255],
    vignetteMid: [8, 16, 22],
    vignetteEdge: [2, 8, 12],
    orbGlow: [159, 240, 214],
    orbCore: [4, 16, 24],
    ring: [247, 178, 103],
    frame: [247, 178, 103],
    logoGlow: [255, 255, 255],
    progressTrack: [159, 240, 214],
    progressFill: [247, 178, 103],
    mirrorPrimary: [159, 240, 214],
    mirrorSecondary: [247, 178, 103],
    overlayTitle: [255, 255, 255],
    overlayMeta: [165, 188, 201],
    winterWhite: [245, 251, 255],
    winterSnow: [214, 237, 255],
    winterFrost: [179, 224, 255],
    crossHueBase: 0,
  };
}

function createRandomColorTheme(template) {
  const baseHue = randomInRange(0, 360);
  const accentHue = (baseHue + randomInRange(35, 210)) % 360;
  const tertiaryHue = (accentHue + randomInRange(25, 170)) % 360;
  const ambientHue = (baseHue + randomInRange(-45, 45) + 360) % 360;
  const lightMode = Math.random() < 0.35;
  const templateBoost = template === "winter-neon" ? 8 : 0;

  if (lightMode) {
    return {
      backgroundStart: rgbFromHsl(ambientHue, randomInRange(24, 48), randomInRange(92, 97)),
      backgroundMid: rgbFromHsl(baseHue, randomInRange(46, 82), randomInRange(74, 88)),
      backgroundEnd: rgbFromHsl(tertiaryHue, randomInRange(18, 42), randomInRange(86, 94)),
      vignetteCenter: rgbFromHsl(baseHue, randomInRange(18, 34), randomInRange(98, 100)),
      vignetteMid: rgbFromHsl(ambientHue, randomInRange(20, 40), randomInRange(78, 88)),
      vignetteEdge: rgbFromHsl(ambientHue, randomInRange(16, 34), randomInRange(70, 84)),
      orbGlow: rgbFromHsl(baseHue, randomInRange(70, 96), randomInRange(70, 84)),
      orbCore: rgbFromHsl(ambientHue, randomInRange(32, 56), randomInRange(16, 26)),
      ring: rgbFromHsl(accentHue, randomInRange(74, 96), randomInRange(48, 68)),
      frame: rgbFromHsl(tertiaryHue, randomInRange(60, 90), randomInRange(52, 72)),
      logoGlow: rgbFromHsl(baseHue, randomInRange(42, 72), randomInRange(90, 98)),
      progressTrack: rgbFromHsl(baseHue, randomInRange(40, 70), randomInRange(56, 70)),
      progressFill: rgbFromHsl(accentHue, randomInRange(72, 96), randomInRange(44, 62)),
      mirrorPrimary: rgbFromHsl(baseHue, randomInRange(70, 94), randomInRange(50, 68 + templateBoost)),
      mirrorSecondary: rgbFromHsl(accentHue, randomInRange(70, 94), randomInRange(48, 66 + templateBoost)),
      overlayTitle: rgbFromHsl(ambientHue, randomInRange(18, 34), randomInRange(14, 24)),
      overlayMeta: rgbFromHsl(ambientHue, randomInRange(16, 26), randomInRange(34, 48)),
      winterWhite: rgbFromHsl(baseHue, randomInRange(18, 30), randomInRange(98, 100)),
      winterSnow: rgbFromHsl(baseHue, randomInRange(42, 78), randomInRange(82, 92)),
      winterFrost: rgbFromHsl(accentHue, randomInRange(36, 72), randomInRange(76, 88)),
      crossHueBase: randomInRange(0, 360),
    };
  }

  return {
    backgroundStart: rgbFromHsl(ambientHue, randomInRange(34, 66), randomInRange(4, 12)),
    backgroundMid: rgbFromHsl(baseHue, randomInRange(44, 82), randomInRange(16, 34)),
    backgroundEnd: rgbFromHsl(tertiaryHue, randomInRange(30, 58), randomInRange(3, 10)),
    vignetteCenter: rgbFromHsl(baseHue, randomInRange(18, 42), randomInRange(94, 100)),
    vignetteMid: rgbFromHsl(ambientHue, randomInRange(22, 44), randomInRange(8, 20)),
    vignetteEdge: rgbFromHsl(ambientHue, randomInRange(30, 60), randomInRange(2, 8)),
    orbGlow: rgbFromHsl(baseHue, randomInRange(74, 98), randomInRange(66, 84)),
    orbCore: rgbFromHsl(ambientHue, randomInRange(28, 52), randomInRange(6, 14)),
    ring: rgbFromHsl(accentHue, randomInRange(72, 98), randomInRange(58, 80)),
    frame: rgbFromHsl(tertiaryHue, randomInRange(62, 94), randomInRange(56, 78)),
    logoGlow: rgbFromHsl(baseHue, randomInRange(28, 56), randomInRange(88, 98)),
    progressTrack: rgbFromHsl(baseHue, randomInRange(60, 90), randomInRange(60, 78)),
    progressFill: rgbFromHsl(accentHue, randomInRange(72, 98), randomInRange(56, 74)),
    mirrorPrimary: rgbFromHsl(baseHue, randomInRange(72, 98), randomInRange(62, 82 + templateBoost)),
    mirrorSecondary: rgbFromHsl(accentHue, randomInRange(72, 98), randomInRange(56, 76 + templateBoost)),
    overlayTitle: [255, 255, 255],
    overlayMeta: rgbFromHsl(baseHue, randomInRange(10, 24), randomInRange(72, 84)),
    winterWhite: rgbFromHsl(baseHue, randomInRange(10, 22), randomInRange(98, 100)),
    winterSnow: rgbFromHsl(baseHue, randomInRange(48, 78), randomInRange(84, 94)),
    winterFrost: rgbFromHsl(accentHue, randomInRange(46, 78), randomInRange(78, 90)),
    crossHueBase: randomInRange(0, 360),
  };
}

export function buildColorTheme(template, randomize = false) {
  return randomize ? createRandomColorTheme(template) : createDefaultColorTheme(template);
}

function isValidColorTriplet(value) {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255);
}

export function isValidColorTheme(value) {
  if (!value || typeof value !== "object" || !Number.isFinite(value.crossHueBase)) {
    return false;
  }

  return COLOR_THEME_KEYS.every((key) => isValidColorTriplet(value[key]));
}
