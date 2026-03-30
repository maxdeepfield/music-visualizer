import {
  ANALYSER_FFT_SIZE,
  ANALYSER_SMOOTHING,
  MP4_MIME_CANDIDATES,
} from "./config.js";
import { clamp, formatTime, sanitizeFileName, stripExtension } from "./utils.js";

export function createMediaController({
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
}) {
  function getTrackDuration() {
    return state.audioBuffer?.duration ?? NaN;
  }

  function getCurrentPlaybackTime() {
    const duration = getTrackDuration();

    if (state.isPlaying && state.audioContext) {
      return clamp(state.audioContext.currentTime - state.playbackStartedAt, 0, duration || 0);
    }

    return clamp(state.playbackOffset, 0, duration || 0);
  }

  function syncPlaybackGain() {
    if (!state.audioContext || !state.playbackGain) {
      return;
    }

    const targetGain = state.isRecording && dom.muteExportCheckbox.checked ? 0 : 1;
    state.playbackGain.gain.setTargetAtTime(targetGain, state.audioContext.currentTime, 0.01);
  }

  async function ensureAudioGraph() {
    if (state.audioContext) {
      return;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("This browser does not expose the Web Audio API.");
    }

    state.audioContext = new AudioContextCtor();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = ANALYSER_FFT_SIZE;
    state.analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
    state.playbackGain = state.audioContext.createGain();
    state.analyser.connect(state.playbackGain);
    state.playbackGain.connect(state.audioContext.destination);
    state.fftData = new Uint8Array(state.analyser.frequencyBinCount);
    syncPlaybackGain();
  }

  function pickMimeType() {
    if (typeof window.MediaRecorder === "undefined") {
      return "";
    }

    for (const candidate of MP4_MIME_CANDIDATES) {
      if (typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return "";
  }

  function getFileExtension(mimeType) {
    if (mimeType.includes("mp4")) {
      return "mp4";
    }

    if (mimeType.includes("webm")) {
      return "webm";
    }

    return "dat";
  }

  function resetDownloadLink() {
    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl);
      state.downloadUrl = null;
    }

    state.downloadFileName = "";
    state.exportDirty = true;
  }

  function downloadLastRecord() {
    if (!state.downloadUrl || state.exportDirty || !state.downloadFileName) {
      return false;
    }

    const anchor = document.createElement("a");
    anchor.href = state.downloadUrl;
    anchor.download = state.downloadFileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setStatus(`Downloaded ${state.downloadFileName}.`);
    return true;
  }

  function releaseCurrentSource() {
    if (!state.currentSource) {
      return;
    }

    const source = state.currentSource;
    state.currentSource = null;
    source.onended = null;

    try {
      source.stop();
    } catch (error) {
      // Ignore redundant stop() calls on one-shot buffer sources.
    }

    source.disconnect();
  }

  function stopPlaybackState({ captureOffset = false, resetOffset = false } = {}) {
    if (captureOffset) {
      state.playbackOffset = getCurrentPlaybackTime();
    }

    releaseCurrentSource();

    if (resetOffset) {
      state.playbackOffset = 0;
    }

    state.currentMode = "idle";
    state.isPlaying = false;
    dom.playBtn.textContent = "Play";
    syncPlaybackGain();
    updateButtons();
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") {
      if (typeof state.recorder.requestData === "function") {
        try {
          state.recorder.requestData();
        } catch (error) {
          // Ignore requestData errors while the recorder is shutting down.
        }
      }

      state.recorder.stop();
    }
  }

  function handleSourceEnded(token, mode) {
    if (token !== state.sourceToken) {
      return;
    }

    state.currentSource = null;
    state.isPlaying = false;
    state.currentMode = "idle";

    if (mode === "export" && state.isRecording) {
      state.playbackOffset = getTrackDuration() || 0;
      state.recordingDurationMs = Math.max(1, Math.round(state.playbackOffset * 1000));
      dom.playBtn.textContent = "Play";
      window.setTimeout(() => {
        stopRecording();
      }, 180);
      return;
    }

    state.playbackOffset = 0;
    dom.playBtn.textContent = "Play";
    syncPlaybackGain();
    setStatus("Playback finished.");
    updateButtons();
  }

  function startBufferPlayback(mode, requestedOffset = 0, exportDestination = null) {
    if (!state.audioBuffer) {
      return false;
    }

    releaseCurrentSource();

    const duration = getTrackDuration();
    const safeOffset = clamp(requestedOffset, 0, Math.max(0, duration - 0.02));
    const source = state.audioContext.createBufferSource();
    const token = state.sourceToken + 1;

    source.buffer = state.audioBuffer;
    source.connect(state.analyser);

    if (exportDestination) {
      source.connect(exportDestination);
    }

    source.onended = () => handleSourceEnded(token, mode);
    source.start(0, safeOffset);

    state.sourceToken = token;
    state.currentSource = source;
    state.currentMode = mode;
    state.playbackOffset = safeOffset;
    state.playbackStartedAt = state.audioContext.currentTime - safeOffset;
    state.isPlaying = true;

    updateButtons();
    return true;
  }

  async function loadFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("audio/") && !file.name.toLowerCase().endsWith(".mp3")) {
      setStatus("That file does not look like audio. Pick an MP3 or another browser-decodable format.");
      return;
    }

    await ensureAudioGraph();
    await state.audioContext.resume();

    if (state.isRecording) {
      return;
    }

    stopPlaybackState({ resetOffset: true });
    invalidateExport();
    state.file = file;
    state.audioBuffer = null;
    state.barLevels = [];
    state.bassEnergy = 0;
    state.bassFloor = 0;
    state.bassPulse = 0;
    dom.titleInput.value = stripExtension(file.name);
    syncTrackTitle();
    saveSettings();
    setStatus("Decoding track...");
    updateButtons();
    refreshStageOverlay();

    try {
      const arrayBuffer = await file.arrayBuffer();
      state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer.slice(0));
      setStatus(`Track loaded. Ready to preview or export - duration ${formatTime(getTrackDuration())}.`);
    } catch (error) {
      state.file = null;
      state.audioBuffer = null;
      state.barLevels = [];
      state.bassEnergy = 0;
      dom.titleInput.value = "";
      syncTrackTitle();
      saveSettings();
      setStatus(`Audio decode failed: ${error.message}`);
    }

    updateButtons();
  }

  async function togglePlayback() {
    if (!state.audioBuffer || state.isRecording) {
      return;
    }

    await state.audioContext.resume();

    if (state.isPlaying && state.currentMode === "preview") {
      stopPlaybackState({ captureOffset: true });
      setStatus("Preview paused.");
      return;
    }

    const offset = state.playbackOffset >= getTrackDuration() ? 0 : state.playbackOffset;
    if (!startBufferPlayback("preview", offset)) {
      setStatus("Preview could not start.");
      return;
    }

    dom.playBtn.textContent = "Pause";
    setStatus(
      `Previewing ${getDisplayTitle() || stripExtension(state.file.name)} - ${formatTime(getCurrentPlaybackTime())} / ${formatTime(getTrackDuration())}`
    );
  }

  function stopPreview() {
    if (!state.audioBuffer) {
      return;
    }

    stopPlaybackState({ resetOffset: true });
    setStatus("Preview stopped and rewound to the start.");
  }

  function handleStop() {
    if (state.isRecording) {
      state.recordingDurationMs = Math.max(1, Math.round(getCurrentPlaybackTime() * 1000));
      stopPlaybackState({ captureOffset: true, resetOffset: true });
      stopRecording();
      setStatus("Recording stopped early. Finalizing export...");
      return;
    }

    stopPreview();
  }

  async function makeExportBlob(rawBlob, mimeType) {
    if (!mimeType.includes("webm")) {
      return rawBlob;
    }

    if (typeof window.ysFixWebmDuration !== "function" || state.recordingDurationMs <= 0) {
      return rawBlob;
    }

    setStatus("Finalizing WebM metadata for seekable playback...");

    try {
      return await window.ysFixWebmDuration(rawBlob, state.recordingDurationMs, { logger: false });
    } catch (error) {
      setStatus(`WebM metadata fix failed: ${error.message}. Falling back to the raw recording.`);
      return rawBlob;
    }
  }

  async function finalizeRecording() {
    const mimeType = state.recordingMimeType || "video/webm";
    const extension = getFileExtension(mimeType);
    const rawBlob = new Blob(state.recordedChunks, { type: mimeType });
    const finalBlob = await makeExportBlob(rawBlob, mimeType);
    const exportUrl = URL.createObjectURL(finalBlob);
    const trackName = sanitizeFileName(
      getDisplayTitle() || (state.file ? stripExtension(state.file.name) : "music-video")
    );
    const fileName = `${trackName}-visualizer.${extension}`;

    state.downloadUrl = exportUrl;
    state.downloadFileName = fileName;
    state.exportDirty = false;

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }

    state.stream = null;
    state.recorder = null;
    state.recordedChunks = [];
    state.recordingMimeType = "";
    state.isRecording = false;
    state.isPlaying = false;
    state.currentMode = "idle";
    state.playbackOffset = 0;
    state.exportDestination = null;
    dom.playBtn.textContent = "Play";
    syncPlaybackGain();
    updateButtons();

    setStatus(
      `Export finished. ${fileName} (${(finalBlob.size / 1024 / 1024).toFixed(1)} MB) is ready.`
    );
  }

  function createRecordingStream(exportDestination) {
    const canvasStream = dom.visualizer.captureStream(60);
    const audioTracks = exportDestination.stream.getAudioTracks();
    const videoTracks = canvasStream.getVideoTracks();

    return new MediaStream([...videoTracks, ...audioTracks]);
  }

  async function exportVideo() {
    if (!state.audioBuffer || state.isRecording) {
      return;
    }

    await ensureOverlayFontsReady();

    const selectedMimeType = pickMimeType();
    if (!selectedMimeType) {
      setStatus("This browser does not support MP4 export.");
      return;
    }

    await state.audioContext.resume();

    stopPlaybackState({ resetOffset: true });
    resetDownloadLink();
    state.recordedChunks = [];
    state.recordingMimeType = selectedMimeType;
    state.recordingDurationMs = 0;
    state.exportDestination = state.audioContext.createMediaStreamDestination();
    state.stream = createRecordingStream(state.exportDestination);

    if (state.stream.getAudioTracks().length === 0) {
      setStatus("The recording stream has no audio track. Export cannot continue.");
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
      state.exportDestination = null;
      return;
    }

    try {
      state.recorder = new MediaRecorder(state.stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 10_000_000,
        audioBitsPerSecond: 192_000,
      });
    } catch (error) {
      setStatus(`MediaRecorder could not start with ${selectedMimeType}: ${error.message}`);
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
      state.exportDestination = null;
      return;
    }

    state.recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    });

    state.recorder.addEventListener("stop", () => {
      void finalizeRecording();
    });

    state.recorder.addEventListener("error", (event) => {
      setStatus(`Recording failed: ${event.error?.message || "unknown MediaRecorder error"}`);

      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }

      stopPlaybackState({ resetOffset: true });
      state.stream = null;
      state.exportDestination = null;
      state.recorder = null;
      state.recordedChunks = [];
      state.isRecording = false;
      syncPlaybackGain();
      updateButtons();
    });

    state.isRecording = true;
    state.recordingStartedAt = performance.now();

    try {
      state.recorder.start();
    } catch (error) {
      setStatus(`Recorder start failed: ${error.message}`);
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
      state.exportDestination = null;
      state.isRecording = false;
      syncPlaybackGain();
      updateButtons();
      return;
    }

    if (!startBufferPlayback("export", 0, state.exportDestination)) {
      setStatus("Recording could not start playback.");
      state.isRecording = false;
      state.exportDestination = null;
      syncPlaybackGain();
      stopRecording();
      return;
    }

    syncPlaybackGain();
    setStatus(`Recording in real time to ${selectedMimeType}. Keep this tab visible until the song ends.`);
    updateButtons();
  }

  return {
    downloadLastRecord,
    exportVideo,
    getCurrentPlaybackTime,
    getTrackDuration,
    handleStop,
    loadFile,
    pickMimeType,
    resetDownloadLink,
    syncPlaybackGain,
    togglePlayback,
  };
}
