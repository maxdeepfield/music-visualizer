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
    const photoOpacity = clamp(Number(dom.backgroundOpacityRange?.value) || 0, 0, 1);

    ctx.save();
    ctx.globalAlpha = photoOpacity;
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

  function getBarFrequencyWindow(index, barCount, lowAtEdges = false) {
    const curvePower = lowAtEdges ? 1.65 : 1.8;
    const startRatio = Math.pow(index / barCount, curvePower);
    const endRatio = Math.pow((index + 1) / barCount, curvePower);

    if (!lowAtEdges) {
      return { startRatio, endRatio };
    }

    return {
      startRatio: Math.pow(1 - ((index + 1) / barCount), curvePower),
      endRatio: Math.pow(1 - (index / barCount), curvePower),
    };
  }

  function getEdgeBassInfluence(index, total, minimumInfluence = 0.3) {
    if (total <= 1) {
      return 1;
    }

    const positionRatio = index / (total - 1);
    return lerp(minimumInfluence, 1, positionRatio);
  }

  function getZoomAmount() {
    const min = Number(dom.sensitivityRange.min);
    const max = Number(dom.sensitivityRange.max);
    const value = Number(dom.sensitivityRange.value);

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return clamp(value, 0, 1);
    }

    return clamp((value - min) / (max - min), 0, 1);
  }

  function getCenterPulse() {
    return state.bassPulse * getZoomAmount();
  }

  function getLogoSize() {
    const winterTemplate = isWinterTemplate();
    const centerPulse = getCenterPulse();
    return (winterTemplate ? 236 : 198) + centerPulse * (winterTemplate ? 26 : 16);
  }

  function getVisualizerCoreRadius() {
    return getLogoSize() * 0.28;
  }

  function getBarAxisLayout(totalSize, maxSpanRatio, extraGap = 28, edgePadding = 28, minSpan = 48) {
    const desiredInnerOffset = getVisualizerCoreRadius() + extraGap;
    const maxInnerOffset = Math.max(0, totalSize / 2 - edgePadding - minSpan);
    const innerOffset = Math.min(desiredInnerOffset, maxInnerOffset);
    const availableSpan = Math.max(minSpan, totalSize / 2 - edgePadding - innerOffset);
    const span = Math.max(minSpan, Math.min(totalSize * maxSpanRatio, availableSpan));

    return { innerOffset, span };
  }

  function getBarVisuals(barCount, { lowAtEdges = false } = {}) {
    const maxVisualBins = Math.floor(state.fftData.length * 0.85);
    const gap = 4;
    const bars = [];
    const nextBarLevels = new Array(barCount).fill(0);
    const nextBarRawLevels = new Array(barCount).fill(0);
    const nextBarEnergyFloors = new Array(barCount).fill(0);
    const rawEnergies = new Array(barCount).fill(0);

    for (let i = 0; i < barCount; i += 1) {
      const { startRatio, endRatio } = getBarFrequencyWindow(i, barCount, lowAtEdges);
      const startIndex = Math.floor(startRatio * maxVisualBins);
      const endIndex = Math.max(startIndex + 1, Math.floor(endRatio * maxVisualBins));
      let energy = 0;

      for (let index = startIndex; index < endIndex; index += 1) {
        energy += state.fftData[index];
      }

      energy /= endIndex - startIndex;

      const bandCenterRatio = (startRatio + endRatio) * 0.5;
      const frequencyBoost = lowAtEdges
        ? lerp(0.88, 1.58, Math.pow(bandCenterRatio, 0.72))
        : 1;
      rawEnergies[i] = clamp((energy / 255) * frequencyBoost, 0, 1);
    }

    // An adaptive floor plus transient boost keeps the bars reacting to musical changes,
    // not only to the track's static spectral shape.
    for (let i = 0; i < barCount; i += 1) {
      const rawEnergy = rawEnergies[i];
      const previousRawEnergy = state.barRawLevels[i] ?? rawEnergy;
      const previousFloor = state.barEnergyFloors[i] ?? rawEnergy * 0.92;
      const floor = rawEnergy > previousFloor
        ? lerp(previousFloor, rawEnergy, lowAtEdges ? 0.024 : 0.028)
        : lerp(previousFloor, rawEnergy, lowAtEdges ? 0.14 : 0.18);
      const leftNeighbor = rawEnergies[Math.max(0, i - 1)];
      const rightNeighbor = rawEnergies[Math.min(barCount - 1, i + 1)];
      const neighborhoodAverage = (leftNeighbor + rawEnergy + rightNeighbor) / 3;
      const transient = Math.max(0, rawEnergy - previousRawEnergy);
      const floorLift = clamp((rawEnergy - floor) * 3.4 + rawEnergy * 0.6, 0, 1);
      const contour = clamp((rawEnergy - neighborhoodAverage * 0.88) * 2.1, 0, 1);
      const normalized = Math.pow(floorLift, lowAtEdges ? 1.08 : 1.18);
      const animatedTarget = clamp(normalized + transient * 1.4 + contour * 0.32, 0, 1);
      const previousLevel = state.barLevels[i] ?? 0;
      const attack = transient > 0.015 ? Math.min(0.96, BAR_ATTACK + 0.08) : BAR_ATTACK;
      const release = lowAtEdges ? BAR_RELEASE * 0.9 : BAR_RELEASE;
      const displayLevel = animatedTarget > previousLevel
        ? lerp(previousLevel, animatedTarget, attack)
        : lerp(previousLevel, animatedTarget, release);

      nextBarLevels[i] = displayLevel;
      nextBarRawLevels[i] = lerp(previousRawEnergy, rawEnergy, 0.42);
      nextBarEnergyFloors[i] = floor;

      const alpha = 0.22 + displayLevel * 0.78;
      bars.push({ normalized: displayLevel, alpha, gap });
    }

    state.barLevels = nextBarLevels;
    state.barRawLevels = nextBarRawLevels;
    state.barEnergyFloors = nextBarEnergyFloors;

    return bars;
  }

  function drawMirrorBars(centerX, centerY, height, barCount) {
    const theme = getColorTheme();
    const { innerOffset, span } = getBarAxisLayout(dom.visualizer.width, 0.39, 8, 28, 56);
    const barWidth = span / barCount;
    const bars = getBarVisuals(barCount, { lowAtEdges: true });

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const edgeBassInfluence = getEdgeBassInfluence(i, bars.length, 0.34);
      const barHeight = 22 + normalized * height + state.bassPulse * 54 * edgeBassInfluence;
      const xOffset = innerOffset + i * barWidth;
      const barVisualWidth = Math.max(2, barWidth - gap);

      ctx.fillStyle = rgbaFromRgb(...theme.mirrorPrimary, alpha);
      ctx.fillRect(centerX + xOffset, centerY - barHeight, barVisualWidth, barHeight * 2);

      ctx.fillStyle = rgbaFromRgb(...theme.mirrorSecondary, Math.max(0.16, alpha - 0.16));
      ctx.fillRect(centerX - xOffset - barVisualWidth, centerY - barHeight, barVisualWidth, barHeight * 2);
    }
  }

  function drawMirrorMirrorBars(centerX, centerY, height, barCount, now) {
    const theme = getColorTheme();
    const maxBarWidth = 8;
    const minBarWidth = 3;
    const halfCount = Math.ceil(barCount / 2);
    const bars = getBarVisuals(halfCount, { lowAtEdges: true });
    const { innerOffset, span } = getBarAxisLayout(dom.visualizer.width, 0.44, 10, 28, 60);
    const baseHue = (now * 0.04 + theme.crossHueBase) % 360;

    for (let i = 0; i < halfCount; i += 1) {
      const positionRatio = i / Math.max(1, halfCount - 1);
      const bassInfluence = getEdgeBassInfluence(i, halfCount, 0.24);
      const barWidth = lerp(maxBarWidth, minBarWidth, positionRatio);
      const bar = bars[i] || { normalized: 0, alpha: 0.22 };

      for (let side = 0; side < 2; side += 1) {
        const { normalized, alpha } = bar;

        const barHeight = 18 + normalized * height * 1.15 + state.bassPulse * 48 * bassInfluence;
        const xOffset = innerOffset + (span / halfCount) * (i + 0.5);

        const hueShift = i * 3.2 + normalized * 24;
        const barColor = side === 0
          ? rgbaFromHsl(baseHue + 180 + hueShift, 86, 62, alpha)
          : rgbaFromHsl(baseHue + hueShift, 88, 64, alpha);

        ctx.fillStyle = barColor;
        ctx.fillRect(centerX + (side === 0 ? -xOffset - barWidth : xOffset), centerY - barHeight, barWidth, barHeight * 2);
      }
    }
  }

  function drawCrossBars(centerX, centerY, size, barCount, now) {
    const theme = getColorTheme();
    const bars = getBarVisuals(barCount, { lowAtEdges: true });
    const horizontalLayout = getBarAxisLayout(dom.visualizer.width, 0.27, 8, 28, 52);
    const verticalLayout = getBarAxisLayout(dom.visualizer.height, 0.27, 8, 28, 52);
    const { innerOffset: horizontalInnerOffset, span: horizontalSpan } = horizontalLayout;
    const { innerOffset: verticalInnerOffset, span: verticalSpan } = verticalLayout;
    const horizontalBarWidth = horizontalSpan / barCount;
    const verticalBarHeight = verticalSpan / barCount;
    const baseHue = (now * 0.05 + theme.crossHueBase) % 360;

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const edgeBassInfluence = getEdgeBassInfluence(i, bars.length, 0.28);
      const horizontalLength = 20 + normalized * size + state.bassPulse * 54 * edgeBassInfluence;
      const verticalLength = 20 + normalized * (size * 0.84) + state.bassPulse * 42 * edgeBassInfluence;
      const xOffset = horizontalInnerOffset + i * horizontalBarWidth;
      const yOffset = verticalInnerOffset + i * verticalBarHeight;
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
    const bars = getBarVisuals(barCount, { lowAtEdges: true });
    const horizontalLayout = getBarAxisLayout(dom.visualizer.width, 0.27, 12, 28, 52);
    const verticalLayout = getBarAxisLayout(dom.visualizer.height, 0.27, 12, 28, 52);
    const { innerOffset: horizontalInnerOffset, span: horizontalSpan } = horizontalLayout;
    const { innerOffset: verticalInnerOffset, span: verticalSpan } = verticalLayout;
    const horizontalBarWidth = horizontalSpan / barCount;
    const verticalBarHeight = verticalSpan / barCount;
    const white = theme.winterWhite;
    const snow = theme.winterSnow;
    const frost = theme.winterFrost;
    const pulse = 0.5 + Math.sin(now * 0.0024) * 0.5;

    for (let i = 0; i < bars.length; i += 1) {
      const { normalized, alpha, gap } = bars[i];
      const edgeBassInfluence = getEdgeBassInfluence(i, bars.length, 0.3);
      const horizontalLength = 24 + normalized * (size * 1.08) + state.bassPulse * 74 * edgeBassInfluence;
      const verticalLength = 24 + normalized * (size * 0.94) + state.bassPulse * 58 * edgeBassInfluence;
      const xOffset = horizontalInnerOffset + i * horizontalBarWidth;
      const yOffset = verticalInnerOffset + i * verticalBarHeight;
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

    if (dom.templateSelect.value === "mirror-mirror") {
      drawMirrorMirrorBars(centerX, centerY, height, barCount, now);
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
    const centerPulse = getCenterPulse();
    const logoSize = getLogoSize();
    const offsetX = winterTemplate ? 6 : 5;
    const offsetY = winterTemplate ? -8 : -6;

    ctx.save();
    ctx.globalAlpha = winterTemplate ? 0.98 : 0.94;
    ctx.shadowColor = winterTemplate
      ? rgbaFromRgb(...theme.logoGlow, 0.92)
      : rgbaFromRgb(...theme.logoGlow, 0.32);
    ctx.shadowBlur = winterTemplate ? 30 + centerPulse * 14 : 18 + centerPulse * 8;
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
    const winterTemplate = isWinterTemplate();
    const theme = getColorTheme();
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
      const bassLift = clamp((state.bassEnergy - state.bassFloor) * 7.2, 0, 1.28);
      state.bassPulse = bassLift > state.bassPulse
        ? lerp(state.bassPulse, bassLift, 0.76)
        : lerp(state.bassPulse, bassLift, 0.22);
    } else {
      state.bassPulse *= 0.9;
    }

    const centerPulse = getCenterPulse();

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    if (winterTemplate) {
      gradient.addColorStop(0, rgbaFromRgb(...theme.backgroundStart, 1));
      gradient.addColorStop(
        0.46,
        rgbaFromRgb(...mixColor(theme.backgroundMid, theme.progressFill, clamp(centerPulse * 0.18, 0, 1)), 0.26)
      );
      gradient.addColorStop(1, rgbaFromRgb(...theme.backgroundEnd, 1));
    } else {
      gradient.addColorStop(0, rgbaFromRgb(...theme.backgroundStart, 1));
      gradient.addColorStop(
        0.55,
        rgbaFromRgb(...mixColor(theme.backgroundMid, theme.mirrorPrimary, clamp(centerPulse * 0.2, 0, 1)), 1)
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
      vignette.addColorStop(0, rgbaFromRgb(...theme.vignetteCenter, 0.12 + centerPulse * 0.12));
      vignette.addColorStop(0.42, rgbaFromRgb(...theme.vignetteMid, 0.1));
      vignette.addColorStop(1, rgbaFromRgb(...theme.vignetteEdge, 0.84));
    } else {
      vignette.addColorStop(0, rgbaFromRgb(...theme.vignetteCenter, 0.05 + centerPulse * 0.07));
      vignette.addColorStop(0.4, rgbaFromRgb(...theme.vignetteMid, 0.08));
      vignette.addColorStop(1, rgbaFromRgb(...theme.vignetteEdge, 0.82));
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const scale = 1 + centerPulse * 0.085;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

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
