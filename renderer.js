import {
  BAR_ATTACK,
  BAR_RELEASE,
  BASS_ATTACK,
  BASS_FLOOR_FALL,
  BASS_FLOOR_RISE,
  BASS_RELEASE,
} from "./config.js";
import { clamp, formatTime, lerp, stripExtension } from "./utils.js";
import { mixColor, rgbaFromHsl, rgbaFromRgb } from "./theme.js";

export function createRenderer({
  dom,
  ctx,
  afLogo,
  overlayFontFamily,
  state,
  getColorTheme,
  getCurrentPlaybackTime,
  getDisplayTitle,
  getTrackDuration,
  isCrossTemplate,
  isWinterTemplate,
  setStatus,
}) {
  function drawBackgroundPhoto(width, height) {
    const image = state.backgroundImage;

    if (!image?.complete || !image.naturalWidth || !image.naturalHeight) {
      return false;
    }

    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();

    return true;
  }

  function fitOverlayText(text, maxWidth, startingSize, minimumSize, weight = 400) {
    let fontSize = startingSize;

    while (fontSize > minimumSize) {
      ctx.font = `${weight} ${fontSize}px ${overlayFontFamily}`;
      if (ctx.measureText(text).width <= maxWidth) {
        break;
      }
      fontSize -= 2;
    }

    return fontSize;
  }

  function getBucketEnergy(startRatio, endRatio) {
    if (!state.fftData?.length) {
      return 0;
    }

    const start = Math.floor(startRatio * state.fftData.length);
    const end = Math.max(start + 1, Math.floor(endRatio * state.fftData.length));
    let total = 0;

    for (let index = start; index < end; index += 1) {
      total += state.fftData[index];
    }

    return total / (end - start) / 255;
  }

  function getBarVisuals(barCount) {
    const maxVisualBins = Math.floor(state.fftData.length * 0.85);
    const gap = 4;
    const bars = [];
    const nextBarLevels = new Array(barCount).fill(0);

    for (let i = 0; i < barCount; i += 1) {
      const startRatio = Math.pow(i / barCount, 1.8);
      const endRatio = Math.pow((i + 1) / barCount, 1.8);
      const startIndex = Math.floor(startRatio * maxVisualBins);
      const endIndex = Math.max(startIndex + 1, Math.floor(endRatio * maxVisualBins));
      let energy = 0;

      for (let index = startIndex; index < endIndex; index += 1) {
        energy += state.fftData[index];
      }

      energy /= endIndex - startIndex;

      const normalized = Math.pow(energy / 255, 1.55);
      const previousLevel = state.barLevels[i] ?? 0;
      const displayLevel = normalized > previousLevel
        ? lerp(previousLevel, normalized, BAR_ATTACK)
        : lerp(previousLevel, normalized, BAR_RELEASE);

      nextBarLevels[i] = displayLevel;

      const alpha = 0.22 + displayLevel * 0.78;
      bars.push({ normalized: displayLevel, alpha, gap });
    }

    state.barLevels = nextBarLevels;

    return bars;
  }

  function drawMirrorBars(centerX, centerY, height, barCount) {
    const theme = getColorTheme();
    const innerOffset = 36;
    const span = dom.visualizer.width * 0.37;
    const barWidth = span / barCount;
    const bars = getBarVisuals(barCount);

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const barHeight = 22 + normalized * height + state.bassPulse * 54;
      const xOffset = innerOffset + i * barWidth;
      const barVisualWidth = Math.max(2, barWidth - gap);

      ctx.fillStyle = rgbaFromRgb(...theme.mirrorPrimary, alpha);
      ctx.fillRect(centerX + xOffset, centerY - barHeight, barVisualWidth, barHeight * 2);

      ctx.fillStyle = rgbaFromRgb(...theme.mirrorSecondary, Math.max(0.16, alpha - 0.16));
      ctx.fillRect(centerX - xOffset - barVisualWidth, centerY - barHeight, barVisualWidth, barHeight * 2);
    }
  }

  function drawCrossBars(centerX, centerY, size, barCount, now) {
    const theme = getColorTheme();
    const bars = getBarVisuals(barCount);
    const innerOffset = 26;
    const horizontalSpan = dom.visualizer.width * 0.25;
    const verticalSpan = dom.visualizer.height * 0.25;
    const horizontalBarWidth = horizontalSpan / barCount;
    const verticalBarHeight = verticalSpan / barCount;
    const baseHue = (now * 0.05 + theme.crossHueBase) % 360;

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const horizontalLength = 20 + normalized * size + state.bassPulse * 54;
      const verticalLength = 20 + normalized * (size * 0.84) + state.bassPulse * 42;
      const xOffset = innerOffset + i * horizontalBarWidth;
      const yOffset = innerOffset + i * verticalBarHeight;
      const barVisualWidth = Math.max(2, horizontalBarWidth - gap);
      const barVisualHeight = Math.max(2, verticalBarHeight - gap);
      const hueShift = i * 2.8 + normalized * 18;
      const rightColor = rgbaFromHsl(baseHue + hueShift, 92, 64, alpha);
      const topColor = rgbaFromHsl(baseHue + 90 + hueShift, 94, 62, alpha);
      const leftColor = rgbaFromHsl(baseHue + 180 + hueShift, 92, 62, Math.max(0.18, alpha - 0.05));
      const bottomColor = rgbaFromHsl(baseHue + 270 + hueShift, 94, 60, Math.max(0.18, alpha - 0.1));

      ctx.fillStyle = rightColor;
      ctx.fillRect(centerX + xOffset, centerY - horizontalLength, barVisualWidth, horizontalLength * 2);

      ctx.fillStyle = leftColor;
      ctx.fillRect(centerX - xOffset - barVisualWidth, centerY - horizontalLength, barVisualWidth, horizontalLength * 2);

      ctx.fillStyle = topColor;
      ctx.fillRect(centerX - verticalLength, centerY - yOffset - barVisualHeight, verticalLength * 2, barVisualHeight);

      ctx.fillStyle = bottomColor;
      ctx.fillRect(centerX - verticalLength, centerY + yOffset, verticalLength * 2, barVisualHeight);
    }
  }

  function drawWinterNeonBars(centerX, centerY, size, barCount, now) {
    const theme = getColorTheme();
    const bars = getBarVisuals(barCount);
    const innerOffset = 26;
    const horizontalSpan = dom.visualizer.width * 0.25;
    const verticalSpan = dom.visualizer.height * 0.25;
    const horizontalBarWidth = horizontalSpan / barCount;
    const verticalBarHeight = verticalSpan / barCount;
    const white = theme.winterWhite;
    const snow = theme.winterSnow;
    const frost = theme.winterFrost;
    const pulse = 0.5 + Math.sin(now * 0.0024) * 0.5;

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const horizontalLength = 24 + normalized * (size * 1.08) + state.bassPulse * 74;
      const verticalLength = 24 + normalized * (size * 0.94) + state.bassPulse * 58;
      const xOffset = innerOffset + i * horizontalBarWidth;
      const yOffset = innerOffset + i * verticalBarHeight;
      const barVisualWidth = Math.max(2, horizontalBarWidth - gap);
      const barVisualHeight = Math.max(2, verticalBarHeight - gap);
      const shimmer = 0.5 + Math.sin(now * 0.002 + i * 0.22) * 0.5;
      const gradientMix = clamp(0.16 + i / Math.max(1, bars.length - 1) * 0.68, 0, 1);
      const brightMix = clamp(gradientMix * 0.7 + normalized * 0.4 + pulse * 0.12, 0, 1);
      const edgeMix = clamp(0.24 + shimmer * 0.34 + normalized * 0.22, 0, 1);
      const rightColor = rgbaFromRgb(...mixColor(white, snow, brightMix), alpha);
      const topColor = rgbaFromRgb(...mixColor(white, frost, edgeMix), alpha);
      const leftColor = rgbaFromRgb(...mixColor(snow, white, brightMix), Math.max(0.24, alpha - 0.04));
      const bottomColor = rgbaFromRgb(...mixColor(frost, snow, edgeMix), Math.max(0.22, alpha - 0.08));

      ctx.fillStyle = rightColor;
      ctx.fillRect(centerX + xOffset, centerY - horizontalLength, barVisualWidth, horizontalLength * 2);

      ctx.fillStyle = leftColor;
      ctx.fillRect(centerX - xOffset - barVisualWidth, centerY - horizontalLength, barVisualWidth, horizontalLength * 2);

      ctx.fillStyle = topColor;
      ctx.fillRect(centerX - verticalLength, centerY - yOffset - barVisualHeight, verticalLength * 2, barVisualHeight);

      ctx.fillStyle = bottomColor;
      ctx.fillRect(centerX - verticalLength, centerY + yOffset, verticalLength * 2, barVisualHeight);
    }
  }

  function drawVisualizerTemplate(centerX, centerY, height, barCount, now) {
    if (isWinterTemplate()) {
      drawWinterNeonBars(centerX, centerY, height, barCount, now);
      return;
    }

    if (dom.templateSelect.value === "cross") {
      drawCrossBars(centerX, centerY, height, barCount, now);
      return;
    }

    drawMirrorBars(centerX, centerY, height, barCount);
  }

  function drawCenterLogo(centerX, centerY) {
    if (!afLogo.complete || !afLogo.naturalWidth) {
      return;
    }

    const theme = getColorTheme();
    const winterTemplate = isWinterTemplate();
    const logoSize = (winterTemplate ? 236 : 198) + state.bassPulse * (winterTemplate ? 26 : 16);
    const offsetX = winterTemplate ? 6 : 5;
    const offsetY = winterTemplate ? -8 : -6;

    ctx.save();
    ctx.globalAlpha = winterTemplate ? 0.98 : 0.94;
    ctx.shadowColor = winterTemplate
      ? rgbaFromRgb(...theme.logoGlow, 0.92)
      : rgbaFromRgb(...theme.logoGlow, 0.32);
    ctx.shadowBlur = winterTemplate ? 28 + state.bassPulse * 14 : 14 + state.bassPulse * 8;
    ctx.drawImage(
      afLogo,
      centerX - logoSize / 2 + offsetX,
      centerY - logoSize / 2 + offsetY,
      logoSize,
      logoSize
    );
    ctx.restore();
  }

  function drawScene(now) {
    requestAnimationFrame(drawScene);

    const width = dom.visualizer.width;
    const height = dom.visualizer.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const currentTime = getCurrentPlaybackTime();
    const duration = getTrackDuration();
    const rainbowHue = (now * 0.05) % 360;
    const winterTemplate = isWinterTemplate();
    const theme = getColorTheme();
    const bassZoomValue = winterTemplate ? Number(dom.sensitivityRange.max) : Number(dom.sensitivityRange.value);
    const activeBarCount = winterTemplate ? Number(dom.barCountRange.min) : Number(dom.barCountRange.value);
    const hasBackgroundPhoto = drawBackgroundPhoto(width, height);

    if (state.analyser && state.fftData) {
      state.analyser.getByteFrequencyData(state.fftData);
      const lowEnd = clamp(180 / (state.audioContext.sampleRate / 2), 0.01, 0.2);
      const bassEnergy = getBucketEnergy(0, lowEnd);
      state.bassEnergy = bassEnergy > state.bassEnergy
        ? lerp(state.bassEnergy, bassEnergy, BASS_ATTACK)
        : lerp(state.bassEnergy, bassEnergy, BASS_RELEASE);
      state.bassFloor = state.bassEnergy > state.bassFloor
        ? lerp(state.bassFloor, state.bassEnergy, BASS_FLOOR_RISE)
        : lerp(state.bassFloor, state.bassEnergy, BASS_FLOOR_FALL);
      const bassLift = clamp((state.bassEnergy - state.bassFloor) * 7.2 * bassZoomValue, 0, 1.28);
      state.bassPulse = bassLift > state.bassPulse
        ? lerp(state.bassPulse, bassLift, 0.76)
        : lerp(state.bassPulse, bassLift, 0.22);
    } else {
      state.bassPulse *= 0.9;
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    if (winterTemplate) {
      gradient.addColorStop(0, rgbaFromRgb(...theme.backgroundStart, 1));
      gradient.addColorStop(
        0.46,
        rgbaFromRgb(...mixColor(theme.backgroundMid, theme.progressFill, clamp(state.bassPulse * 0.18, 0, 1)), 0.26)
      );
      gradient.addColorStop(1, rgbaFromRgb(...theme.backgroundEnd, 1));
    } else {
      gradient.addColorStop(0, rgbaFromRgb(...theme.backgroundStart, 1));
      gradient.addColorStop(
        0.55,
        rgbaFromRgb(...mixColor(theme.backgroundMid, theme.mirrorPrimary, clamp(state.bassPulse * 0.2, 0, 1)), 1)
      );
      gradient.addColorStop(1, rgbaFromRgb(...theme.backgroundEnd, 1));
    }
    ctx.save();
    ctx.globalAlpha = hasBackgroundPhoto ? (winterTemplate ? 0.84 : 0.86) : 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const vignette = ctx.createRadialGradient(centerX, centerY, 80, centerX, centerY, width * 0.54);
    if (winterTemplate) {
      vignette.addColorStop(0, rgbaFromRgb(...theme.vignetteCenter, 0.12 + state.bassPulse * 0.12));
      vignette.addColorStop(0.42, rgbaFromRgb(...theme.vignetteMid, 0.1));
      vignette.addColorStop(1, rgbaFromRgb(...theme.vignetteEdge, 0.84));
    } else {
      vignette.addColorStop(0, rgbaFromRgb(...theme.vignetteCenter, 0.05 + state.bassPulse * 0.07));
      vignette.addColorStop(0.4, rgbaFromRgb(...theme.vignetteMid, 0.08));
      vignette.addColorStop(1, rgbaFromRgb(...theme.vignetteEdge, 0.82));
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const scale = 1 + state.bassPulse * 0.085;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    ctx.save();
    ctx.filter = `blur(${winterTemplate ? 46 + state.bassPulse * 34 : 32 + state.bassPulse * 22}px)`;
    ctx.beginPath();
    ctx.fillStyle = winterTemplate
      ? rgbaFromRgb(...theme.orbGlow, 0.24 + state.bassPulse * 0.16)
      : rgbaFromRgb(...theme.orbGlow, 0.18 + state.bassPulse * 0.12);
    ctx.arc(centerX, centerY, (winterTemplate ? 86 : 72) + state.bassPulse * (winterTemplate ? 66 : 48), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = winterTemplate
      ? rgbaFromRgb(...theme.orbCore, 0.9)
      : rgbaFromRgb(...theme.orbCore, 0.92);
    ctx.arc(centerX, centerY, (winterTemplate ? 102 : 92) + state.bassPulse * (winterTemplate ? 32 : 26), 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = winterTemplate
      ? rgbaFromRgb(...theme.ring, 0.48 + state.bassPulse * 0.24)
      : rgbaFromRgb(...theme.ring, 0.44 + state.bassPulse * 0.28);
    ctx.beginPath();
    ctx.arc(centerX, centerY, (winterTemplate ? 132 : 124) + state.bassPulse * (winterTemplate ? 24 : 20), 0, Math.PI * 2);
    ctx.stroke();

    if (isCrossTemplate()) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = winterTemplate
        ? rgbaFromRgb(...theme.frame, 0.26 + state.bassPulse * 0.18)
        : rgbaFromHsl(rainbowHue + theme.crossHueBase + 45, 96, 68, 0.24 + state.bassPulse * 0.16);
      ctx.strokeRect(
        centerX - (136 + state.bassPulse * 16),
        centerY - (136 + state.bassPulse * 16),
        (136 + state.bassPulse * 16) * 2,
        (136 + state.bassPulse * 16) * 2
      );
    }

    if (state.fftData) {
      drawVisualizerTemplate(centerX, centerY, height * 0.28, activeBarCount, now);
    }

    drawCenterLogo(centerX, centerY);

    ctx.restore();

    const overlayTitle = getDisplayTitle() || "Absolute Visualizer Freakout";
    const overlayPadding = 64;
    const titleX = overlayPadding;
    const titleY = overlayPadding;
    const titleMaxWidth = width - overlayPadding * 2;
    const titleFontSize = fitOverlayText(overlayTitle, titleMaxWidth, 68, 34);
    const timeY = titleY + titleFontSize + 10;

    ctx.save();
    ctx.textBaseline = "top";
    ctx.fillStyle = rgbaFromRgb(...theme.overlayTitle, 0.92);
    ctx.font = `400 ${titleFontSize}px ${overlayFontFamily}`;
    ctx.fillText(overlayTitle, titleX, titleY);

    ctx.fillStyle = rgbaFromRgb(...theme.overlayMeta, 0.96);
    ctx.font = `400 30px ${overlayFontFamily}`;
    ctx.fillText(`${formatTime(currentTime)} / ${formatTime(duration)}`, titleX, timeY);
    ctx.restore();

    ctx.fillStyle = rgbaFromRgb(...theme.progressTrack, 0.88);
    ctx.fillRect(64, height - 74, width - 128, 4);
    ctx.fillStyle = rgbaFromRgb(...theme.progressFill, 0.94);
    const progress = Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;
    ctx.fillRect(64, height - 74, (width - 128) * clamp(progress, 0, 1), 4);

    if (state.isRecording) {
      const elapsed = (now - state.recordingStartedAt) / 1000;
      setStatus(
        `Recording in real time - ${formatTime(elapsed)} / ${formatTime(duration)} - Keep this tab visible.`
      );
    } else if (state.isPlaying && state.currentMode === "preview" && state.file) {
      setStatus(
        `Previewing ${getDisplayTitle() || stripExtension(state.file.name)} - ${formatTime(currentTime)} / ${formatTime(duration)}`
      );
    }
  }

  return { drawScene };
}
