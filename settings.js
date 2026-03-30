import { clamp } from "./utils.js";

const SETTINGS_STORAGE_KEY = "music-visualizer-settings-v1";
const TEMPLATE_VALUES = new Set(["mirror", "cross", "winter-neon"]);

function normalizeRangeInputValue(input, rawValue) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = input.step === "any" ? NaN : Number(input.step);
  const fallback = Number(input.value);
  let nextValue = Number(rawValue);

  if (!Number.isFinite(nextValue)) {
    nextValue = fallback;
  }

  nextValue = clamp(nextValue, min, max);

  if (Number.isFinite(step) && step > 0) {
    nextValue = Math.round((nextValue - min) / step) * step + min;
    const decimals = (input.step.split(".")[1] || "").length;
    return nextValue.toFixed(decimals);
  }

  return String(nextValue);
}

function loadSavedSettings() {
  try {
    const rawValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch (error) {
    return null;
  }
}

export function saveSettings({ dom, state, buildColorTheme }) {
  const colorTheme = state.colorTheme ?? buildColorTheme(dom.templateSelect.value);

  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        template: dom.templateSelect.value,
        title: dom.titleInput.value.slice(0, Number(dom.titleInput.maxLength) || 96),
        muteExport: dom.muteExportCheckbox.checked,
        sensitivity: Number(dom.sensitivityRange.value),
        barCount: Number(dom.barCountRange.value),
        colorTheme,
      })
    );
  } catch (error) {
    // Ignore storage failures so the visualizer still works in restricted contexts.
  }
}

export function applySavedSettings({ dom, state, buildColorTheme, isValidColorTheme }) {
  const savedSettings = loadSavedSettings();

  if (!savedSettings) {
    state.colorTheme = buildColorTheme(dom.templateSelect.value);
    return;
  }

  if (TEMPLATE_VALUES.has(savedSettings.template)) {
    dom.templateSelect.value = savedSettings.template;
  }

  if (typeof savedSettings.title === "string") {
    dom.titleInput.value = savedSettings.title.slice(0, Number(dom.titleInput.maxLength) || 96);
  }

  if (typeof savedSettings.muteExport === "boolean") {
    dom.muteExportCheckbox.checked = savedSettings.muteExport;
  }

  dom.sensitivityRange.value = normalizeRangeInputValue(dom.sensitivityRange, savedSettings.sensitivity);
  dom.barCountRange.value = normalizeRangeInputValue(dom.barCountRange, savedSettings.barCount);
  state.colorTheme = isValidColorTheme(savedSettings.colorTheme)
    ? savedSettings.colorTheme
    : buildColorTheme(dom.templateSelect.value);
}
