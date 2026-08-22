const { SocketClient } = require('./socket');
const { PeerManager } = require('./webrtc');

const elements = {
  landing: document.querySelector('#landing'),
  room: document.querySelector('#room'),
  name: document.querySelector('#display-name'),
  roomCode: document.querySelector('#room-code'),
  create: document.querySelector('#create-room'),
  join: document.querySelector('#join-room'),
  activeCode: document.querySelector('#active-room-code'),
  copy: document.querySelector('#copy-room-code'),
  copyInvite: document.querySelector('#copy-invite-link'),
  participants: document.querySelector('#participants'),
  microphone: document.querySelector('#microphone'),
  microphoneSelect: document.querySelector('#microphone-select'),
  echoCancellation: document.querySelector('#echo-cancellation'),
  noiseSuppression: document.querySelector('#noise-suppression'),
  autoGainControl: document.querySelector('#auto-gain-control'),
  processMicrophoneTest: document.querySelector('#process-microphone-test'),
  pushToTalk: document.querySelector('#push-to-talk'),
  pushToTalkKey: document.querySelector('#push-to-talk-key'),
  microphoneGain: document.querySelector('#microphone-gain'),
  microphoneGainValue: document.querySelector('#microphone-gain-value'),
  audioProcessingStatus: document.querySelector('#audio-processing-status'),
  testMicrophone: document.querySelector('#test-microphone'),
  microphoneLevel: document.querySelector('#microphone-level'),
  microphoneTestStatus: document.querySelector('#microphone-test-status'),
  audioSettingsOpen: document.querySelector('#audio-settings-open'),
  audioSettingsModal: document.querySelector('#audio-settings-modal'),
  audioSettingsClose: document.querySelector('#audio-settings-close'),
  audioSettingsApply: document.querySelector('#audio-settings-apply'),
  audioSettingsReset: document.querySelector('#audio-settings-reset'),
  screen: document.querySelector('#screen-share'),
  screenVolume: document.querySelector('#screen-volume'),
  screenVolumeValue: document.querySelector('#screen-volume-value'),
  screenFullscreen: document.querySelector('#screen-fullscreen'),
  reconnect: document.querySelector('#reconnect-call'),
  screenAudioStatus: document.querySelector('#screen-audio-status'),
  leave: document.querySelector('#leave-room'),
  screenStage: document.querySelector('#screen-stage'),
  screenEmptyStage: document.querySelector('#screen-empty-stage'),
  screenShareList: document.querySelector('#screen-share-list'),
  sourcePicker: document.querySelector('#source-picker'),
  sourceList: document.querySelector('#source-list'),
  screenQuality: document.querySelector('#screen-quality'),
  includeScreenAudio: document.querySelector('#include-screen-audio'),
  cancelSource: document.querySelector('#cancel-source'),
  status: document.querySelector('#status'),
  latency: document.querySelector('#latency'),
  notice: document.querySelector('#notice'),
  profileBadge: document.querySelector('#profile-badge'),
  profilePhotoInput: document.querySelector('#profile-photo-input'),
  landingAvatar: document.querySelector('#landing-avatar')
};

let socketClient;
let peerManager;
let selfId;
let roomCode;
let currentRoom;
let muted = false;
let sharingScreen = false;
let screenVolumeLevel = 1;
let selectedScreenParticipantId = null;
let watchingScreenParticipantId = null;
let screenWatchActionInProgress = false;
let latencyTimer = null;
let reconnectInProgress = false;
let capturingPttKey = false;
let pttPressed = false;
let pttInitialization = null;
let screenQuality = '720p';
const screenAudioSourceIds = new Set();
const speakingParticipants = new Set();
const speakingMonitors = new Map();
let speakingAudioContext = null;
const PARTICIPANT_VOLUME_STORAGE_KEY = 'voiceroom.participantVolumes';
const DISPLAY_NAME_STORAGE_KEY = 'voiceroom.displayName';
const SCREEN_QUALITY_STORAGE_KEY = 'voiceroom.screenQuality';
const PROFILE_AVATAR_STORAGE_KEY = 'voiceroom.profileAvatar';
const MAX_PROFILE_AVATAR_LENGTH = 32_000;

const AUDIO_SETTINGS_STORAGE_KEY = 'voiceroom.audioSettings';
const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  processMicrophoneTest: false,
  inputGain: 1,
  pushToTalk: false,
  pushToTalkKey: 'Space'
});

const AUDIO_PROCESSING_LABELS = Object.freeze({
  echoCancellation: 'cancelamento de eco',
  noiseSuppression: 'supressão de ruído',
  autoGainControl: 'ganho automático'
});

function clampInputGain(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_AUDIO_SETTINGS.inputGain;
  return Math.min(2, Math.max(0, numericValue));
}

function loadAudioSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY) || '{}');
    return {
      echoCancellation: saved.echoCancellation !== false,
      noiseSuppression: saved.noiseSuppression !== false,
      autoGainControl: saved.autoGainControl !== false,
      processMicrophoneTest: saved.processMicrophoneTest === true,
      inputGain: clampInputGain(saved.inputGain),
      pushToTalk: saved.pushToTalk === true,
      pushToTalkKey: typeof saved.pushToTalkKey === 'string' && saved.pushToTalkKey.length <= 40
        ? saved.pushToTalkKey
        : DEFAULT_AUDIO_SETTINGS.pushToTalkKey
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

let audioSettings = loadAudioSettings();
let profileAvatar = '';

function normalizeAvatarData(value) {
  if (typeof value !== 'string' || value.length > MAX_PROFILE_AVATAR_LENGTH) return '';
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}

function loadProfileAvatar() {
  try { return normalizeAvatarData(localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY) || ''); } catch { return ''; }
}

function persistProfileAvatar() {
  try {
    if (profileAvatar) localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, profileAvatar);
    else localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function getAvatarInitials(displayName = '') {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : words[0]?.[0] || 'V').toUpperCase();
}

function renderAvatarElement(element, avatar, fallback) {
  if (!element) return;
  element.replaceChildren();
  element.classList.toggle('has-avatar', Boolean(avatar));
  if (avatar) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '';
    image.draggable = false;
    element.append(image);
  } else {
    element.textContent = fallback;
  }
}

function renderProfileAvatar() {
  const fallback = getAvatarInitials(elements.name?.value || 'VoiceRoom');
  renderAvatarElement(elements.profileBadge, profileAvatar, fallback);
  if (elements.profileBadge) {
    elements.profileBadge.title = profileAvatar
      ? 'Clique para trocar sua foto de perfil'
      : 'Clique para escolher uma foto de perfil';
  }
  if (elements.landingAvatar) {
    renderAvatarElement(elements.landingAvatar, profileAvatar, fallback);
    const camera = document.createElement('span');
    camera.textContent = '⌕';
    camera.setAttribute('aria-hidden', 'true');
    elements.landingAvatar.append(camera);
  }
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('A imagem não pôde ser carregada.'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Seu sistema não permite preparar esta imagem.'));
          return;
        }
        context.fillStyle = '#1a1a1f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        let avatar = canvas.toDataURL('image/jpeg', 0.82);
        if (avatar.length > MAX_PROFILE_AVATAR_LENGTH) avatar = canvas.toDataURL('image/jpeg', 0.62);
        if (avatar.length > MAX_PROFILE_AVATAR_LENGTH) {
          reject(new Error('Escolha uma imagem menor.'));
          return;
        }
        resolve(avatar);
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function handleProfilePhotoChange() {
  const file = elements.profilePhotoInput?.files?.[0];
  if (!file) return;
  elements.profilePhotoInput.value = '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showNotice('Escolha uma imagem PNG, JPG ou WebP.');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showNotice('A imagem deve ter no máximo 8 MB antes da compactação.');
    return;
  }
  try {
    profileAvatar = await resizeAvatar(file);
    renderProfileAvatar();
    if (!persistProfileAvatar()) showNotice('Foto aplicada, mas não foi possível salvá-la localmente.', 'warning');
    if (currentRoom && socketClient) {
      const response = await socketClient.setProfileAvatar(profileAvatar);
      if (!response?.ok) showNotice(responseError(response));
      const self = currentRoom.participants.find((participant) => participant.participantId === selfId);
      if (self) self.avatar = profileAvatar;
      renderParticipants();
    }
    showNotice('Foto de perfil atualizada.', 'success');
  } catch (error) {
    showNotice(error.message || 'Não foi possível usar essa imagem.');
  }
}

function persistAudioSettings() {
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(audioSettings));
  } catch {
    // Preferimos manter a configuração apenas durante esta execução se o armazenamento estiver indisponível.
  }
}

function syncAudioSettingsControls() {
  elements.echoCancellation.checked = audioSettings.echoCancellation;
  elements.noiseSuppression.checked = audioSettings.noiseSuppression;
  elements.autoGainControl.checked = audioSettings.autoGainControl;
  elements.processMicrophoneTest.checked = audioSettings.processMicrophoneTest;
  elements.pushToTalk.checked = audioSettings.pushToTalk;
  elements.pushToTalkKey.textContent = formatPttKey(audioSettings.pushToTalkKey);
  elements.microphoneGain.value = String(Math.round(audioSettings.inputGain * 100));
  elements.microphoneGainValue.textContent = `${Math.round(audioSettings.inputGain * 100)}%`;
}

function collectAudioSettingsFromControls() {
  return {
    echoCancellation: elements.echoCancellation.checked,
    noiseSuppression: elements.noiseSuppression.checked,
    autoGainControl: elements.autoGainControl.checked,
    processMicrophoneTest: elements.processMicrophoneTest.checked,
    inputGain: clampInputGain(Number(elements.microphoneGain.value) / 100),
    pushToTalk: elements.pushToTalk.checked,
    pushToTalkKey: audioSettings.pushToTalkKey
  };
}

function readAudioSettingsFromControls() {
  audioSettings = collectAudioSettingsFromControls();
  elements.microphoneGainValue.textContent = `${Math.round(audioSettings.inputGain * 100)}%`;
  persistAudioSettings();
  peerManager?.setInputGain(audioSettings.inputGain);
}

function formatPttKey(code) {
  if (!code) return 'Barra de espaço';
  if (code === 'Space') return 'Barra de espaço';
  if (code === 'Escape') return 'Esc';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/^Arrow/, 'Seta ');
}

function loadParticipantVolumes() {
  try {
    const value = JSON.parse(localStorage.getItem(PARTICIPANT_VOLUME_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

let participantVolumes = loadParticipantVolumes();

function getParticipantVolume(participantId) {
  const value = Number(participantVolumes[participantId]);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function setParticipantVolume(participantId, value) {
  const numericValue = Number(value);
  if (!participantId || !Number.isFinite(numericValue)) return;
  participantVolumes[participantId] = Math.min(1, Math.max(0, numericValue));
  try { localStorage.setItem(PARTICIPANT_VOLUME_STORAGE_KEY, JSON.stringify(participantVolumes)); } catch { /* armazenamento opcional */ }
  document.querySelectorAll('audio[data-participant-id]').forEach((audio) => {
    if (audio.dataset.participantId === participantId && audio.dataset.screenAudio !== 'true') {
      audio.volume = getParticipantVolume(participantId);
    }
  });
}

function setScreenQuality(value) {
  screenQuality = value === '480p' ? '480p' : '720p';
  if (elements.screenQuality) elements.screenQuality.value = screenQuality;
  try { localStorage.setItem(SCREEN_QUALITY_STORAGE_KEY, screenQuality); } catch { /* armazenamento opcional */ }
}

function loadLocalPreferences() {
  try {
    const savedName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    if (savedName) elements.name.value = savedName;
    const savedQuality = localStorage.getItem(SCREEN_QUALITY_STORAGE_KEY);
    if (savedQuality) screenQuality = savedQuality === '480p' ? '480p' : '720p';
  } catch { /* armazenamento opcional */ }
  setScreenQuality(screenQuality);
}

function renderAudioProcessingStatus(settings = {}) {
  if (!peerManager?.getAudioTrack()) {
    elements.audioProcessingStatus.textContent = 'Será aplicado quando o microfone for ativado.';
    elements.audioProcessingStatus.dataset.type = 'info';
    return;
  }
  const unsupported = Object.entries(AUDIO_PROCESSING_LABELS)
    .filter(([key]) => settings[key] !== undefined && settings[key] !== audioSettings[key])
    .map(([, label]) => label);
  elements.audioProcessingStatus.textContent = unsupported.length
    ? `O dispositivo não confirmou: ${unsupported.join(', ')}.`
    : 'Processamento aplicado ao áudio enviado.';
  elements.audioProcessingStatus.dataset.type = unsupported.length ? 'warning' : 'success';
}

async function changeAudioProcessing() {
  const previousSettings = { ...audioSettings };
  const nextSettings = collectAudioSettingsFromControls();
  audioSettings = nextSettings;
  peerManager?.setInputGain(nextSettings.inputGain);
  try {
    if (peerManager?.getAudioTrack()) {
      await peerManager.setAudioProcessing(nextSettings);
    }
    persistAudioSettings();
    renderAudioProcessingStatus(peerManager?.getAudioProcessingSettings() || {});
    if (nextSettings.processMicrophoneTest && peerManager?.microphoneLoopback) {
      await restartMicrophoneLoopback();
    }
  } catch (error) {
    audioSettings = previousSettings;
    syncAudioSettingsControls();
    peerManager?.setInputGain(previousSettings.inputGain);
    if (peerManager?.getAudioTrack()) {
      await peerManager.setAudioProcessing(previousSettings).catch(() => {});
    }
    const message = error.code === 'AUDIO_CONSTRAINT_UNSUPPORTED'
      ? 'Este microfone não permite alterar essa opção durante a chamada.'
      : 'Não foi possível alterar o processamento do microfone.';
    showNotice(message);
    renderAudioProcessingStatus(peerManager?.getAudioProcessingSettings() || {});
  }
}

function openAudioSettings() {
  if (!elements.audioSettingsModal) return;
  elements.audioSettingsModal.hidden = false;
  elements.audioSettingsClose?.focus();
}

function closeAudioSettings() {
  if (!elements.audioSettingsModal) return;
  elements.audioSettingsModal.hidden = true;
  capturingPttKey = false;
  elements.pushToTalkKey.textContent = formatPttKey(audioSettings.pushToTalkKey);
}

async function resetAudioSettings() {
  audioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  syncAudioSettingsControls();
  peerManager?.setInputGain(audioSettings.inputGain);
  if (peerManager?.getAudioTrack()) {
    await peerManager.setAudioProcessing(audioSettings).catch(() => {});
    renderAudioProcessingStatus(peerManager.getAudioProcessingSettings());
  }
  persistAudioSettings();
  showNotice('Configurações de áudio restauradas.', 'success');
}

async function restartMicrophoneLoopback() {
  if (!peerManager?.microphoneLoopback) return;
  await peerManager.stopMicrophoneLoopback((level) => {
    elements.microphoneLevel.style.width = `${Math.round(level * 100)}%`;
  });
  elements.microphoneTestStatus.textContent = 'Retorno reiniciando…';
  try {
    await peerManager.startMicrophoneLoopback(
      elements.microphoneSelect.value || undefined,
      (level) => { elements.microphoneLevel.style.width = `${Math.round(level * 100)}%`; },
      audioSettings.inputGain,
      audioSettings.processMicrophoneTest ? audioSettings : { processed: false }
    );
    elements.testMicrophone.textContent = 'Parar retorno';
    elements.microphoneTestStatus.textContent = audioSettings.processMicrophoneTest
      ? 'Retorno processado — use fones para evitar microfonia.'
      : 'Retorno direto — use fones para evitar microfonia.';
  } catch {
    elements.testMicrophone.textContent = 'Ouvir microfone';
    elements.microphoneTestStatus.textContent = 'Não foi possível acessar o microfone.';
  }
}

function setStatus(message, type = 'info') {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function updateLatencyLabel(value) {
  if (!elements.latency) return;
  if (!Number.isFinite(value)) {
    elements.latency.textContent = 'Latência: —';
    elements.latency.dataset.type = 'info';
    return;
  }
  elements.latency.textContent = `Latência: ${value} ms`;
  elements.latency.dataset.type = value > 300 ? 'error' : value > 180 ? 'warning' : 'success';
}

async function updateLatency() {
  if (!roomCode || !socketClient) return;
  const mediaLatency = await peerManager?.getLatency?.();
  const latency = Number.isFinite(mediaLatency) ? mediaLatency : await socketClient.measureLatency();
  updateLatencyLabel(latency);
}

function startLatencyMonitoring() {
  window.clearInterval(latencyTimer);
  updateLatency();
  latencyTimer = window.setInterval(updateLatency, 5_000);
}

function stopLatencyMonitoring() {
  window.clearInterval(latencyTimer);
  latencyTimer = null;
  updateLatencyLabel(null);
}

async function reconnectCalls() {
  if (!peerManager || reconnectInProgress) return;
  reconnectInProgress = true;
  elements.reconnect.disabled = true;
  elements.reconnect.textContent = 'Reconectando…';
  setStatus('Reconectando chamadas…', 'warning');
  try {
    await peerManager.reconnectAll();
    showNotice('Nova tentativa de conexão iniciada.', 'success');
  } catch {
    showNotice('Não foi possível iniciar a reconexão.');
  } finally {
    window.setTimeout(() => {
      reconnectInProgress = false;
      elements.reconnect.disabled = false;
      elements.reconnect.textContent = 'Reconectar chamadas';
    }, 1_500);
  }
}

function showNotice(message, type = 'error') {
  elements.notice.textContent = message;
  elements.notice.dataset.type = type;
  elements.notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { elements.notice.hidden = true; }, 6_000);
}

function responseError(response) {
  if (response?.errorCode === 'ROOM_NOT_FOUND') return 'Esta sala não existe.';
  if (response?.errorCode === 'ROOM_FULL') return 'A sala atingiu o limite de 5 participantes.';
  if (response?.errorCode === 'SCREEN_BUSY') return 'A sala já atingiu o limite de 2 transmissões.';
  if (response?.errorCode === 'SCREEN_NOT_ACTIVE') return 'Essa transmissão não está ativa.';
  return response?.message || 'Não foi possível concluir a operação.';
}

function getScreenParticipantIds(room) {
  if (Array.isArray(room?.screenSharingParticipantIds)) return room.screenSharingParticipantIds;
  return (room?.participants || []).filter((participant) => participant.screenSharing).map((participant) => participant.participantId);
}

function renderParticipants() {
  elements.participants.replaceChildren();
  if (!currentRoom) return;
  for (const participant of currentRoom.participants) {
    const item = document.createElement('li');
    item.className = 'participant';
    item.dataset.participantRow = participant.participantId;
    item.dataset.speaking = String(speakingParticipants.has(participant.participantId));
    const state = speakingParticipants.has(participant.participantId)
      ? '●'
      : participant.screenSharing ? '🖥' : participant.muted ? '🔇' : participant.connected ? '●' : '○';
    const stateElement = document.createElement('span');
    stateElement.className = 'participant-state';
    stateElement.setAttribute('aria-hidden', 'true');
    renderAvatarElement(stateElement, normalizeAvatarData(participant.avatar), getAvatarInitials(participant.displayName));
    const nameElement = document.createElement('span');
    nameElement.textContent = participant.displayName + (participant.participantId === selfId ? ' (você)' : '');
    const identity = document.createElement('span');
    identity.className = 'participant-identity';
    identity.append(stateElement, nameElement);
    const statusElement = document.createElement('span');
    statusElement.className = 'participant-status';
    statusElement.setAttribute('aria-hidden', 'true');
    statusElement.textContent = state;
    item.append(identity, statusElement);
    if (participant.participantId !== selfId && participant.connected) {
      const volume = document.createElement('input');
      volume.type = 'range';
      volume.min = '0';
      volume.max = '100';
      volume.step = '1';
      volume.value = String(Math.round(getParticipantVolume(participant.participantId) * 100));
      volume.className = 'participant-volume';
      volume.title = `Volume de ${participant.displayName}`;
      volume.setAttribute('aria-label', `Volume de ${participant.displayName}`);
      volume.addEventListener('input', () => setParticipantVolume(participant.participantId, Number(volume.value) / 100));
      item.append(volume);
    }
    elements.participants.append(item);
  }
}

function setSpeakingState(participantId, speaking) {
  if (speaking) speakingParticipants.add(participantId);
  else speakingParticipants.delete(participantId);
  const item = [...document.querySelectorAll('[data-participant-row]')]
    .find((candidate) => candidate.dataset.participantRow === participantId);
  if (!item) return;
  item.dataset.speaking = String(speaking);
  const state = item.querySelector('.participant-status');
  const participant = currentRoom?.participants.find((entry) => entry.participantId === participantId);
  if (state && participant) {
    state.textContent = speaking ? '●' : participant.screenSharing ? '🖥' : participant.muted ? '🔇' : participant.connected ? '●' : '○';
  }
}

function stopSpeakingMonitor(participantId) {
  const monitor = speakingMonitors.get(participantId);
  if (!monitor) return;
  monitor.active = false;
  if (monitor.animationFrame) cancelAnimationFrame(monitor.animationFrame);
  try { monitor.source.disconnect(); } catch { /* já desconectado */ }
  try { monitor.analyser.disconnect(); } catch { /* já desconectado */ }
  speakingMonitors.delete(participantId);
  setSpeakingState(participantId, false);
}

function startSpeakingMonitor(participantId, track) {
  if (!track || track.kind !== 'audio') return;
  stopSpeakingMonitor(participantId);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    speakingAudioContext ||= new AudioContextClass({ latencyHint: 'interactive' });
    speakingAudioContext.resume().catch(() => {});
    const stream = new MediaStream([track]);
    const source = speakingAudioContext.createMediaStreamSource(stream);
    const analyser = speakingAudioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.38;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const monitor = {
      source,
      analyser,
      stream,
      samples,
      active: true,
      speaking: false,
      animationFrame: null,
      noiseFloor: 0.008,
      voiceStartedAt: 0,
      lastVoiceAt: 0
    };
    speakingMonitors.set(participantId, monitor);
    const update = () => {
      if (!monitor.active) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      if (!monitor.speaking) {
        monitor.noiseFloor = monitor.noiseFloor * 0.96 + Math.min(rms, monitor.noiseFloor * 3) * 0.04;
      }
      const startThreshold = Math.max(0.018, monitor.noiseFloor * 2.6);
      const stopThreshold = Math.max(0.012, monitor.noiseFloor * 1.45);
      if (!monitor.speaking) {
        if (rms > startThreshold) {
          monitor.voiceStartedAt ||= now;
          if (now - monitor.voiceStartedAt >= 70) {
            monitor.speaking = true;
            monitor.lastVoiceAt = now;
            setSpeakingState(participantId, true);
          }
        } else {
          monitor.voiceStartedAt = 0;
        }
      } else if (rms > stopThreshold) {
        monitor.lastVoiceAt = now;
      } else if (now - monitor.lastVoiceAt >= 220) {
        monitor.speaking = false;
        monitor.voiceStartedAt = 0;
        setSpeakingState(participantId, false);
      }
      monitor.animationFrame = requestAnimationFrame(update);
    };
    update();
  } catch {
    // O indicador é complementar e não pode impedir a reprodução da chamada.
  }
}

function stopAllSpeakingMonitors() {
  for (const participantId of speakingMonitors.keys()) stopSpeakingMonitor(participantId);
  speakingParticipants.clear();
  if (speakingAudioContext && speakingAudioContext.state !== 'closed') {
    speakingAudioContext.close().catch(() => {});
  }
  speakingAudioContext = null;
}

function renderRoom(room) {
  currentRoom = room;
  elements.activeCode.textContent = room.code;
  const screenParticipantIds = getScreenParticipantIds(room);
  elements.screen.disabled = !sharingScreen && screenParticipantIds.length >= 2;
  elements.screen.textContent = sharingScreen ? 'Parar tela' : 'Compartilhar tela';
  if (watchingScreenParticipantId && !screenParticipantIds.includes(watchingScreenParticipantId)) {
    const stoppedParticipantId = watchingScreenParticipantId;
    watchingScreenParticipantId = null;
    removeScreenStream(stoppedParticipantId);
  }
  renderScreenShareList(room);
  renderParticipants();
  peerManager?.syncParticipants(room.participants).catch((error) => showNotice(error.message));
}

function renderScreenShareList(room) {
  elements.screenShareList.replaceChildren();
  const activeParticipants = (room?.participants || []).filter((participant) => (
    participant.screenSharing || (participant.participantId === selfId && sharingScreen)
  ));
  if (activeParticipants.some((participant) => participant.participantId !== selfId)) {
    const hint = document.createElement('span');
    hint.className = 'screen-share-hint small muted';
    hint.textContent = 'Você pode assistir a uma transmissão por vez.';
    elements.screenShareList.append(hint);
  }
  for (const participant of activeParticipants) {
    if (participant.participantId === selfId) {
      const status = document.createElement('span');
      status.className = 'screen-share-self small muted';
      status.textContent = 'Você está transmitindo';
      elements.screenShareList.append(status);
      continue;
    }
    const watching = watchingScreenParticipantId === participant.participantId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screen-share-option';
    button.disabled = screenWatchActionInProgress;
    button.setAttribute('aria-pressed', String(watching));
    button.textContent = watching
      ? `Parar de assistir — ${participant.displayName}`
      : `Assistir transmissão — ${participant.displayName}`;
    button.addEventListener('click', () => toggleScreenWatching(participant.participantId));
    elements.screenShareList.append(button);
  }
}

function enterRoom(result) {
  selfId = result.data.participantId;
  roomCode = result.data.room.code;
  elements.landing.hidden = true;
  elements.room.hidden = false;
  setStatus('Sala pronta. Ative o microfone quando quiser.', 'success');
  renderRoom(result.data.room);
  peerManager = new PeerManager({
    socket: socketClient,
    selfId,
    onRemoteStream: attachRemoteStream,
    onPeerState: (participantId, state) => {
      if (['closed', 'failed'].includes(state)) removeParticipantMedia(participantId);
      if (state === 'failed' || state === 'disconnected') {
        elements.reconnect.hidden = false;
        setStatus(state === 'failed'
          ? `Conexão com ${participantId.slice(0, 6)} falhou.`
          : `Conexão com ${participantId.slice(0, 6)} está instável.`, 'warning');
      } else if (['connected', 'completed'].includes(state)) {
        elements.reconnect.hidden = true;
        setStatus('Chamada conectada.', 'success');
      } else if (state !== 'closed') {
        setStatus(`Conexão com ${participantId.slice(0, 6)}: ${state}`);
      }
    },
    onError: (_participantId, code) => {
      if (code === 'P2P_FAILED') {
        elements.reconnect.hidden = false;
        showNotice('Não foi possível conectar com este participante. Tente reconectar; se persistir, a rede pode exigir TURN/VPN.');
      } else showNotice(code);
    }
  });
  peerManager.syncParticipants(currentRoom?.participants || result.data.room.participants).catch((error) => showNotice(error.message));
  startLatencyMonitoring();
}

function renderScreenStream(participantId, stream, { muted = false } = {}) {
  // A viewer can keep only one screen on the stage. A new stream replaces the
  // previous tile, which also covers switching between two active presenters.
  document.querySelectorAll('[data-screen-tile]').forEach((otherTile) => {
    if (otherTile.dataset.screenTile !== participantId) removeScreenStream(otherTile.dataset.screenTile);
  });
  let tile = document.querySelector(`[data-screen-tile="${participantId}"]`);
  let video = tile?.querySelector('[data-participant-video]');
  if (!tile) {
    tile = document.createElement('article');
    tile.className = 'screen-tile';
    tile.dataset.screenTile = participantId;
    tile.addEventListener('click', () => selectScreenParticipant(participantId));
    const label = document.createElement('span');
    label.className = 'screen-tile-label';
    label.textContent = currentRoom?.participants.find((participant) => participant.participantId === participantId)?.displayName || 'Tela compartilhada';
    tile.append(label);
    elements.screenStage.append(tile);
  }
  if (!video) {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.dataset.participantVideo = participantId;
    video.addEventListener('dblclick', () => toggleScreenFullscreen(participantId));
    tile.append(video);
  }
  video.muted = muted;
  video.srcObject = stream;
  const resumeVideo = () => video.play().catch(() => {});
  video.onloadedmetadata = resumeVideo;
  video.oncanplay = resumeVideo;
  resumeVideo();
  elements.screenStage.dataset.active = 'true';
  const hasScreenAudio = Boolean(stream.getAudioTracks?.().length);
  if (hasScreenAudio) screenAudioSourceIds.add(participantId);
  else screenAudioSourceIds.delete(participantId);
  if (!selectedScreenParticipantId) selectedScreenParticipantId = participantId;
  updateScreenStageControls();
  selectScreenParticipant(selectedScreenParticipantId);
}

function attachRemoteStream(participantId, track, stream) {
  if (track.kind === 'audio') {
    const isScreenAudio = Boolean(stream.getVideoTracks?.().length);
    if (isScreenAudio && watchingScreenParticipantId !== participantId) return;
    let audio = document.querySelector(`[data-participant-audio="${participantId}-${track.id}"]`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.dataset.participantAudio = `${participantId}-${track.id}`;
      audio.dataset.participantId = participantId;
      audio.dataset.screenAudio = String(isScreenAudio);
      audio.onended = () => {
        audio.remove();
        if (!isScreenAudio) stopSpeakingMonitor(participantId);
      };
      document.body.append(audio);
    }
    audio.srcObject = new MediaStream([track]);
    if (isScreenAudio) {
      audio.dataset.screenAudio = 'true';
      screenAudioSourceIds.add(participantId);
      elements.screenVolume.disabled = false;
      audio.volume = screenVolumeLevel;
      audio.muted = screenVolumeLevel === 0;
      updateScreenVolume();
    } else {
      audio.volume = getParticipantVolume(participantId);
      startSpeakingMonitor(participantId, track);
    }
    audio.play().catch(() => {});
    return;
  }
  // O áudio da tela toca em um elemento <audio> separado para que o slider
  // controle somente a transmissão, sem duplicar o áudio no <video>.
  if (watchingScreenParticipantId !== participantId) return;
  renderScreenStream(participantId, stream, { muted: true });
}

function selectScreenParticipant(participantId) {
  if (!document.querySelector(`[data-screen-tile="${participantId}"]`)) return;
  selectedScreenParticipantId = participantId;
  document.querySelectorAll('[data-screen-tile]').forEach((tile) => {
    tile.dataset.selected = String(tile.dataset.screenTile === participantId);
  });
}

function updateScreenStageControls() {
  const tiles = [...document.querySelectorAll('[data-screen-tile]')];
  const hasTiles = tiles.length > 0;
  elements.screenStage.dataset.active = String(hasTiles);
  elements.screenEmptyStage.hidden = hasTiles;
  elements.screenFullscreen.disabled = !hasTiles;
  elements.screenVolume.disabled = screenAudioSourceIds.size === 0;
  elements.screenAudioStatus.textContent = hasTiles
    ? `${tiles.length} transmissão${tiles.length === 1 ? '' : 'ões'} em exibição${screenAudioSourceIds.size ? ' com áudio' : ''}`
    : 'Áudio da tela: desativado';
  if (selectedScreenParticipantId && !document.querySelector(`[data-screen-tile="${selectedScreenParticipantId}"]`)) {
    selectedScreenParticipantId = tiles[0]?.dataset.screenTile || null;
  }
  if (selectedScreenParticipantId) selectScreenParticipant(selectedScreenParticipantId);
}

function removeScreenStream(participantId) {
  document.querySelector(`[data-screen-tile="${participantId}"]`)?.remove();
  document.querySelectorAll('[data-participant-audio]').forEach((audio) => {
    if (audio.dataset.participantAudio.startsWith(`${participantId}-`) && audio.dataset.screenAudio === 'true') audio.remove();
  });
  screenAudioSourceIds.delete(participantId);
  updateScreenStageControls();
}

async function toggleScreenFullscreen(participantId = selectedScreenParticipantId) {
  const tile = document.querySelector(`[data-screen-tile="${participantId}"]`);
  const video = tile?.querySelector('[data-participant-video]');
  if (!video) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    // Fullscreen the stable stage container instead of the MediaStream video
    // itself. This keeps the WebRTC element attached to the same layout and
    // avoids black frames when Chromium/Electron changes fullscreen surfaces.
    const target = tile || elements.screenStage;
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' });
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    } else if (video.requestFullscreen) {
      await video.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  } catch {
    showNotice('Não foi possível abrir a tela cheia.');
  }
}

function updateFullscreenButton() {
  elements.screenFullscreen.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
}

function updateScreenVolume() {
  const percentage = Math.round(screenVolumeLevel * 100);
  elements.screenVolume.value = String(percentage);
  elements.screenVolumeValue.textContent = `${percentage}%`;
  document.querySelectorAll('audio[data-screen-audio="true"]').forEach((audio) => {
    audio.volume = screenVolumeLevel;
    audio.muted = screenVolumeLevel === 0;
  });
}

function setScreenVolume(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  screenVolumeLevel = Math.min(100, Math.max(0, numericValue)) / 100;
  updateScreenVolume();
}

async function toggleScreenWatching(participantId) {
  if (!peerManager || participantId === selfId || screenWatchActionInProgress) return;
  screenWatchActionInProgress = true;
  try {
    const previousParticipantId = watchingScreenParticipantId;
    if (previousParticipantId === participantId) {
      const response = await socketClient.unsubscribeScreen(participantId);
      if (!response?.ok) {
        showNotice(responseError(response));
        return;
      }
      watchingScreenParticipantId = null;
      removeScreenStream(participantId);
      return;
    }

    // Subscribe to the new stream first. If it fails, the current stream
    // remains visible instead of leaving the viewer with a blank stage.
    const subscribeResponse = await socketClient.subscribeScreen(participantId);
    if (!subscribeResponse?.ok) {
      showNotice(responseError(subscribeResponse));
      return;
    }
    watchingScreenParticipantId = participantId;
    if (previousParticipantId) {
      removeScreenStream(previousParticipantId);
      const unsubscribeResponse = await socketClient.unsubscribeScreen(previousParticipantId);
      if (!unsubscribeResponse?.ok) showNotice(responseError(unsubscribeResponse));
    }
  } finally {
    screenWatchActionInProgress = false;
    if (currentRoom) renderScreenShareList(currentRoom);
  }
}

function removeParticipantMedia(participantId) {
  document.querySelectorAll('[data-participant-audio]').forEach((audio) => {
    if (audio.dataset.participantAudio.startsWith(`${participantId}-`)) audio.remove();
  });
  removeScreenStream(participantId);
  stopSpeakingMonitor(participantId);
}

async function initializeAudio() {
  try {
    peerManager.setMuted(audioSettings.pushToTalk ? true : muted);
    await peerManager.startAudio(elements.microphoneSelect.value || undefined, audioSettings);
    elements.microphone.disabled = false;
    muted = audioSettings.pushToTalk ? true : Boolean(peerManager.muted);
    peerManager.setMuted(muted);
    if (audioSettings.pushToTalk) await socketClient.setMuted(true);
    startSpeakingMonitor(selfId, peerManager.getAudioTrack());
    elements.microphone.textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
    renderAudioProcessingStatus(peerManager.getAudioProcessingSettings());
    setStatus(audioSettings.pushToTalk ? 'Microfone pronto. Segure a tecla do PTT para falar.' : 'Microfone conectado.', 'success');
  } catch (error) {
    showNotice('Não foi possível acessar seu microfone. Verifique as permissões do Windows.');
    setStatus(error.message, 'error');
  }
}

async function toggleMicrophoneLoopback() {
  if (!peerManager) return;
  if (peerManager.microphoneLoopback) {
    await peerManager.stopMicrophoneLoopback((level) => {
      elements.microphoneLevel.style.width = `${Math.round(level * 100)}%`;
    });
    elements.testMicrophone.textContent = 'Ouvir microfone';
    elements.microphoneTestStatus.textContent = 'Retorno desligado.';
    return;
  }
  elements.testMicrophone.disabled = true;
  elements.microphoneTestStatus.textContent = 'Retorno ligado — use fones para evitar microfonia.';
  elements.microphoneLevel.style.width = '0%';
  try {
    await peerManager.startMicrophoneLoopback(
      elements.microphoneSelect.value || undefined,
      (level) => { elements.microphoneLevel.style.width = `${Math.round(level * 100)}%`; },
      audioSettings.inputGain,
      audioSettings.processMicrophoneTest ? audioSettings : { processed: false }
    );
    elements.testMicrophone.textContent = 'Parar retorno';
    elements.microphoneTestStatus.textContent = audioSettings.processMicrophoneTest
      ? 'Retorno processado — use fones para evitar microfonia.'
      : 'Retorno direto — use fones para evitar microfonia.';
  } catch (error) {
    elements.microphoneTestStatus.textContent = 'Não foi possível acessar o microfone.';
    showNotice('Verifique as permissões do Windows e o dispositivo selecionado.');
  } finally {
    elements.testMicrophone.disabled = false;
  }
}

async function loadMicrophones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    elements.microphoneSelect.replaceChildren();
    for (const device of devices.filter((item) => item.kind === 'audioinput')) {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microfone ${elements.microphoneSelect.length + 1}`;
      elements.microphoneSelect.append(option);
    }
  } catch {
    // A enumeração pode não expor rótulos antes da permissão; o fluxo de captura continua disponível.
  }
}

async function createOrJoin(action) {
  const displayName = elements.name.value.trim();
  if (!displayName) {
    showNotice('Digite um nome para entrar na sala.');
    elements.name.focus();
    return;
  }
  try { localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName); } catch { /* armazenamento opcional */ }
  elements.create.disabled = true;
  elements.join.disabled = true;
  setStatus('Conectando ao servidor…');
  const result = action === 'create'
    ? await socketClient.createRoom(displayName, profileAvatar || null)
    : await socketClient.joinRoom(elements.roomCode.value, displayName, profileAvatar || null);
  elements.create.disabled = false;
  elements.join.disabled = false;
  if (!result?.ok) {
    showNotice(responseError(result));
    setStatus('Não foi possível entrar.', 'error');
    return;
  }
  enterRoom(result);
  await loadMicrophones();
}

async function toggleMicrophone() {
  if (audioSettings.pushToTalk) {
    if (!peerManager.getAudioTrack()) await initializeAudio();
    showNotice(`PTT ativo: segure ${formatPttKey(audioSettings.pushToTalkKey)} para falar.`, 'success');
    return;
  }
  if (!peerManager.getAudioTrack()) {
    await initializeAudio();
    return;
  }
  muted = !muted;
  peerManager.setMuted(muted);
  await socketClient.setMuted(muted);
  elements.microphone.textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
  renderRoom(currentRoom);
}

async function setMicrophoneMuted(nextMuted) {
  if (!peerManager?.getAudioTrack()) return;
  muted = Boolean(nextMuted);
  peerManager.setMuted(muted);
  await socketClient.setMuted(muted);
  elements.microphone.textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
  renderRoom(currentRoom);
}

async function toggleScreen() {
  try {
    if (sharingScreen) {
      await peerManager.stopScreenShare();
      sharingScreen = false;
      removeScreenStream(selfId);
      renderRoom(currentRoom);
      return;
    }
    const selection = await chooseScreenSource();
    const stream = await peerManager.startScreenShare(selection.sourceId, {
      includeSystemAudio: selection.includeSystemAudio,
      quality: selection.quality
    });
    sharingScreen = true;
    renderScreenStream(selfId, stream, { muted: true });
    renderRoom(currentRoom);
  } catch (error) {
    if (error.name !== 'AbortError') showNotice(error.message || 'Não foi possível compartilhar a tela.');
  }
}

async function chooseScreenSource() {
  if (!window.voiceRoom?.getScreenSources) {
    return { sourceId: undefined, includeSystemAudio: false };
  }
  const sources = await window.voiceRoom.getScreenSources();
  if (!sources.length) throw new Error('Nenhuma janela ou tela disponível para compartilhar.');
  elements.sourceList.replaceChildren();
  elements.includeScreenAudio.checked = false;
  elements.screenQuality.value = screenQuality;
  return new Promise((resolve, reject) => {
    const close = () => {
      elements.sourcePicker.hidden = true;
      elements.cancelSource.removeEventListener('click', onCancel);
    };
    const onCancel = () => {
      close();
      reject(new DOMException('Seleção cancelada', 'AbortError'));
    };
    elements.cancelSource.addEventListener('click', onCancel);
    for (const source of sources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'source-option';
      button.textContent = source.name;
      button.addEventListener('click', () => {
        close();
        resolve({
          sourceId: source.id,
          includeSystemAudio: elements.includeScreenAudio.checked,
          quality: elements.screenQuality.value
        });
      }, { once: true });
      elements.sourceList.append(button);
    }
    elements.sourcePicker.hidden = false;
  });
}

async function leaveRoom() {
  try { await socketClient.leaveRoom(); } catch { /* conexão já pode ter caído */ }
  closeAudioSettings();
  peerManager?.close();
  stopAllSpeakingMonitors();
  stopLatencyMonitoring();
  peerManager = null;
  selfId = null;
  roomCode = null;
  currentRoom = null;
  sharingScreen = false;
  watchingScreenParticipantId = null;
  screenWatchActionInProgress = false;
  screenAudioSourceIds.clear();
  selectedScreenParticipantId = null;
  elements.room.hidden = true;
  elements.landing.hidden = false;
  elements.screenStage.querySelectorAll('[data-screen-tile]').forEach((tile) => tile.remove());
  elements.screenStage.querySelectorAll('[data-participant-audio]').forEach((audio) => audio.remove());
  elements.screenEmptyStage.hidden = false;
  elements.screenStage.dataset.active = 'false';
  elements.screenVolume.disabled = true;
  elements.screenFullscreen.disabled = true;
  elements.screenAudioStatus.textContent = 'Áudio da tela: desativado';
  elements.reconnect.hidden = true;
  elements.reconnect.disabled = false;
  elements.reconnect.textContent = 'Reconectar chamadas';
  muted = false;
  setStatus('Pronto para criar ou entrar em uma sala.');
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  );
}

function handlePttKeyCapture(event) {
  if (!capturingPttKey) return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.code === 'Escape') {
    capturingPttKey = false;
    elements.pushToTalkKey.textContent = formatPttKey(audioSettings.pushToTalkKey);
    return true;
  }
  if (!event.code || event.code === 'Unidentified') return true;
  audioSettings.pushToTalkKey = event.code;
  capturingPttKey = false;
  elements.pushToTalkKey.textContent = formatPttKey(event.code);
  persistAudioSettings();
  showNotice(`Tecla do PTT definida: ${formatPttKey(event.code)}.`, 'success');
  return true;
}

function handlePttKeyDown(event) {
  if (handlePttKeyCapture(event)) return;
  if (!audioSettings.pushToTalk || event.code !== audioSettings.pushToTalkKey || event.repeat || isEditableTarget(event.target)) return;
  event.preventDefault();
  pttPressed = true;
  if (!peerManager?.getAudioTrack()) {
    pttInitialization ||= initializeAudio();
  }
  Promise.resolve(pttInitialization).then(() => {
    pttInitialization = null;
    if (pttPressed && audioSettings.pushToTalk) setMicrophoneMuted(false).catch(() => {});
  });
}

function handlePttKeyUp(event) {
  if (!audioSettings.pushToTalk || event.code !== audioSettings.pushToTalkKey) return;
  event.preventDefault();
  pttPressed = false;
  setMicrophoneMuted(true).catch(() => {});
}

function releasePtt() {
  if (!pttPressed) return;
  pttPressed = false;
  setMicrophoneMuted(true).catch(() => {});
}

function getInviteLink() {
  return roomCode ? `voiceroom://join/${encodeURIComponent(roomCode)}` : '';
}

async function copyInviteLink() {
  const inviteLink = getInviteLink();
  if (!inviteLink) return;
  try {
    await navigator.clipboard.writeText(inviteLink);
    showNotice('Link de convite copiado. Ao clicar nele, o VoiceRoom abre com o código preenchido.', 'success');
  } catch {
    showNotice(`Copie este link: ${inviteLink}`);
  }
}

function handleDeepLink(url) {
  if (typeof url !== 'string' || !url.toLowerCase().startsWith('voiceroom://')) return;
  const match = url.match(/^voiceroom:\/\/join\/([A-Za-z0-9]+)$/i);
  if (!match) return;
  const code = decodeURIComponent(match[1]).toUpperCase();
  elements.roomCode.value = code;
  if (elements.landing.hidden) {
    showNotice(`Código ${code} recebido pelo link. Saia da sala atual para entrar nele.`);
  } else {
    elements.roomCode.focus();
    showNotice(`Código ${code} preenchido pelo link.`, 'success');
  }
}

function bindEvents() {
  elements.create.addEventListener('click', () => createOrJoin('create'));
  elements.join.addEventListener('click', () => createOrJoin('join'));
  elements.roomCode.addEventListener('input', () => { elements.roomCode.value = elements.roomCode.value.toUpperCase(); });
  elements.copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(roomCode);
    showNotice('Código copiado.', 'success');
  });
  elements.copyInvite.addEventListener('click', copyInviteLink);
  elements.profileBadge?.addEventListener('click', () => elements.profilePhotoInput?.click());
  elements.profilePhotoInput?.addEventListener('change', handleProfilePhotoChange);
  elements.microphone.addEventListener('click', toggleMicrophone);
  elements.microphoneSelect.addEventListener('change', initializeAudio);
  elements.audioSettingsOpen?.addEventListener('click', openAudioSettings);
  elements.audioSettingsClose?.addEventListener('click', closeAudioSettings);
  elements.audioSettingsApply?.addEventListener('click', async () => {
    await changeAudioProcessing();
    closeAudioSettings();
  });
  elements.audioSettingsReset?.addEventListener('click', resetAudioSettings);
  elements.audioSettingsModal?.addEventListener('click', (event) => {
    if (event.target === elements.audioSettingsModal) closeAudioSettings();
  });
  elements.echoCancellation.addEventListener('change', changeAudioProcessing);
  elements.noiseSuppression.addEventListener('change', changeAudioProcessing);
  elements.autoGainControl.addEventListener('change', changeAudioProcessing);
  elements.processMicrophoneTest.addEventListener('change', async () => {
    readAudioSettingsFromControls();
    await restartMicrophoneLoopback();
  });
  elements.pushToTalk.addEventListener('change', async () => {
    audioSettings = collectAudioSettingsFromControls();
    persistAudioSettings();
    if (audioSettings.pushToTalk && peerManager?.getAudioTrack()) await setMicrophoneMuted(true);
    showNotice(audioSettings.pushToTalk
      ? `PTT ativo: segure ${formatPttKey(audioSettings.pushToTalkKey)} para falar.`
      : 'PTT desativado.', 'success');
  });
  elements.pushToTalkKey.addEventListener('click', () => {
    capturingPttKey = true;
    elements.pushToTalkKey.textContent = 'Pressione uma tecla…';
  });
  elements.microphoneGain.addEventListener('input', readAudioSettingsFromControls);
  elements.testMicrophone.addEventListener('click', toggleMicrophoneLoopback);
  elements.screen.addEventListener('click', toggleScreen);
  elements.reconnect.addEventListener('click', reconnectCalls);
  elements.screenVolume.addEventListener('input', () => setScreenVolume(elements.screenVolume.value));
  elements.screenQuality.addEventListener('change', () => setScreenQuality(elements.screenQuality.value));
  elements.screenFullscreen.addEventListener('click', toggleScreenFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  elements.leave.addEventListener('click', leaveRoom);
  elements.name.addEventListener('input', () => {
    try { localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, elements.name.value); } catch { /* armazenamento opcional */ }
    renderProfileAvatar();
  });
  document.addEventListener('keydown', handlePttKeyDown);
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !capturingPttKey) closeAudioSettings();
  });
  document.addEventListener('keyup', handlePttKeyUp);
  window.addEventListener('blur', releasePtt);
  window.voiceRoom?.onDeepLink?.(handleDeepLink);
}

function handleSocketEvent(event, payload) {
  if (event === 'connect') {
    if (roomCode) {
      setStatus('Servidor conectado. Recuperando chamada…', 'success');
      updateLatency();
    }
    return;
  }
  if (event === 'room:state') {
    renderRoom(payload.room);
    return;
  }
  if (event === 'peer:offer') {
    peerManager?.handleOffer(payload.fromParticipantId, payload.signal.description).catch((error) => showNotice(error.message));
    return;
  }
  if (event === 'peer:answer') {
    peerManager?.handleAnswer(payload.fromParticipantId, payload.signal.description).catch((error) => showNotice(error.message));
    return;
  }
  if (event === 'peer:ice') {
    peerManager?.handleIce(payload.fromParticipantId, payload.signal.candidate).catch(() => {});
    return;
  }
  if (event === 'screen:viewer-joined') {
    if (payload.ownerParticipantId === selfId) {
      peerManager?.setScreenViewer(payload.viewerParticipantId, true).catch((error) => showNotice(error.message));
    }
    return;
  }
  if (event === 'screen:viewer-left') {
    if (payload.ownerParticipantId === selfId) {
      peerManager?.setScreenViewer(payload.viewerParticipantId, false).catch((error) => showNotice(error.message));
    }
    return;
  }
  if (event === 'screen:stopped') {
    if (payload.participantId) {
      if (watchingScreenParticipantId === payload.participantId) watchingScreenParticipantId = null;
      removeScreenStream(payload.participantId);
    }
    if (payload.participantId === selfId) sharingScreen = false;
    if (currentRoom) renderRoom(currentRoom);
    return;
  }
  if (event === 'disconnect' && roomCode) {
    setStatus('Conexão perdida. Tentando reconectar…', 'warning');
  }
  if (event === 'resume-result' && !payload?.ok) {
    showNotice('A sala expirou. Crie ou entre em uma nova sala.');
    leaveRoom();
  }
}

function bootstrap() {
  loadLocalPreferences();
  profileAvatar = loadProfileAvatar();
  renderProfileAvatar();
  syncAudioSettingsControls();
  bindEvents();
  socketClient = new SocketClient({ onEvent: handleSocketEvent });
  setStatus('Conectando ao servidor…');
}

bootstrap();
