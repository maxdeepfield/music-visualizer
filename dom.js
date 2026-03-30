import afLogoUrl from "./assets/af-logo.png";

export const dom = {
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  titleInput: document.getElementById("title-input"),
  backgroundImageInput: document.getElementById("background-image-input"),
  backgroundImageLabel: document.getElementById("background-image-label"),
  clearBackgroundImageBtn: document.getElementById("clear-background-image-btn"),
  playBtn: document.getElementById("play-btn"),
  stopBtn: document.getElementById("stop-btn"),
  exportBtn: document.getElementById("export-btn"),
  templateSelect: document.getElementById("template-select"),
  randomizeColorsBtn: document.getElementById("randomize-colors-btn"),
  muteExportCheckbox: document.getElementById("mute-export-checkbox"),
  sensitivityRange: document.getElementById("sensitivity-range"),
  barCountRange: document.getElementById("bar-count-range"),
  trackTitle: document.getElementById("track-title"),
  statusText: document.getElementById("status-text"),
  visualizer: document.getElementById("visualizer"),
  stageWrap: document.querySelector(".stage-wrap"),
};

export const ctx = dom.visualizer.getContext("2d");
export const afLogo = new Image();
export const overlayFontFamily = '"Ubuntu Condensed", sans-serif';

afLogo.src = afLogoUrl;

export async function ensureOverlayFontsReady() {
  if (!document.fonts?.load) {
    return;
  }

  await Promise.allSettled([
    document.fonts.load(`400 30px ${overlayFontFamily}`),
    document.fonts.load(`400 68px ${overlayFontFamily}`),
  ]);
}
