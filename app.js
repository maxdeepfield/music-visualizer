import "./vendor/fix-webm-duration.js";

import { CAPTURE_SUPPORTED } from "./config.js";
import { dom, ctx, afLogo, ensureOverlayFontsReady, overlayFontFamily } from "./dom.js";
import { createMediaController } from "./media-controller.js";
import { createRenderer } from "./renderer.js";
import { applySavedSettings, saveSettings as persistSettings } from "./settings.js";
import { state } from "./state.js";
import { buildColorTheme, isValidColorTheme } from "./theme.js";
import { stripExtension } from "./utils.js";

function getDisplayTitle() {
  const customTitle = dom.titleInput?.value.trim();

  if (customTitle) {
    return customTitle;
  }

  if (state.file) {
    return stripExtension(state.file.name);
  }

  return "";
}

function getDefaultTrackTitle() {
  return state.file ? stripExtension(state.file.name) : "";
}

function syncCustomTitleState() {
  const customTitle = dom.titleInput?.value.trim() || "";
  const defaultTrackTitle = getDefaultTrackTitle();
  state.hasCustomTitle = Boolean(customTitle) && customTitle !== defaultTrackTitle;
}

function syncTrackTitle() {
  dom.trackTitle.textContent = state.file ? (getDisplayTitle() || "No track loaded") : "No track loaded";
}

function isCrossTemplate() {
  return dom.templateSelect.value === "cross" || dom.templateSelect.value === "winter-neon" || dom.templateSelect.value === "mirror-mirror";
}

function isWinterTemplate() {
  return dom.templateSelect.value === "winter-neon";
}

function applyTemplateDefaults() {
  if (!isWinterTemplate()) {
    return;
  }

  dom.sensitivityRange.value = dom.sensitivityRange.max;
  dom.barCountRange.value = dom.barCountRange.min;
}

function setStatus(message) {
  if (dom.statusText.textContent !== message) {
    dom.statusText.textContent = message;
  }
}

function refreshStageOverlay() {
  return;
}

function getColorTheme() {
  if (!state.colorTheme) {
    state.colorTheme = buildColorTheme(dom.templateSelect.value);
  }

  return state.colorTheme;
}

function saveSettings() {
  persistSettings({ dom, state, buildColorTheme });
}

let mediaController;

function updateBackgroundImageControls() {
  dom.backgroundImageLabel.textContent = state.backgroundImage ? "Photo selected" : "Choose photo";
  dom.backgroundImageLabel.title = state.backgroundImageName || "";
  dom.clearBackgroundImageBtn.disabled = !state.backgroundImage || state.isRecording;
  dom.backgroundImageInput.disabled = state.isRecording;
  dom.backgroundOpacityRange.disabled = !state.backgroundImage || state.isRecording;
}

function revokeBackgroundImageObjectUrl() {
  if (state.backgroundImageObjectUrl) {
    URL.revokeObjectURL(state.backgroundImageObjectUrl);
    state.backgroundImageObjectUrl = "";
  }
}

function clearBackgroundImage({ preserveInput = false } = {}) {
  revokeBackgroundImageObjectUrl();
  state.backgroundImage = null;
  state.backgroundImageName = "";
  updateBackgroundImageControls();
  invalidateExport();

  if (!preserveInput) {
    dom.backgroundImageInput.value = "";
  }
}

async function loadBackgroundImage(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("That file does not look like an image. Choose a photo to use as the background.");
    dom.backgroundImageInput.value = "";
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image could not be decoded."));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    setStatus(`Background photo failed to load: ${error.message}`);
    dom.backgroundImageInput.value = "";
    return;
  }

  revokeBackgroundImageObjectUrl();
  state.backgroundImage = image;
  state.backgroundImageName = file.name;
  state.backgroundImageObjectUrl = objectUrl;
  updateBackgroundImageControls();
  invalidateExport();
  setStatus(`Background photo loaded: ${file.name}.`);
  dom.backgroundImageInput.value = "";
}

function updateExportButtonLabel() {
  if (state.isRecording) {
    dom.exportBtn.textContent = "Exporting...";
    return;
  }

  dom.exportBtn.textContent = state.downloadUrl && !state.exportDirty
    ? "Download Record"
    : "Export Video";
}

function updateSupportState() {
  if (!CAPTURE_SUPPORTED) {
    dom.exportBtn.title = "MediaRecorder or canvas capture is not supported here.";
    return;
  }

  dom.exportBtn.title = mediaController.pickMimeType()
    ? "MP4 export supported."
    : "This browser does not expose MP4 MediaRecorder export.";
}

function updateButtons() {
  const hasTrack = Boolean(state.file && state.audioBuffer);
  const mp4Supported = Boolean(mediaController.pickMimeType());
  dom.fileInput.value = "";
  dom.playBtn.disabled = !hasTrack || state.isRecording;
  dom.stopBtn.disabled = !hasTrack || (!state.isPlaying && !state.isRecording && state.playbackOffset === 0);
  dom.exportBtn.disabled = !hasTrack || !CAPTURE_SUPPORTED || !mp4Supported || state.isRecording;
  dom.titleInput.disabled = !hasTrack || state.isRecording;
  dom.randomizeColorsBtn.disabled = state.isRecording;
  dom.fileInput.disabled = state.isRecording;
  updateBackgroundImageControls();
  updateExportButtonLabel();
}

function invalidateExport() {
  mediaController.resetDownloadLink();
  updateButtons();
}

function handleDragState(event, isDragging) {
  event.preventDefault();
  dom.dropZone.classList.toggle("drag-over", isDragging);
  dom.stageWrap.classList.toggle("drag-over", isDragging);
}

mediaController = createMediaController({
  dom,
  state,
  setStatus,
  updateButtons,
  refreshStageOverlay,
  syncTrackTitle,
  invalidateExport,
  getDisplayTitle,
  ensureOverlayFontsReady,
  saveSettings,
});

const renderer = createRenderer({
  dom,
  ctx,
  afLogo,
  overlayFontFamily,
  state,
  getColorTheme,
  getCurrentPlaybackTime: mediaController.getCurrentPlaybackTime,
  getDisplayTitle,
  getTrackDuration: mediaController.getTrackDuration,
  isCrossTemplate,
  isWinterTemplate,
  setStatus,
});

dom.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (file) {
    await mediaController.loadFile(file);
  }
});

dom.backgroundImageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) {
    await loadBackgroundImage(file);
  }
});

dom.clearBackgroundImageBtn.addEventListener("click", () => {
  clearBackgroundImage();
  setStatus("Background photo cleared.");
});

dom.playBtn.addEventListener("click", () => {
  void mediaController.togglePlayback();
});

dom.stopBtn.addEventListener("click", () => {
  mediaController.handleStop();
});

dom.exportBtn.addEventListener("click", () => {
  if (mediaController.downloadLastRecord()) {
    return;
  }

  void mediaController.exportVideo();
});

dom.muteExportCheckbox.addEventListener("change", mediaController.syncPlaybackGain);
dom.muteExportCheckbox.addEventListener("change", saveSettings);
dom.titleInput.addEventListener("input", () => {
  syncCustomTitleState();
  syncTrackTitle();
  invalidateExport();
  saveSettings();
});
dom.randomizeColorsBtn.addEventListener("click", () => {
  state.colorTheme = buildColorTheme(dom.templateSelect.value, true);
  invalidateExport();
  saveSettings();
  setStatus(`Colors randomized for ${dom.templateSelect.options[dom.templateSelect.selectedIndex].text}.`);
});
dom.templateSelect.addEventListener("change", () => {
  applyTemplateDefaults();
  state.colorTheme = buildColorTheme(dom.templateSelect.value);
  invalidateExport();
  saveSettings();
});
dom.sensitivityRange.addEventListener("input", () => {
  invalidateExport();
  saveSettings();
});
dom.backgroundOpacityRange.addEventListener("input", () => {
  invalidateExport();
  saveSettings();
});
dom.barCountRange.addEventListener("input", () => {
  invalidateExport();
  saveSettings();
});

["dragenter", "dragover"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => handleDragState(event, true));
});

["dragleave", "dragend"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => handleDragState(event, false));
});

document.addEventListener("drop", async (event) => {
  handleDragState(event, false);
  const [file] = event.dataTransfer?.files || [];
  if (file) {
    await mediaController.loadFile(file);
  }
});

window.addEventListener("beforeunload", mediaController.resetDownloadLink);
window.addEventListener("beforeunload", revokeBackgroundImageObjectUrl);

applySavedSettings({ dom, state, buildColorTheme, isValidColorTheme });
syncCustomTitleState();
updateSupportState();
updateButtons();
refreshStageOverlay();
syncTrackTitle();
updateBackgroundImageControls();
void ensureOverlayFontsReady();
renderer.drawScene(performance.now());
