const { SocketClient } = require('./socket');
const { PeerManager } = require('./webrtc');
const { getScreenProfile, normalizeScreenProfile } = require('./screen-quality');
const { DEFAULT_SIGNALING_PORT, LOCAL_ROOM_CODE } = require('./config');
const { normalizeHostAddress } = require('../../../shared/validation');

const elements = {
  landing: document.querySelector('#landing'),
  room: document.querySelector('#room'),
  name: document.querySelector('#display-name'),
  hostIp: document.querySelector('#host-ip'),
  create: document.querySelector('#create-room'),
  join: document.querySelector('#join-room'),
  activeIp: document.querySelector('#active-room-ip'),
  copyIp: document.querySelector('#copy-room-ip'),
  copyInvite: document.querySelector('#copy-invite-link'),
  networkPicker: document.querySelector('#network-picker'),
  networkInterface: document.querySelector('#network-interface'),
  networkConfirm: document.querySelector('#network-confirm'),
  networkRefresh: document.querySelector('#network-refresh'),
  networkOther: document.querySelector('#network-other'),
  networkStatus: document.querySelector('#network-status'),
  networkDiscover: document.querySelector('#network-discover'),
  networkDiscoveryStatus: document.querySelector('#network-discovery-status'),
  networkPeerList: document.querySelector('#network-peer-list'),
  participants: document.querySelector('#participants'),
  microphone: document.querySelector('#microphone'),
  voiceMicrophone: document.querySelector('#voice-microphone'),
  voiceDeafen: document.querySelector('#voice-deafen'),
  microphoneSelect: document.querySelector('#microphone-select'),
  echoCancellation: document.querySelector('#echo-cancellation'),
  noiseSuppressionMode: document.querySelector('#noise-suppression-mode'),
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
  screenShareLabel: document.querySelector('#screen-share-label'),
  screenVolume: document.querySelector('#screen-volume'),
  screenVolumeValue: document.querySelector('#screen-volume-value'),
  screenVolumeToggle: document.querySelector('#screen-volume-toggle'),
  screenFullscreen: document.querySelector('#screen-fullscreen'),
  screenFullscreenLabel: document.querySelector('#screen-fullscreen-label'),
  reconnect: document.querySelector('#reconnect-call'),
  screenAudioStatus: document.querySelector('#screen-audio-status'),
  leave: document.querySelector('#leave-room'),
  screenStage: document.querySelector('#screen-stage'),
  screenEmptyStage: document.querySelector('#screen-empty-stage'),
  screenGallery: document.querySelector('#screen-gallery'),
  screenShareList: document.querySelector('#screen-share-list'),
  screenDiagnosticsToggle: document.querySelector('#screen-diagnostics-toggle'),
  screenDiagnostics: document.querySelector('#screen-diagnostics'),
  screenDiagnosticsList: document.querySelector('#screen-diagnostics-list'),
  sourcePicker: document.querySelector('#source-picker'),
  sourceList: document.querySelector('#source-list'),
  screenQuality: document.querySelector('#screen-quality'),
  screenQualityRecommendation: document.querySelector('#screen-quality-recommendation'),
  includeScreenAudio: document.querySelector('#include-screen-audio'),
  cancelSource: document.querySelector('#cancel-source'),
  status: document.querySelector('#status'),
  latency: document.querySelector('#latency'),
  notice: document.querySelector('#notice'),
  themeToggle: document.querySelector('#theme-toggle'),
  windowMinimize: document.querySelector('#window-minimize'),
  windowMaximize: document.querySelector('#window-maximize'),
  windowClose: document.querySelector('#window-close'),
  stageArea: document.querySelector('#stage-area'),
  roomDuration: document.querySelector('#room-duration'),
  voiceChannel: document.querySelector('#voice-channel'),
  textChannel: document.querySelector('#text-channel'),
  textChannelName: document.querySelector('#text-channel-name'),
  voiceView: document.querySelector('#voice-view'),
  textView: document.querySelector('#text-view'),
  playerOnline: document.querySelector('#player-online'),
  streamSwitcher: document.querySelector('#stream-switcher'),
  presenceToasts: document.querySelector('#presence-toasts'),
  presenceNotifications: document.querySelector('#presence-notifications'),
  chatMessages: document.querySelector('#chat-messages'),
  chatTitle: document.querySelector('#chat-title'),
  chatEmpty: document.querySelector('#chat-empty'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatImageOpen: document.querySelector('#chat-image-open'),
  chatImageInput: document.querySelector('#chat-image-input'),
  appUpdate: document.querySelector('#app-update'),
  appUpdateTitle: document.querySelector('#app-update-title'),
  appUpdateMessage: document.querySelector('#app-update-message'),
  appUpdateInstall: document.querySelector('#app-update-install'),
  appUpdateDismiss: document.querySelector('#app-update-dismiss'),
  appUpdateCheck: document.querySelector('#app-update-check'),
  appUpdateSettingsStatus: document.querySelector('#app-update-settings-status'),
  appVersionLabel: document.querySelector('#app-version-label'),
  profileBadge: document.querySelector('#profile-badge'),
  profilePhotoInput: document.querySelector('#profile-photo-input'),
  landingAvatar: document.querySelector('#landing-avatar'),
  profileLocalNote: document.querySelector('#profile-local-note'),
  contextMenu: document.querySelector('#context-menu'),
  contextMenuTitle: document.querySelector('#context-menu-title'),
  contextMenuMute: document.querySelector('#context-menu-mute'),
  contextMenuVolume: document.querySelector('#context-menu-volume'),
  contextMenuVolumeValue: document.querySelector('#context-menu-volume-value'),
  contextMenuCloseStream: document.querySelector('#context-menu-close-stream'),
  contextMenuWatch: document.querySelector('#context-menu-watch'),
  contextMenuModeration: document.querySelector('#context-menu-moderation'),
  contextVoteMute: document.querySelector('#context-vote-mute'),
  contextBanSeconds: document.querySelector('#context-ban-seconds'),
  contextVoteBanTemp: document.querySelector('#context-vote-ban-temp'),
  contextVoteBanPermanent: document.querySelector('#context-vote-ban-permanent'),
  settingsAudioTab: document.querySelector('#settings-audio-tab'),
  settingsRoomTab: document.querySelector('#settings-room-tab'),
  settingsAudioPane: document.querySelector('#settings-audio-pane'),
  settingsRoomPane: document.querySelector('#settings-room-pane'),
  settingsFooter: document.querySelector('#settings-footer'),
  roomSettingsHint: document.querySelector('#room-settings-hint'),
  roomChatName: document.querySelector('#room-chat-name'),
  roomChatNameSave: document.querySelector('#room-chat-name-save'),
  roomPermissionControls: document.querySelector('#room-permission-controls'),
  roomModeratorSelect: document.querySelector('#room-moderator-select'),
  roomModeratorToggle: document.querySelector('#room-moderator-toggle'),
  roomBansRefresh: document.querySelector('#room-bans-refresh'),
  roomBansList: document.querySelector('#room-bans-list'),
  votePanel: document.querySelector('#vote-panel'),
  voteTitle: document.querySelector('#vote-title'),
  voteDetails: document.querySelector('#vote-details'),
  voteCounts: document.querySelector('#vote-counts'),
  voteTime: document.querySelector('#vote-time'),
  voteActions: document.querySelector('#vote-actions'),
  voteYes: document.querySelector('#vote-yes'),
  voteNo: document.querySelector('#vote-no')
};

let socketClient;
let peerManager;
let selfId;
let roomCode;
let hostIp = '';
let hostPort = DEFAULT_SIGNALING_PORT;
let roomRole = null;
let signalingUrl = null;
let networkInfo = null;
let currentRoom;
let muted = false;
let deafened = false;
let mutedBeforeDeafen = false;
let sharingScreen = false;
let screenVolumeLevel = 1;
let selectedScreenParticipantId = null;
let watchingScreenParticipantId = null;
let screenWatchActionInProgress = false;
let latencyTimer = null;
let lastMeasuredLatency = null;
let reconnectInProgress = false;
let capturingPttKey = false;
let pttPressed = false;
let pttInitialization = null;
let screenQuality = 'balanced';
let appUpdateState = { status: 'unavailable' };
let appUpdateDismissed = false;
let appVersion = '';
const screenAudioSourceIds = new Set();
const screenStatsByParticipant = new Map();
const screenQualityWarnings = new Set();
const speakingParticipants = new Set();
const speakingMonitors = new Map();
let speakingAudioContext = null;
let contextMenuTarget = null;
let lastMaximumScreenWarningAt = -Infinity;
let previousScreenVolumeLevel = 1;
let roomDurationTimer = null;
let roomStartedAt = null;
let presenceAudioContext = null;
let presenceReady = false;
let previousParticipants = new Map();
let chatMessages = [];
let activeVote = null;
let voteTimer = null;
let forcedMutedUntil = null;
const participantVolumeBeforeMute = new Map();
const PARTICIPANT_VOLUME_STORAGE_KEY = 'voiceroom.participantVolumes';
const DISPLAY_NAME_STORAGE_KEY = 'voiceroom.displayName';
const SCREEN_QUALITY_STORAGE_KEY = 'voiceroom.screenQuality';
const PROFILE_AVATAR_STORAGE_KEY = 'voiceroom.profileAvatar';
const THEME_STORAGE_KEY = 'voiceroom.theme';
const PROFILE_ID_STORAGE_KEY = 'voiceroom.profileId';
const MAX_PROFILE_AVATAR_LENGTH = 32_000;

const AUDIO_SETTINGS_STORAGE_KEY = 'voiceroom.audioSettings';
const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppressionMode: 'native',
  autoGainControl: true,
  processMicrophoneTest: false,
  inputGain: 1,
  pushToTalk: false,
  pushToTalkKey: 'Space',
  presenceNotifications: true
});

const AUDIO_PROCESSING_LABELS = Object.freeze({
  echoCancellation: 'cancelamento de eco',
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
    const noiseSuppressionMode = ['native', 'rnnoise', 'off'].includes(saved.noiseSuppressionMode)
      ? saved.noiseSuppressionMode
      : saved.noiseSuppression === false ? 'off' : DEFAULT_AUDIO_SETTINGS.noiseSuppressionMode;
    return {
      echoCancellation: saved.echoCancellation !== false,
      noiseSuppressionMode,
      autoGainControl: saved.autoGainControl !== false,
      processMicrophoneTest: saved.processMicrophoneTest === true,
      inputGain: clampInputGain(saved.inputGain),
      pushToTalk: saved.pushToTalk === true,
      presenceNotifications: saved.presenceNotifications !== false,
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
let profileId = '';

function loadProfileId() {
  try {
    const saved = localStorage.getItem(PROFILE_ID_STORAGE_KEY);
    if (saved && /^[a-f0-9-]{16,64}$/i.test(saved)) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(PROFILE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

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
  elements.noiseSuppressionMode.value = audioSettings.noiseSuppressionMode;
  elements.autoGainControl.checked = audioSettings.autoGainControl;
  elements.processMicrophoneTest.checked = audioSettings.processMicrophoneTest;
  elements.pushToTalk.checked = audioSettings.pushToTalk;
  elements.pushToTalkKey.textContent = formatPttKey(audioSettings.pushToTalkKey);
  if (elements.presenceNotifications) elements.presenceNotifications.checked = audioSettings.presenceNotifications;
  elements.microphoneGain.value = String(Math.round(audioSettings.inputGain * 100));
  elements.microphoneGainValue.textContent = `${Math.round(audioSettings.inputGain * 100)}%`;
}

function collectAudioSettingsFromControls() {
  return {
    echoCancellation: elements.echoCancellation.checked,
    noiseSuppressionMode: elements.noiseSuppressionMode.value,
    autoGainControl: elements.autoGainControl.checked,
    processMicrophoneTest: elements.processMicrophoneTest.checked,
    inputGain: clampInputGain(Number(elements.microphoneGain.value) / 100),
    pushToTalk: elements.pushToTalk.checked,
    pushToTalkKey: audioSettings.pushToTalkKey,
    presenceNotifications: elements.presenceNotifications?.checked !== false
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
  screenQuality = normalizeScreenProfile(value);
  if (elements.screenQuality) elements.screenQuality.value = screenQuality;
  try { localStorage.setItem(SCREEN_QUALITY_STORAGE_KEY, screenQuality); } catch { /* armazenamento opcional */ }
}

function loadLocalPreferences() {
  try {
    const savedName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    if (savedName) elements.name.value = savedName;
    const savedQuality = localStorage.getItem(SCREEN_QUALITY_STORAGE_KEY);
    if (savedQuality) screenQuality = normalizeScreenProfile(savedQuality);
  } catch { /* armazenamento opcional */ }
  setScreenQuality(screenQuality);
  renderLocalProfileNote();
}

function applyTheme(value) {
  const theme = value === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = theme;
  if (elements.themeToggle) {
    elements.themeToggle.textContent = theme === 'dark' ? '☼' : '☾';
    elements.themeToggle.title = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  }
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* armazenamento opcional */ }
}

function closeContextMenu() {
  contextMenuTarget = null;
  if (elements.contextMenu) elements.contextMenu.hidden = true;
}

function positionContextMenu(x, y) {
  const menu = elements.contextMenu;
  if (!menu) return;
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
}

function syncContextMenu() {
  if (!contextMenuTarget || !elements.contextMenu) return;
  const { kind, participantId } = contextMenuTarget;
  const participant = currentRoom?.participants.find((entry) => entry.participantId === participantId);
  const isScreen = kind === 'screen';
  const value = isScreen ? screenVolumeLevel : getParticipantVolume(participantId);
  elements.contextMenuTitle.textContent = isScreen
    ? `Transmissão de ${participant?.displayName || 'participante'}`
    : participant?.displayName || 'Participante';
  elements.contextMenuVolume.value = String(Math.round(value * 100));
  elements.contextMenuVolumeValue.textContent = `${Math.round(value * 100)}%`;
  elements.contextMenuMute.textContent = value === 0 ? 'Voltar a ouvir' : 'Silenciar para mim';
  elements.contextMenuCloseStream.hidden = !isScreen;
  const isParticipant = kind === 'participant';
  elements.contextMenuWatch.hidden = !isParticipant || !participant?.screenSharing;
  elements.contextMenuModeration.hidden = !isParticipant || participant?.role === 'host';
}

function openContextMenu(kind, participantId, x, y) {
  if (!participantId || (kind === 'participant' && participantId === selfId)) return;
  contextMenuTarget = { kind, participantId };
  syncContextMenu();
  positionContextMenu(x, y);
}

function setContextTargetVolume(percentage) {
  if (!contextMenuTarget) return;
  const normalized = Math.min(100, Math.max(0, Number(percentage))) / 100;
  if (contextMenuTarget.kind === 'screen') setScreenVolume(normalized * 100);
  else setParticipantVolume(contextMenuTarget.participantId, normalized);
  syncContextMenu();
}

function toggleContextTargetMute() {
  if (!contextMenuTarget) return;
  if (contextMenuTarget.kind === 'screen') {
    if (screenVolumeLevel > 0) {
      elements.contextMenuMute.dataset.restoreVolume = String(screenVolumeLevel);
      setScreenVolume(0);
    } else {
      setScreenVolume(Number(elements.contextMenuMute.dataset.restoreVolume || 0.75) * 100);
    }
  } else {
    const participantId = contextMenuTarget.participantId;
    const current = getParticipantVolume(participantId);
    if (current > 0) {
      participantVolumeBeforeMute.set(participantId, current);
      setParticipantVolume(participantId, 0);
    } else {
      setParticipantVolume(participantId, participantVolumeBeforeMute.get(participantId) || 0.75);
    }
  }
  syncContextMenu();
}

async function watchContextTransmission() {
  const participantId = contextMenuTarget?.participantId;
  closeContextMenu();
  if (!participantId) return;
  switchChannel('voice');
  await toggleScreenWatching(participantId);
}

async function startContextVote(action, durationSeconds = 0) {
  const participantId = contextMenuTarget?.participantId;
  closeContextMenu();
  if (!participantId) return;
  const response = await socketClient?.startVote(participantId, action, durationSeconds);
  if (!response?.ok) showNotice(responseError(response), 'warning');
}

function renderLocalProfileNote() {
  if (!elements.profileLocalNote) return;
  elements.profileLocalNote.textContent = elements.name.value.trim()
    ? 'Perfil local salvo neste computador. Você não precisará digitar o nome de novo.'
    : 'Seu perfil ficará salvo somente neste computador.';
}

function renderAudioProcessingStatus(settings = {}) {
  if (!peerManager?.getAudioTrack()) {
    elements.audioProcessingStatus.textContent = 'Será aplicado quando o microfone for ativado.';
    elements.audioProcessingStatus.dataset.type = 'info';
    return;
  }
  const selectedMode = audioSettings.noiseSuppressionMode;
  const activeMode = peerManager.getNoiseSuppressionMode?.() || selectedMode;
  if (selectedMode === 'rnnoise' && activeMode === 'rnnoise') {
    elements.audioProcessingStatus.textContent = 'RNNoise aplicado localmente ao áudio enviado (pode usar mais CPU).';
    elements.audioProcessingStatus.dataset.type = 'success';
    return;
  }
  if (selectedMode === 'rnnoise') {
    elements.audioProcessingStatus.textContent = 'RNNoise indisponível; o modo nativo está sendo usado.';
    elements.audioProcessingStatus.dataset.type = 'warning';
    return;
  }
  const unsupported = Object.entries(AUDIO_PROCESSING_LABELS)
    .filter(([key]) => settings[key] !== undefined && settings[key] !== audioSettings[key])
    .map(([, label]) => label);
  const expectedNativeNoiseSuppression = selectedMode === 'native';
  if (settings.noiseSuppression !== undefined && settings.noiseSuppression !== expectedNativeNoiseSuppression) {
    unsupported.push('supressão de ruído');
  }
  elements.audioProcessingStatus.textContent = unsupported.length
    ? `O dispositivo não confirmou: ${unsupported.join(', ')}.`
    : selectedMode === 'off'
      ? 'Supressão de ruído desativada; cancelamento de eco e ganho seguem as opções acima.'
      : 'Processamento nativo aplicado ao áudio enviado.';
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
      : error.code === 'RNNOISE_UNAVAILABLE'
        ? 'RNNoise não pôde iniciar neste sistema; o modo nativo foi mantido.'
        : 'Não foi possível alterar o processamento do microfone.';
    showNotice(message);
    renderAudioProcessingStatus(peerManager?.getAudioProcessingSettings() || {});
  }
}

function openAudioSettings() {
  if (!elements.audioSettingsModal) return;
  renderRoomSettings();
  switchSettingsPane('audio');
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
  } catch (error) {
    elements.testMicrophone.textContent = 'Ouvir microfone';
    elements.microphoneTestStatus.textContent = 'Não foi possível acessar o microfone.';
    if (error.code === 'RNNOISE_UNAVAILABLE') {
      elements.microphoneTestStatus.textContent = 'RNNoise não está disponível neste sistema.';
    }
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

function getRecommendedScreenQuality() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const downlink = Number(connection?.downlink);
  const hasDownlink = Number.isFinite(downlink) && downlink > 0;
  const latency = Number(lastMeasuredLatency);
  const hasLatency = Number.isFinite(latency);
  let profile = 'balanced';
  if ((hasDownlink && downlink < 3) || (hasLatency && latency > 220)) profile = 'economic';
  else if (hasDownlink && downlink >= 25 && (!hasLatency || latency <= 45)) profile = 'maximum';
  else if (hasDownlink && downlink >= 10 && (!hasLatency || latency <= 90)) profile = 'fluid';
  else if (hasDownlink && downlink >= 7 && (!hasLatency || latency <= 120)) profile = 'sharp';
  const details = [
    hasDownlink ? `${downlink.toFixed(downlink >= 10 ? 0 : 1)} Mbps` : null,
    hasLatency ? `${Math.round(latency)} ms` : null
  ].filter(Boolean).join(' · ');
  return { profile, details };
}

function syncScreenQualityRecommendation({ select = false } = {}) {
  if (!elements.screenQualityRecommendation || !elements.screenQuality) return;
  const recommendation = getRecommendedScreenQuality();
  const label = elements.screenQuality.querySelector(`option[value="${recommendation.profile}"]`)?.textContent || recommendation.profile;
  elements.screenQualityRecommendation.textContent = `Recomendado para sua conexão: ${label}${recommendation.details ? ` · ${recommendation.details}` : ''}`;
  if (select) elements.screenQuality.value = recommendation.profile;
}

async function updateLatency() {
  if (!roomCode || !socketClient) return;
  const mediaLatency = await peerManager?.getLatency?.();
  const latency = Number.isFinite(mediaLatency) ? mediaLatency : await socketClient.measureLatency();
  lastMeasuredLatency = Number.isFinite(latency) ? latency : null;
  updateLatencyLabel(latency);
  syncScreenQualityRecommendation();
  if (Number.isFinite(latency)) socketClient.setLatency(latency).catch(() => {});
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

function showNotice(message, type = 'error', duration = 6_000) {
  elements.notice.textContent = message;
  elements.notice.dataset.type = type;
  elements.notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { elements.notice.hidden = true; }, duration);
}

function canManageCurrentRoom() {
  const self = currentRoom?.participants?.find((participant) => participant.participantId === selfId);
  return Boolean(self && (self.role === 'host' || currentRoom?.moderatorParticipantIds?.includes(selfId)));
}

function switchSettingsPane(pane) {
  const room = pane === 'room';
  elements.settingsAudioPane.hidden = room;
  elements.settingsRoomPane.hidden = !room;
  elements.settingsFooter.hidden = room;
  elements.settingsAudioTab.classList.toggle('is-active', !room);
  elements.settingsRoomTab.classList.toggle('is-active', room);
  if (room) loadRoomBans();
}

function renderRoomSettings() {
  if (!elements.roomChatName || !currentRoom) return;
  const manageable = canManageCurrentRoom();
  const self = currentRoom.participants.find((participant) => participant.participantId === selfId);
  elements.roomChatName.value = currentRoom.chatName || 'Chat da sala';
  elements.roomChatName.disabled = !manageable;
  elements.roomChatNameSave.disabled = !manageable;
  elements.roomSettingsHint.textContent = manageable
    ? 'Você pode alterar a sala. Mudanças são sincronizadas para todos.'
    : 'Somente o host ou um moderador autorizado pode alterar a sala.';
  elements.roomPermissionControls.hidden = self?.role !== 'host';
  elements.roomBansRefresh.disabled = !manageable;
  elements.roomModeratorSelect.replaceChildren();
  for (const participant of currentRoom.participants.filter((item) => item.role !== 'host')) {
    const option = document.createElement('option');
    option.value = participant.participantId;
    const moderator = currentRoom.moderatorParticipantIds?.includes(participant.participantId);
    option.textContent = `${participant.displayName}${moderator ? ' · autorizado' : ''}`;
    elements.roomModeratorSelect.append(option);
  }
  syncModeratorButton();
}

function syncModeratorButton() {
  const participantId = elements.roomModeratorSelect?.value;
  const allowed = currentRoom?.moderatorParticipantIds?.includes(participantId);
  elements.roomModeratorToggle.textContent = allowed ? 'Remover permissão' : 'Conceder permissão';
  elements.roomModeratorToggle.disabled = !participantId;
}

async function loadRoomBans() {
  if (!canManageCurrentRoom()) {
    elements.roomBansList.innerHTML = '<span class="small muted">Sem permissão para consultar bans.</span>';
    return;
  }
  const response = await socketClient?.listBans();
  if (!response?.ok) return;
  renderRoomBans(response.data.bans);
}

function renderRoomBans(bans = []) {
  elements.roomBansList.replaceChildren();
  if (!bans.length) {
    const empty = document.createElement('span');
    empty.className = 'small muted';
    empty.textContent = 'Nenhum ban ativo.';
    elements.roomBansList.append(empty);
    return;
  }
  for (const ban of bans) {
    const row = document.createElement('div');
    row.className = 'room-ban-row';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = ban.displayName || 'Perfil';
    const expiry = document.createElement('span');
    expiry.textContent = ban.expiresAt ? `Até ${new Date(ban.expiresAt).toLocaleString('pt-BR')}` : 'Permanente';
    copy.append(name, expiry);
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'ghost compact-button';
    revoke.textContent = 'Remover';
    revoke.addEventListener('click', async () => {
      const response = await socketClient.revokeBan(ban.id);
      if (response?.ok) renderRoomBans(response.data.bans);
      else showNotice(responseError(response));
    });
    row.append(copy, revoke);
    elements.roomBansList.append(row);
  }
}

function renderVote(vote) {
  activeVote = vote;
  window.clearInterval(voteTimer);
  if (!vote || vote.status !== 'active') {
    if (vote) showPresenceToast(vote.status === 'passed' ? 'A votação foi aprovada.' : 'A votação foi encerrada sem aprovação.', vote.status === 'passed' ? 'join' : 'leave');
    elements.votePanel.hidden = true;
    voteTimer = null;
    return;
  }
  const action = vote.action === 'mute'
    ? 'mutar por 30 segundos'
    : vote.durationSeconds ? `banir por ${vote.durationSeconds} segundos` : 'banir permanentemente';
  elements.voteTitle.textContent = `Votação sobre ${vote.targetDisplayName}`;
  elements.voteDetails.textContent = `Proposta: ${action}.`;
  elements.voteCounts.textContent = `${vote.yes} sim · ${vote.no} não · ${vote.threshold} necessários`;
  elements.voteActions.hidden = false;
  elements.votePanel.hidden = false;
  const updateTime = () => {
    const seconds = Math.max(0, Math.ceil((vote.endsAt - Date.now()) / 1_000));
    elements.voteTime.textContent = `${seconds}s`;
  };
  updateTime();
  voteTimer = window.setInterval(updateTime, 250);
}

function playPresenceTone(kind = 'join') {
  if (!audioSettings.presenceNotifications) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    presenceAudioContext ||= new AudioContextClass({ latencyHint: 'interactive' });
    presenceAudioContext.resume().catch(() => {});
    const oscillator = presenceAudioContext.createOscillator();
    const gain = presenceAudioContext.createGain();
    const now = presenceAudioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'join' ? 520 : 700, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'join' ? 760 : 430, now + .16);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.09, now + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .2);
    oscillator.connect(gain).connect(presenceAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + .21);
  } catch { /* aviso visual continua disponível */ }
}

function showPresenceToast(message, kind = 'join') {
  if (!audioSettings.presenceNotifications || !elements.presenceToasts) return;
  playPresenceTone(kind);
  const toast = document.createElement('div');
  toast.className = 'presence-toast';
  toast.dataset.kind = kind;
  toast.textContent = message;
  elements.presenceToasts.append(toast);
  window.setTimeout(() => toast.remove(), 5_000);
}

function announceRoomChanges(room) {
  const next = new Map((room?.participants || []).map((participant) => [participant.participantId, participant]));
  if (presenceReady) {
    for (const [id, participant] of next) {
      if (id !== selfId && participant.connected && !previousParticipants.get(id)?.connected) {
        showPresenceToast(`${participant.displayName} entrou na sala.`, 'join');
      }
    }
    for (const [id, participant] of previousParticipants) {
      if (id !== selfId && participant.connected && !next.get(id)?.connected) {
        showPresenceToast(`${participant.displayName} saiu da sala.`, 'leave');
      }
    }
  }
  previousParticipants = next;
  presenceReady = true;
}

function updateRoomDuration() {
  if (!elements.roomDuration || !roomStartedAt) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - roomStartedAt) / 1_000));
  const hours = Math.floor(elapsed / 3_600);
  const minutes = Math.floor((elapsed % 3_600) / 60);
  const seconds = elapsed % 60;
  elements.roomDuration.textContent = hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startRoomDuration(createdAt) {
  roomStartedAt = Number(createdAt) || Date.now();
  window.clearInterval(roomDurationTimer);
  updateRoomDuration();
  roomDurationTimer = window.setInterval(updateRoomDuration, 1_000);
}

function fitScreenStage() {
  if (!elements.screenStage || !elements.stageArea) return;
  if (document.body.classList.contains('screen-view-expanded') || elements.screenStage.dataset.active !== 'true') {
    elements.screenStage.style.width = '100%';
    elements.screenStage.style.height = '100%';
    return;
  }
  const video = elements.screenStage.querySelector('[data-participant-video]');
  const ratio = video?.videoWidth > 0 && video?.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
  const area = elements.stageArea.getBoundingClientRect();
  if (!area.width || !area.height) return;
  let width = area.width;
  let height = width / ratio;
  if (height > area.height) {
    height = area.height;
    width = height * ratio;
  }
  elements.screenStage.style.width = `${Math.floor(width)}px`;
  elements.screenStage.style.height = `${Math.floor(height)}px`;
}

function renderPlayerOnline() {
  if (!elements.playerOnline) return;
  elements.playerOnline.replaceChildren();
  for (const participant of (currentRoom?.participants || []).filter((item) => item.connected).slice(0, 10)) {
    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.title = participant.displayName;
    renderAvatarElement(avatar, normalizeAvatarData(participant.avatar), getAvatarInitials(participant.displayName));
    elements.playerOnline.append(avatar);
  }
}

function switchChannel(channel) {
  const text = channel === 'text';
  elements.voiceView.hidden = text;
  elements.textView.hidden = !text;
  elements.voiceChannel.classList.toggle('is-active', !text);
  elements.textChannel.classList.toggle('is-active', text);
  if (text) elements.chatInput?.focus();
  else window.requestAnimationFrame(fitScreenStage);
}

function renderChatMessage(message) {
  if (!message || document.querySelector(`[data-chat-message="${message.id}"]`)) return;
  elements.chatEmpty?.remove();
  const article = document.createElement('article');
  article.className = 'chat-message';
  article.dataset.chatMessage = message.id;
  const avatar = document.createElement('span');
  avatar.className = 'chat-message-avatar';
  renderAvatarElement(avatar, normalizeAvatarData(message.author?.avatar), getAvatarInitials(message.author?.displayName || 'V'));
  const body = document.createElement('div');
  body.className = 'chat-message-body';
  const meta = document.createElement('div');
  meta.className = 'chat-message-meta';
  const author = document.createElement('strong');
  author.textContent = message.author?.displayName || 'Participante';
  const time = document.createElement('time');
  time.textContent = new Date(message.sentAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  meta.append(author, time);
  if (message.kind === 'image') {
    const image = document.createElement('img');
    image.className = 'chat-message-image';
    image.src = message.content;
    image.alt = `Imagem enviada por ${author.textContent}`;
    body.append(meta, image);
  } else {
    const content = document.createElement('p');
    content.className = 'chat-message-content';
    content.textContent = message.content;
    body.append(meta, content);
  }
  article.append(avatar, body);
  elements.chatMessages.append(article);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function loadChatHistory(messages = []) {
  chatMessages = Array.isArray(messages) ? messages : [];
  elements.chatMessages.querySelectorAll('.chat-message').forEach((message) => message.remove());
  for (const message of chatMessages) renderChatMessage(message);
}

async function sendChat(kind, content) {
  const response = await socketClient?.sendChatMessage(kind, content);
  if (!response?.ok) showNotice(responseError(response));
}

async function sendChatImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 360_000) {
    showNotice('Use uma imagem PNG, JPG ou WebP de até 350 KB.', 'warning');
    return;
  }
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
  await sendChat('image', content);
}

function warnMaximumScreenQuality() {
  const now = Date.now();
  if (now - lastMaximumScreenWarningAt < 4_500) return;
  lastMaximumScreenWarningAt = now;
  showNotice(
    '1080p a 60 fps é um modo muito pesado. Pode aumentar o uso de CPU e afetar a qualidade da sua conexão.',
    'warning',
    5_000
  );
}

function formatUpdateBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function renderAppUpdateSettings() {
  const state = appUpdateState || {};
  const status = state.status;
  if (elements.appVersionLabel) elements.appVersionLabel.textContent = appVersion ? `Versão ${appVersion}` : 'Versão —';
  if (!elements.appUpdateSettingsStatus || !elements.appUpdateCheck) return;

  let message = 'Verifique se há uma nova versão.';
  if (status === 'checking') message = 'Verificando atualizações…';
  else if (status === 'available') message = `Nova versão ${state.version ? `v${state.version} ` : ''}encontrada; download iniciado.`;
  else if (status === 'downloading') {
    const percent = Number.isFinite(Number(state.percent)) ? Math.round(state.percent) : 0;
    message = `Baixando atualização… ${percent}%`;
  } else if (status === 'downloaded') message = `Atualização ${state.version ? `v${state.version} ` : ''}pronta para instalar.`;
  else if (status === 'idle') message = 'Você está usando a versão mais recente.';
  else if (status === 'error' && state.manual) message = state.message || 'Não foi possível verificar agora.';
  else if (status === 'unavailable') message = 'Disponível apenas na versão instalada.';

  elements.appUpdateSettingsStatus.textContent = message;
  elements.appUpdateSettingsStatus.dataset.type = status === 'error' ? 'warning' : status === 'downloaded' ? 'success' : 'info';
  elements.appUpdateCheck.disabled = ['checking', 'available', 'downloading'].includes(status);
  elements.appUpdateCheck.textContent = status === 'downloaded'
    ? 'Instalar atualização'
    : status === 'checking' ? 'Verificando…' : 'Verificar atualizações';
}

function renderAppUpdate() {
  const state = appUpdateState || {};
  const status = state.status;
  const visible = ['available', 'downloading', 'downloaded'].includes(status)
    || (status === 'error' && state.manual === true);
  if (!elements.appUpdate) return;
  if (!visible || appUpdateDismissed) {
    elements.appUpdate.hidden = true;
    return;
  }

  const version = state.version ? ` v${state.version}` : '';
  if (status === 'available') {
    elements.appUpdateTitle.textContent = `Atualização${version} encontrada`;
    elements.appUpdateMessage.textContent = 'Download automático iniciado em segundo plano.';
  } else if (status === 'downloading') {
    const percent = Number.isFinite(Number(state.percent)) ? Math.round(state.percent) : 0;
    const transferred = formatUpdateBytes(state.transferred);
    const total = formatUpdateBytes(state.total);
    const size = transferred && total ? ` · ${transferred}/${total}` : '';
    elements.appUpdateTitle.textContent = `Baixando atualização${version}`;
    elements.appUpdateMessage.textContent = `${percent}%${size}`;
  } else if (status === 'downloaded') {
    elements.appUpdateTitle.textContent = `Atualização${version} pronta`;
    elements.appUpdateMessage.textContent = 'Será instalada ao fechar o VoiceRoom; você também pode instalar agora.';
  } else {
    elements.appUpdateTitle.textContent = 'Atualizações indisponíveis';
    elements.appUpdateMessage.textContent = state.message || 'Não foi possível verificar agora.';
  }
  elements.appUpdateInstall.hidden = status !== 'downloaded';
  elements.appUpdateDismiss.hidden = status === 'downloaded';
  elements.appUpdate.hidden = false;
}

function handleAppUpdateState(state) {
  if (!state || typeof state !== 'object') return;
  appUpdateState = state;
  if (state.status === 'downloaded') appUpdateDismissed = false;
  renderAppUpdate();
  renderAppUpdateSettings();
}

async function installApplicationUpdate() {
  if (elements.appUpdateInstall) {
    elements.appUpdateInstall.disabled = true;
    elements.appUpdateInstall.textContent = 'Reiniciando…';
  }
  if (elements.appUpdateCheck) elements.appUpdateCheck.disabled = true;
  try {
    const started = await window.voiceRoom?.installUpdate?.();
    if (!started) {
      if (elements.appUpdateInstall) {
        elements.appUpdateInstall.disabled = false;
        elements.appUpdateInstall.textContent = 'Instalar agora';
      }
      renderAppUpdateSettings();
    }
  } catch {
    if (elements.appUpdateInstall) {
      elements.appUpdateInstall.disabled = false;
      elements.appUpdateInstall.textContent = 'Instalar agora';
    }
    renderAppUpdateSettings();
    showNotice('Não foi possível iniciar a instalação da atualização.');
  }
}

function responseError(response) {
  if (response?.errorCode === 'ROOM_NOT_FOUND') return 'Esta sala não existe.';
  if (response?.errorCode === 'ROOM_EXISTS') return 'Já existe uma sala ativa neste computador.';
  if (response?.errorCode === 'ROOM_FULL') return 'A sala atingiu o limite de 10 participantes.';
  if (response?.errorCode === 'PERMISSION_DENIED') return 'Você não tem permissão para fazer isso.';
  if (response?.errorCode === 'BANNED') return 'Este perfil está banido desta sala.';
  if (response?.errorCode === 'ALREADY_VOTED') return 'Você já votou ou já existe uma votação ativa.';
  if (response?.errorCode === 'VOTE_NOT_FOUND') return 'Essa votação já terminou.';
  if (response?.errorCode === 'SCREEN_BUSY') return 'A sala já atingiu o limite de 2 transmissões.';
  if (response?.errorCode === 'SCREEN_NOT_ACTIVE') return 'Essa transmissão não está ativa.';
  if (response?.errorCode === 'PORT_IN_USE') return response.message || `A porta ${DEFAULT_SIGNALING_PORT} já está sendo utilizada por outro aplicativo.`;
  if (response?.errorCode === 'INVALID_HOST_IP') return 'O endereço IP informado não é válido.';
  if (response?.errorCode === 'HOST_NOT_FOUND' || response?.errorCode === 'CONNECTION_TIMEOUT') {
    return 'Não foi possível localizar uma sala nesse endereço.';
  }
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
      : participant.muted ? '⊘' : participant.connected ? '●' : '○';
    const stateElement = document.createElement('span');
    stateElement.className = 'participant-state';
    stateElement.setAttribute('aria-hidden', 'true');
    renderAvatarElement(stateElement, normalizeAvatarData(participant.avatar), getAvatarInitials(participant.displayName));
    const nameElement = document.createElement('span');
    nameElement.className = 'participant-name';
    nameElement.textContent = participant.displayName;
    if (participant.role === 'host') {
      const crown = document.createElement('span');
      crown.className = 'host-crown';
      crown.title = 'Criador da sala';
      crown.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6L4 8Z"/></svg>';
      nameElement.append(crown);
    }
    const identity = document.createElement('button');
    identity.className = 'participant-identity';
    identity.type = 'button';
    identity.title = participant.participantId === selfId && !sharingScreen
      ? 'Clique para compartilhar sua tela'
      : `Ajustar ${participant.displayName}`;
    identity.addEventListener('click', (event) => {
      event.stopPropagation();
      if (participant.participantId === selfId && !sharingScreen) {
        toggleScreen();
        return;
      }
      if (participant.participantId !== selfId) {
        const rect = identity.getBoundingClientRect();
        openContextMenu('participant', participant.participantId, rect.left, rect.bottom + 6);
      }
    });
    identity.append(stateElement, nameElement);
    const latencyElement = document.createElement('span');
    latencyElement.className = 'participant-latency';
    latencyElement.textContent = Number.isFinite(participant.latencyMs) ? `${participant.latencyMs} ms` : '— ms';
    latencyElement.title = 'Latência até o host';
    const statusElement = document.createElement('span');
    statusElement.className = 'participant-status';
    statusElement.setAttribute('aria-hidden', 'true');
    statusElement.textContent = state;
    if (participant.screenSharing) {
      const live = document.createElement('i');
      live.className = 'participant-live';
      live.title = 'Transmitindo ao vivo';
      nameElement.append(live);
    }
    item.append(identity, latencyElement, statusElement);
    if (participant.participantId !== selfId && participant.connected) {
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openContextMenu('participant', participant.participantId, event.clientX, event.clientY);
      });
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

function applyDeafenState() {
  document.querySelectorAll('audio[data-participant-audio]').forEach((audio) => {
    const isScreenAudio = audio.dataset.screenAudio === 'true';
    audio.muted = deafened || (isScreenAudio && screenVolumeLevel === 0);
  });
}

function renderVoiceControls() {
  const hasMicrophone = Boolean(peerManager?.getAudioTrack?.());
  const microphoneMuted = muted || deafened || !hasMicrophone;
  const microphoneControl = elements.voiceMicrophone;
  if (microphoneControl) {
    microphoneControl.classList.toggle('is-muted', microphoneMuted);
    microphoneControl.dataset.state = microphoneMuted ? 'muted' : 'active';
    microphoneControl.setAttribute('aria-pressed', String(!microphoneMuted));
    microphoneControl.title = deafened
      ? 'Desative o ensurdecer para ativar o microfone'
      : microphoneMuted ? 'Ativar microfone' : 'Mutar microfone';
    microphoneControl.setAttribute('aria-label', microphoneControl.title);
    const forced = forcedMutedUntil && forcedMutedUntil > Date.now();
    microphoneControl.disabled = Boolean(forced);
    if (forced) microphoneControl.title = `Mutado por votação até ${new Date(forcedMutedUntil).toLocaleTimeString('pt-BR')}`;
  }

  const deafenControl = elements.voiceDeafen;
  if (deafenControl) {
    deafenControl.classList.toggle('is-muted', deafened);
    deafenControl.dataset.state = deafened ? 'muted' : 'active';
    deafenControl.setAttribute('aria-pressed', String(deafened));
    deafenControl.title = deafened ? 'Ouvir chamada' : 'Ensurdecer chamada';
    deafenControl.setAttribute('aria-label', deafenControl.title);
  }
}

function renderRoom(room) {
  announceRoomChanges(room);
  currentRoom = room;
  if (elements.activeIp) elements.activeIp.textContent = hostIp ? `${hostIp}:${hostPort}` : '—';
  const screenParticipantIds = getScreenParticipantIds(room);
  const hasAnyScreen = screenParticipantIds.length > 0 || sharingScreen;
  elements.voiceChannel.hidden = !hasAnyScreen;
  if (!hasAnyScreen && !elements.voiceView.hidden) switchChannel('text');
  const chatName = room.chatName || 'Chat da sala';
  elements.textChannelName.textContent = chatName;
  elements.chatTitle.textContent = chatName;
  elements.screen.disabled = !sharingScreen && screenParticipantIds.length >= 2;
  elements.screen.dataset.sharing = String(sharingScreen);
  elements.screen.title = sharingScreen ? 'Parar transmissão' : 'Compartilhar tela';
  elements.screen.setAttribute('aria-label', elements.screen.title);
  if (elements.screenShareLabel) {
    elements.screenShareLabel.textContent = sharingScreen ? 'Parar tela' : 'Compartilhar tela';
  } else {
    elements.screen.textContent = sharingScreen ? 'Parar tela' : 'Compartilhar tela';
  }
  if (watchingScreenParticipantId && !screenParticipantIds.includes(watchingScreenParticipantId)) {
    const stoppedParticipantId = watchingScreenParticipantId;
    watchingScreenParticipantId = null;
    removeScreenStream(stoppedParticipantId);
  }
  renderScreenShareList(room);
  renderParticipants();
  renderPlayerOnline();
  renderRoomSettings();
  peerManager?.syncParticipants(room.participants).catch((error) => showNotice(error.message));
  renderVoiceControls();
  window.requestAnimationFrame(fitScreenStage);
}

function renderScreenShareList(room) {
  elements.screenShareList.replaceChildren();
  const activeParticipants = (room?.participants || []).filter((participant) => (
    participant.screenSharing || (participant.participantId === selfId && sharingScreen)
  ));
  elements.screenGallery.replaceChildren();
  elements.streamSwitcher.replaceChildren();
  const hasVisibleTile = Boolean(elements.screenStage.querySelector('[data-screen-tile]'));
  elements.screenGallery.hidden = hasVisibleTile || activeParticipants.length === 0;
  elements.screenEmptyStage.hidden = activeParticipants.length > 0;
  for (const participant of activeParticipants) {
    const switchButton = document.createElement('button');
    switchButton.type = 'button';
    switchButton.className = 'stream-switch-button';
    switchButton.classList.toggle('is-active', participant.participantId === selectedScreenParticipantId || participant.participantId === watchingScreenParticipantId);
    switchButton.title = `Assistir ${participant.displayName}`;
    renderAvatarElement(switchButton, normalizeAvatarData(participant.avatar), getAvatarInitials(participant.displayName));
    switchButton.addEventListener('click', () => {
      if (participant.participantId === selfId) {
        if (peerManager?.screenStream) viewOwnScreen();
        else selectScreenParticipant(selfId);
      } else toggleScreenWatching(participant.participantId);
    });
    elements.streamSwitcher.append(switchButton);
    if (!hasVisibleTile) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'screen-gallery-card';
      const avatar = document.createElement('span');
      avatar.className = 'screen-gallery-avatar';
      renderAvatarElement(avatar, normalizeAvatarData(participant.avatar), getAvatarInitials(participant.displayName));
      const name = document.createElement('strong');
      name.textContent = participant.displayName;
      const action = document.createElement('span');
      action.textContent = participant.participantId === selfId ? 'Sua transmissão' : 'Clique para assistir';
      card.append(avatar, name, action);
      card.addEventListener('click', () => {
        if (participant.participantId === selfId && peerManager?.screenStream) viewOwnScreen();
        else if (participant.participantId !== selfId) toggleScreenWatching(participant.participantId);
      });
      elements.screenGallery.append(card);
    }
  }
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

function formatScreenBitrate(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const bitrate = Number(value);
  return bitrate >= 1_000_000
    ? `${(bitrate / 1_000_000).toFixed(2)} Mbps`
    : `${Math.round(bitrate / 1_000)} kbps`;
}

function formatScreenLoss(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatScreenDecision(value) {
  return {
    initial: 'aguardando amostras',
    good: 'estável',
    bad: 'rede instável',
    unknown: 'medindo',
    'network-degraded': 'reduzida para estabilidade',
    'network-stable': 'subida após estabilidade',
    'profile-selected': 'perfil selecionado'
  }[value] || value || '—';
}

function appendDiagnosticMetric(container, label, value) {
  const metric = document.createElement('span');
  metric.className = 'screen-diagnostic-metric';
  metric.textContent = `${label}: ${value}`;
  container.append(metric);
}

function renderScreenDiagnostics() {
  if (!elements.screenDiagnosticsList) return;
  elements.screenDiagnosticsList.replaceChildren();
  if (!screenStatsByParticipant.size) {
    const empty = document.createElement('span');
    empty.className = 'small muted';
    empty.textContent = 'As métricas aparecem para quem está enviando uma transmissão.';
    elements.screenDiagnosticsList.append(empty);
    return;
  }
  for (const [participantId, stats] of screenStatsByParticipant) {
    const participant = currentRoom?.participants?.find((item) => item.participantId === participantId);
    const row = document.createElement('article');
    row.className = 'screen-diagnostics-row';
    const heading = document.createElement('strong');
    heading.textContent = participant?.displayName || participantId.slice(0, 8);
    row.append(heading);
    const metrics = document.createElement('div');
    metrics.className = 'screen-diagnostics-metrics';
    const profile = getScreenProfile(stats.effectiveProfile || stats.desiredProfile);
    appendDiagnosticMetric(metrics, 'perfil', profile.label);
    appendDiagnosticMetric(metrics, 'resolução', stats.width && stats.height ? `${stats.width}×${stats.height}` : '—');
    appendDiagnosticMetric(metrics, 'FPS', Number.isFinite(Number(stats.framesPerSecond))
      ? Number(stats.framesPerSecond).toFixed(1)
      : '—');
    appendDiagnosticMetric(metrics, 'bitrate', formatScreenBitrate(stats.bitrate));
    appendDiagnosticMetric(metrics, 'RTT', Number.isFinite(Number(stats.rttMs)) ? `${Math.round(stats.rttMs)} ms` : '—');
    appendDiagnosticMetric(metrics, 'perda', formatScreenLoss(stats.lossFraction));
    appendDiagnosticMetric(metrics, 'codec', stats.codec || '—');
    appendDiagnosticMetric(metrics, 'estado', formatScreenDecision(stats.lastDecision || stats.reason));
    row.append(metrics);
    elements.screenDiagnosticsList.append(row);
  }
}

function handleScreenStats(participantId, stats = {}) {
  if (!participantId) return;
  if (stats.type === 'screen-quality-warning') {
    const warningKey = `${participantId}:${stats.code}`;
    if (screenQualityWarnings.has(warningKey)) return;
    screenQualityWarnings.add(warningKey);
    showNotice(stats.message || 'Alguns ajustes de qualidade não foram aceitos pelo sistema.', 'warning');
    return;
  }
  screenStatsByParticipant.set(participantId, stats);
  renderScreenDiagnostics();
}

function setScreenDiagnosticsVisible(visible) {
  const nextVisible = Boolean(visible);
  if (elements.screenDiagnostics) elements.screenDiagnostics.hidden = !nextVisible;
  if (elements.screenDiagnosticsToggle) {
    elements.screenDiagnosticsToggle.setAttribute('aria-expanded', String(nextVisible));
    elements.screenDiagnosticsToggle.textContent = nextVisible ? 'Ocultar detalhes' : 'Detalhes';
  }
}

function enterRoom(result) {
  selfId = result.data.participantId;
  roomCode = result.data.room.code || LOCAL_ROOM_CODE;
  roomRole = result.data.role || result.data.room.participants.find((participant) => participant.participantId === selfId)?.role || 'guest';
  presenceReady = false;
  previousParticipants = new Map();
  elements.landing.hidden = true;
  elements.room.hidden = false;
  if (elements.copyInvite) elements.copyInvite.hidden = roomRole !== 'host';
  if (elements.leave) elements.leave.textContent = roomRole === 'host' ? 'Encerrar sala' : 'Sair da sala';
  setStatus(roomRole === 'host' ? 'Sala local pronta. Envie o IP aos seus amigos.' : 'Sala conectada. Ative o microfone quando quiser.', 'success');
  renderRoom(result.data.room);
  startRoomDuration(result.data.room.createdAt);
  loadChatHistory(result.data.chatHistory);
  switchChannel(getScreenParticipantIds(result.data.room).length ? 'voice' : 'text');
  peerManager = new PeerManager({
    socket: socketClient,
    selfId,
    onRemoteStream: attachRemoteStream,
    onScreenStats: handleScreenStats,
    onPeerState: (participantId, state) => {
      if (['closed', 'failed'].includes(state)) {
        screenStatsByParticipant.delete(participantId);
        renderScreenDiagnostics();
        removeParticipantMedia(participantId);
      }
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
  renderVoiceControls();
  peerManager.syncParticipants(currentRoom?.participants || result.data.room.participants).catch((error) => showNotice(error.message));
  startLatencyMonitoring();
}

function renderScreenStream(participantId, stream, { muted = false } = {}) {
  // A viewer can keep only one screen on the stage. A new stream replaces the
  // previous tile, which also covers switching between two active presenters.
  elements.screenStage.style.removeProperty('--screen-aspect-ratio');
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
    tile.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      selectScreenParticipant(participantId);
      openContextMenu('screen', participantId, event.clientX, event.clientY);
    });
    tile.addEventListener('wheel', (event) => {
      event.preventDefault();
      const currentZoom = Number(tile.dataset.zoom || 1);
      const nextZoom = Math.min(3, Math.max(1, currentZoom + (event.deltaY < 0 ? 0.15 : -0.15)));
      const videoElement = tile.querySelector('[data-participant-video]');
      if (!videoElement) return;
      const rect = tile.getBoundingClientRect();
      const originX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
      const originY = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
      tile.dataset.zoom = String(nextZoom);
      videoElement.style.transformOrigin = `${originX}% ${originY}%`;
      videoElement.style.transform = `scale(${nextZoom})`;
      let zoomLabel = tile.querySelector('.screen-zoom-label');
      if (!zoomLabel) {
        zoomLabel = document.createElement('span');
        zoomLabel.className = 'screen-zoom-label';
        tile.append(zoomLabel);
      }
      zoomLabel.textContent = `${Math.round(nextZoom * 100)}%`;
      zoomLabel.hidden = false;
      window.clearTimeout(tile.zoomLabelTimeout);
      tile.zoomLabelTimeout = window.setTimeout(() => { zoomLabel.hidden = true; }, 900);
    }, { passive: false });
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
  video.style.transform = `scale(${Number(tile.dataset.zoom || 1)})`;
  const resumeVideo = () => video.play().catch(() => {});
  const updateScreenAspect = () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width > 0 && height > 0) {
      elements.screenStage.style.setProperty('--screen-aspect-ratio', `${width} / ${height}`);
      fitScreenStage();
    }
    resumeVideo();
  };
  video.onloadedmetadata = updateScreenAspect;
  video.onresize = updateScreenAspect;
  video.oncanplay = resumeVideo;
  updateScreenAspect();
  elements.screenStage.dataset.active = 'true';
  window.requestAnimationFrame(fitScreenStage);
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
      audio.muted = deafened || screenVolumeLevel === 0;
      updateScreenVolume();
    } else {
      audio.volume = getParticipantVolume(participantId);
      audio.muted = deafened;
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
  const hasAvailableScreens = getScreenParticipantIds(currentRoom).length > 0 || sharingScreen;
  if (!hasTiles && document.body.classList.contains('screen-view-expanded')) setScreenViewExpanded(false);
  if (!hasTiles) elements.screenStage.style.removeProperty('--screen-aspect-ratio');
  elements.screenStage.dataset.active = String(hasTiles);
  window.requestAnimationFrame(fitScreenStage);
  elements.screenEmptyStage.hidden = hasTiles || hasAvailableScreens;
  if (elements.screenGallery) elements.screenGallery.hidden = hasTiles || !hasAvailableScreens;
  elements.screenFullscreen.disabled = !hasTiles;
  elements.screenVolume.disabled = screenAudioSourceIds.size === 0;
  elements.screenAudioStatus.textContent = hasTiles
    ? `${tiles.length} transmissão${tiles.length === 1 ? '' : 'ões'} em exibição${screenAudioSourceIds.size ? ' com áudio' : ''}`
    : 'Áudio da tela: desativado';
  if (elements.screenDiagnosticsToggle) {
    elements.screenDiagnosticsToggle.hidden = !hasTiles;
    if (!hasTiles) setScreenDiagnosticsVisible(false);
  }
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
  screenStatsByParticipant.delete(participantId);
  renderScreenDiagnostics();
  updateScreenStageControls();
}

function setScreenViewExpanded(expanded) {
  const nextExpanded = Boolean(expanded);
  document.body.classList.toggle('screen-view-expanded', nextExpanded);
  elements.screenStage.dataset.expanded = String(nextExpanded);
  updateFullscreenButton();
  window.requestAnimationFrame(fitScreenStage);
}

function toggleScreenFullscreen(participantId = selectedScreenParticipantId) {
  const tile = document.querySelector(`[data-screen-tile="${participantId}"]`);
  const video = tile?.querySelector('[data-participant-video]');
  if (!video) return;
  setScreenViewExpanded(!document.body.classList.contains('screen-view-expanded'));
}

function updateFullscreenButton() {
  const expanded = document.body.classList.contains('screen-view-expanded') || Boolean(document.fullscreenElement);
  if (elements.screenFullscreenLabel) elements.screenFullscreenLabel.textContent = expanded ? 'Sair da tela cheia' : 'Tela cheia';
}

function updateScreenVolume() {
  const percentage = Math.round(screenVolumeLevel * 100);
  elements.screenVolume.value = String(percentage);
  elements.screenVolumeValue.textContent = `${percentage}%`;
  document.querySelectorAll('audio[data-screen-audio="true"]').forEach((audio) => {
    audio.volume = screenVolumeLevel;
    audio.muted = deafened || screenVolumeLevel === 0;
  });
}

function setScreenVolume(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  screenVolumeLevel = Math.min(100, Math.max(0, numericValue)) / 100;
  if (screenVolumeLevel > 0) previousScreenVolumeLevel = screenVolumeLevel;
  updateScreenVolume();
}

function toggleScreenVolume() {
  setScreenVolume(screenVolumeLevel > 0 ? 0 : Math.round((previousScreenVolumeLevel || 1) * 100));
}

async function closeContextScreen() {
  if (contextMenuTarget?.kind !== 'screen') return;
  const participantId = contextMenuTarget.participantId;
  closeContextMenu();
  if (participantId === selfId && sharingScreen) await toggleScreen();
  else if (watchingScreenParticipantId === participantId) await toggleScreenWatching(participantId);
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
    peerManager.setMuted(audioSettings.pushToTalk || deafened ? true : muted);
    try {
      await peerManager.startAudio(elements.microphoneSelect.value || undefined, audioSettings);
    } catch (error) {
      if (error.code !== 'RNNOISE_UNAVAILABLE' || audioSettings.noiseSuppressionMode !== 'rnnoise') throw error;
      audioSettings = { ...audioSettings, noiseSuppressionMode: 'native' };
      syncAudioSettingsControls();
      persistAudioSettings();
      showNotice('RNNoise não está disponível neste sistema; o modo nativo foi selecionado.', 'warning');
      await peerManager.startAudio(elements.microphoneSelect.value || undefined, audioSettings);
    }
    elements.microphone.disabled = false;
    muted = audioSettings.pushToTalk || deafened ? true : Boolean(peerManager.muted);
    peerManager.setMuted(muted);
    if (audioSettings.pushToTalk) await socketClient.setMuted(true);
    startSpeakingMonitor(selfId, peerManager.getAudioTrack());
    elements.microphone.textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
    renderVoiceControls();
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
    elements.microphoneTestStatus.textContent = error.code === 'RNNOISE_UNAVAILABLE'
      ? 'RNNoise não está disponível neste sistema.'
      : 'Não foi possível acessar o microfone.';
    showNotice(error.code === 'RNNOISE_UNAVAILABLE'
      ? 'Escolha o modo nativo ou verifique se o aplicativo foi atualizado.'
      : 'Verifique as permissões do Windows e o dispositivo selecionado.');
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

function renderNetworkOptions(info) {
  if (!elements.networkInterface) return;
  elements.networkInterface.replaceChildren();
  for (const entry of info?.interfaces || []) {
    const option = document.createElement('option');
    option.value = entry.address;
    const label = entry.provider || (entry.likelyVpn ? 'VPN provável' : 'Rede local');
    option.textContent = `${entry.address} — ${entry.name} (${label})`;
    elements.networkInterface.append(option);
  }
  if (hostIp && [...elements.networkInterface.options].some((option) => option.value === hostIp)) {
    elements.networkInterface.value = hostIp;
  }
}

async function refreshNetworkInterfaces({ reveal = false } = {}) {
  try {
    networkInfo = await window.voiceRoom?.getNetworkInterfaces?.();
  } catch {
    networkInfo = null;
  }
  renderNetworkOptions(networkInfo || {});
  const preferred = networkInfo?.preferred?.address || null;
  if (preferred && !reveal) {
    hostIp = preferred;
    if (elements.networkPicker) elements.networkPicker.hidden = true;
    if (elements.networkOther) elements.networkOther.hidden = false;
    return preferred;
  }
  if (!networkInfo?.interfaces?.length) {
    if (elements.networkStatus) elements.networkStatus.textContent = 'Nenhuma interface IPv4 foi encontrada.';
    if (elements.networkPicker) elements.networkPicker.hidden = false;
    return null;
  }
  if (elements.networkStatus) {
    elements.networkStatus.textContent = networkInfo.candidates?.length
      ? 'Escolha a interface VPN que seus amigos também utilizam.'
      : 'Nenhuma VPN foi identificada automaticamente. Escolha um IP manualmente.';
  }
  if (elements.networkPicker) elements.networkPicker.hidden = false;
  if (elements.networkOther) elements.networkOther.hidden = true;
  return null;
}

function renderDiscoveredPeers(peers = []) {
  if (!elements.networkPeerList) return;
  elements.networkPeerList.replaceChildren();
  for (const peer of peers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'network-peer';
    const address = `${peer.address}:${peer.port || DEFAULT_SIGNALING_PORT}`;
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    const subtitle = document.createElement('small');
    title.textContent = peer.address;
    subtitle.textContent = `${peer.provider || 'VPN'} · VoiceRoom disponível`;
    copy.append(title, subtitle);
    const action = document.createElement('span');
    action.textContent = 'Entrar';
    button.append(copy, action);
    button.addEventListener('click', () => {
      elements.hostIp.value = address;
      if (!elements.name.value.trim()) {
        elements.name.focus();
        showNotice('Digite seu nome para entrar nesta sala.', 'warning');
        return;
      }
      createOrJoin('join');
    });
    elements.networkPeerList.append(button);
  }
}

async function viewOwnScreen() {
  const previousParticipantId = watchingScreenParticipantId;
  watchingScreenParticipantId = null;
  if (previousParticipantId) {
    removeScreenStream(previousParticipantId);
    try {
      await socketClient?.unsubscribeScreen(previousParticipantId);
    } catch {
      // A transmissão pode ter terminado enquanto o usuário alternava de tela.
    }
  }
  if (peerManager?.screenStream) renderScreenStream(selfId, peerManager.screenStream, { muted: true });
}

async function discoverNearbyRooms({ announce = false } = {}) {
  if (!elements.networkDiscover || !window.voiceRoom?.discoverNetworkPeers) return;
  elements.networkDiscover.disabled = true;
  elements.networkDiscoveryStatus.textContent = 'Procurando VoiceRoom nas máquinas já vistas pela VPN…';
  try {
    const result = await window.voiceRoom.discoverNetworkPeers();
    const peers = Array.isArray(result?.peers) ? result.peers : [];
    renderDiscoveredPeers(peers);
    elements.networkDiscoveryStatus.textContent = peers.length
      ? `${peers.length} sala${peers.length === 1 ? '' : 's'} encontrada${peers.length === 1 ? '' : 's'}.`
      : 'Nenhuma sala VoiceRoom disponível foi encontrada na VPN agora.';
    if (announce && peers.length) showNotice('Sala VoiceRoom encontrada na sua VPN.', 'success', 5_000);
  } catch {
    renderDiscoveredPeers([]);
    elements.networkDiscoveryStatus.textContent = 'Não foi possível verificar a VPN agora.';
  } finally {
    elements.networkDiscover.disabled = false;
  }
}

async function resolveHostIp() {
  if (!networkInfo) {
    const preferred = await refreshNetworkInterfaces();
    if (preferred) return preferred;
  }
  // Preserve an explicit choice made in the picker, including when it differs
  // from the heuristic preferred VPN address.
  if (hostIp && networkInfo?.interfaces?.some((entry) => entry.address === hostIp)
    && elements.networkPicker?.hidden !== false) {
    return hostIp;
  }
  if (networkInfo?.preferred?.address && elements.networkPicker?.hidden !== false) {
    hostIp = networkInfo.preferred.address;
    return hostIp;
  }
  const selected = elements.networkInterface?.value || '';
  if (!selected) {
    await refreshNetworkInterfaces({ reveal: true });
    showNotice('Selecione o IP da VPN para criar a sala.', 'warning');
    return null;
  }
  if (elements.networkPicker && !elements.networkPicker.hidden) {
    showNotice('Confirme o IP selecionado para criar a sala.', 'warning');
    return null;
  }
  hostIp = selected;
  return hostIp;
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
  setStatus(action === 'create' ? 'Preparando sala local…' : 'Verificando host…');
  let localServerStartedForAttempt = false;
  let fallbackPortUsed = false;
  try {
    let result;
    if (action === 'create') {
      const selectedIp = await resolveHostIp();
      if (!selectedIp) return;
      const serverResult = await window.voiceRoom?.startLocalServer?.({
        ip: selectedIp,
        port: DEFAULT_SIGNALING_PORT,
        allowPortFallback: true
      });
      if (!serverResult?.ok) {
        showNotice(serverResult?.message || 'Não foi possível iniciar a sala local.', 'error');
        setStatus('Não foi possível criar a sala.', 'error');
        return;
      }
      localServerStartedForAttempt = true;
      hostIp = serverResult.data.host;
      hostPort = serverResult.data.port;
      fallbackPortUsed = serverResult.data.fallbackUsed === true;
      signalingUrl = `http://${hostIp}:${hostPort}`;
      const target = await window.voiceRoom?.setSignalingTarget?.(signalingUrl);
      if (!target?.ok) throw new Error('O endereço da sala local não é válido.');
      const health = await SocketClient.healthCheck(signalingUrl);
      if (!health?.ok) throw new Error('A sala local não respondeu ao health check.');
      await socketClient.connect(signalingUrl);
      result = await socketClient.createRoom(displayName, profileAvatar || null, profileId);
    } else {
      let parsed;
      try {
        parsed = normalizeHostAddress(elements.hostIp.value);
      } catch (error) {
        showNotice(error.message || 'O endereço IP informado não é válido.');
        setStatus('Endereço inválido.', 'error');
        return;
      }
      hostIp = parsed.host;
      hostPort = parsed.port;
      signalingUrl = parsed.url;
      const target = await window.voiceRoom?.setSignalingTarget?.(signalingUrl);
      if (!target?.ok) {
        showNotice('O endereço do host não é válido.');
        setStatus('Endereço inválido.', 'error');
        return;
      }
      const health = await SocketClient.healthCheck(signalingUrl);
      if (!health?.ok) {
        showNotice(health.errorCode === 'CONNECTION_TIMEOUT'
          ? 'Não foi possível conectar ao host. Verifique a VPN e o Firewall do Windows.'
          : 'Não foi possível localizar uma sala nesse endereço.');
        setStatus('Host não encontrado.', 'error');
        return;
      }
      await socketClient.connect(signalingUrl);
      result = await socketClient.joinRoom(displayName, profileAvatar || null, profileId);
    }
    if (!result?.ok) {
      socketClient?.close();
      try { await window.voiceRoom?.clearSignalingTargets?.(); } catch { /* cleanup best effort */ }
      if (action === 'create' && localServerStartedForAttempt) {
        try { await window.voiceRoom?.stopLocalServer?.({ notify: false, reason: 'create_rejected' }); } catch { /* cleanup best effort */ }
      }
      showNotice(responseError(result));
      setStatus('Não foi possível entrar.', 'error');
      return;
    }
    enterRoom(result);
    if (action === 'create' && fallbackPortUsed) {
      showNotice(`Sala criada automaticamente em ${hostIp}:${hostPort}.`, 'success', 5_000);
    }
    await loadMicrophones();
  } catch (error) {
    if (action === 'create' && localServerStartedForAttempt && !roomCode) {
      socketClient?.close();
      try { await window.voiceRoom?.stopLocalServer?.({ notify: false, reason: 'create_failed' }); } catch { /* cleanup best effort */ }
    }
    if (!roomCode) {
      socketClient?.close();
      try { await window.voiceRoom?.clearSignalingTargets?.(); } catch { /* cleanup best effort */ }
    }
    showNotice(error?.message || 'Não foi possível conectar ao host. Verifique a VPN e o Firewall do Windows.');
    setStatus('Não foi possível conectar.', 'error');
  } finally {
    elements.create.disabled = false;
    elements.join.disabled = false;
  }
}

async function toggleMicrophone() {
  if (forcedMutedUntil && forcedMutedUntil > Date.now()) {
    showNotice('Você está mutado temporariamente por votação.', 'warning');
    return;
  }
  if (deafened) {
    showNotice('Desative o ensurdecer para ativar o microfone.', 'warning');
    return;
  }
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
  renderVoiceControls();
  if (currentRoom) renderRoom(currentRoom);
}

async function setMicrophoneMuted(nextMuted) {
  muted = deafened ? true : Boolean(nextMuted);
  if (peerManager) {
    peerManager.setMuted(muted);
    if (peerManager.getAudioTrack()) await socketClient.setMuted(muted);
  }
  elements.microphone.textContent = muted ? 'Ativar microfone' : 'Mutar microfone';
  renderVoiceControls();
  if (currentRoom) renderRoom(currentRoom);
}

async function toggleDeafen() {
  if (deafened) {
    deafened = false;
    applyDeafenState();
    try {
      await setMicrophoneMuted(mutedBeforeDeafen);
      showNotice('Você voltou a ouvir a chamada.', 'success');
    } catch {
      showNotice('Você voltou a ouvir, mas não foi possível atualizar o estado do microfone.', 'warning');
    }
    renderVoiceControls();
    return;
  }

  mutedBeforeDeafen = muted;
  deafened = true;
  applyDeafenState();
  try {
    await setMicrophoneMuted(true);
    showNotice('Chamada ensurdecida: você não ouvirá ninguém e o microfone foi mutado.', 'success');
  } catch {
    showNotice('Chamada ensurdecida, mas não foi possível atualizar o estado do microfone.', 'warning');
  }
  renderVoiceControls();
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
    setScreenQuality(selection.quality);
    if (screenQuality === 'maximum') warnMaximumScreenQuality();
    const stream = await peerManager.startScreenShare(selection.sourceId, {
      includeSystemAudio: selection.includeSystemAudio,
      quality: selection.quality
    });
    sharingScreen = true;
    renderScreenStream(selfId, stream, { muted: true });
    renderRoom(currentRoom);
    switchChannel('voice');
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
  elements.includeScreenAudio.checked = true;
  syncScreenQualityRecommendation({ select: true });
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
    const groups = [
      ['Telas', sources.filter((source) => source.id.startsWith('screen:'))],
      ['Janelas', sources.filter((source) => !source.id.startsWith('screen:'))]
    ];
    for (const [groupName, groupSources] of groups) {
      if (!groupSources.length) continue;
      const heading = document.createElement('h3');
      heading.className = 'source-group-title';
      heading.textContent = groupName;
      elements.sourceList.append(heading);
      for (const source of groupSources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'source-option';
      if (source.thumbnail) {
        const thumbnail = document.createElement('img');
        thumbnail.src = source.thumbnail;
        thumbnail.alt = '';
        button.append(thumbnail);
      }
      const sourceName = document.createElement('span');
      sourceName.textContent = source.name;
      button.append(sourceName);
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
    }
    elements.sourcePicker.hidden = false;
  });
}

async function leaveRoom({ notifyServer = true, stopHost = true } = {}) {
  const wasHost = roomRole === 'host';
  if (notifyServer) {
    try { await socketClient?.leaveRoom(); } catch { /* conexão já pode ter caído */ }
  }
  if (wasHost && stopHost) {
    try { await window.voiceRoom?.stopLocalServer?.({ notify: true, reason: 'host_left' }); } catch { /* cleanup best effort */ }
  }
  socketClient?.close();
  try { await window.voiceRoom?.clearSignalingTargets?.(); } catch { /* cleanup best effort */ }
  closeAudioSettings();
  setScreenViewExpanded(false);
  peerManager?.close();
  stopAllSpeakingMonitors();
  stopLatencyMonitoring();
  window.clearInterval(roomDurationTimer);
  roomDurationTimer = null;
  roomStartedAt = null;
  presenceReady = false;
  previousParticipants = new Map();
  chatMessages = [];
  peerManager = null;
  selfId = null;
  roomCode = null;
  roomRole = null;
  hostIp = '';
  hostPort = DEFAULT_SIGNALING_PORT;
  signalingUrl = null;
  currentRoom = null;
  sharingScreen = false;
  watchingScreenParticipantId = null;
  screenWatchActionInProgress = false;
  screenAudioSourceIds.clear();
  screenStatsByParticipant.clear();
  screenQualityWarnings.clear();
  selectedScreenParticipantId = null;
  elements.room.hidden = true;
  elements.landing.hidden = false;
  elements.screenStage.querySelectorAll('[data-screen-tile]').forEach((tile) => tile.remove());
  elements.screenStage.querySelectorAll('[data-participant-audio]').forEach((audio) => audio.remove());
  elements.screenEmptyStage.hidden = false;
  elements.screenStage.dataset.active = 'false';
  elements.screenStage.style.width = '100%';
  elements.screenStage.style.height = '100%';
  elements.screenVolume.disabled = true;
  elements.screenFullscreen.disabled = true;
  elements.screenAudioStatus.textContent = 'Áudio da tela: desativado';
  if (elements.screenShareLabel) elements.screenShareLabel.textContent = 'Compartilhar tela';
  setScreenDiagnosticsVisible(false);
  if (elements.screenDiagnosticsToggle) elements.screenDiagnosticsToggle.hidden = true;
  elements.reconnect.hidden = true;
  elements.reconnect.disabled = false;
  elements.reconnect.textContent = 'Reconectar chamadas';
  if (elements.copyInvite) elements.copyInvite.hidden = false;
  if (elements.leave) elements.leave.textContent = 'Sair da sala';
  if (elements.networkOther) elements.networkOther.hidden = true;
  muted = false;
  deafened = false;
  mutedBeforeDeafen = false;
  applyDeafenState();
  renderVoiceControls();
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
  return hostIp ? `voiceroom://join/${encodeURIComponent(`${hostIp}:${hostPort}`)}` : '';
}

async function copyInviteLink() {
  const inviteLink = getInviteLink();
  if (!inviteLink) return;
  try {
    await navigator.clipboard.writeText(inviteLink);
    showNotice('Endereço de convite copiado.', 'success');
  } catch {
    showNotice(`Copie este link: ${inviteLink}`);
  }
}

function handleDeepLink(url) {
  if (typeof url !== 'string' || !url.toLowerCase().startsWith('voiceroom://')) return;
  const match = url.match(/^voiceroom:\/\/join\/(.+)$/i);
  if (!match) return;
  let address;
  try { address = normalizeHostAddress(decodeURIComponent(match[1])); } catch { return; }
  if (elements.hostIp) elements.hostIp.value = address.address;
  if (elements.landing.hidden) {
    showNotice(`Endereço ${address.address} recebido pelo link. Saia da sala atual para entrar nele.`);
  } else {
    elements.hostIp?.focus();
    showNotice(`Endereço ${address.address} preenchido pelo link.`, 'success');
  }
}

function bindEvents() {
  elements.themeToggle?.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  elements.windowMinimize?.addEventListener('click', () => window.voiceRoom?.minimizeWindow?.());
  elements.windowMaximize?.addEventListener('click', () => window.voiceRoom?.toggleMaximizeWindow?.());
  elements.windowClose?.addEventListener('click', () => window.voiceRoom?.closeWindow?.());
  elements.voiceChannel?.addEventListener('click', () => switchChannel('voice'));
  elements.textChannel?.addEventListener('click', () => switchChannel('text'));
  elements.create.addEventListener('click', () => createOrJoin('create'));
  elements.join.addEventListener('click', () => createOrJoin('join'));
  elements.hostIp?.addEventListener('input', () => {
    elements.hostIp.value = elements.hostIp.value.replace(/[^0-9.:\s]/g, '');
  });
  elements.copyIp?.addEventListener('click', async () => {
    if (!hostIp) return;
    await navigator.clipboard.writeText(`${hostIp}:${hostPort}`);
    showNotice('Endereço da sala copiado.', 'success');
  });
  elements.copyInvite.addEventListener('click', copyInviteLink);
  elements.networkConfirm?.addEventListener('click', async () => {
    if (!elements.networkInterface?.value) {
      showNotice('Selecione uma interface de rede.', 'warning');
      return;
    }
    hostIp = elements.networkInterface.value;
    if (elements.networkPicker) elements.networkPicker.hidden = true;
    await createOrJoin('create');
  });
  elements.networkRefresh?.addEventListener('click', () => refreshNetworkInterfaces({ reveal: true }));
  elements.networkOther?.addEventListener('click', () => refreshNetworkInterfaces({ reveal: true }));
  elements.networkDiscover?.addEventListener('click', () => discoverNearbyRooms({ announce: true }));
  elements.profileBadge?.addEventListener('click', () => elements.profilePhotoInput?.click());
  elements.profilePhotoInput?.addEventListener('change', handleProfilePhotoChange);
  elements.microphone.addEventListener('click', toggleMicrophone);
  elements.voiceMicrophone?.addEventListener('click', toggleMicrophone);
  elements.voiceDeafen?.addEventListener('click', toggleDeafen);
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
  elements.noiseSuppressionMode.addEventListener('change', changeAudioProcessing);
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
  elements.screenVolumeToggle?.addEventListener('click', toggleScreenVolume);
  elements.screenQuality.addEventListener('change', async () => {
    setScreenQuality(elements.screenQuality.value);
    if (screenQuality === 'maximum') warnMaximumScreenQuality();
    try { await peerManager?.setScreenQuality?.(screenQuality); } catch { /* fallback mantém o perfil atual */ }
  });
  elements.activeIp?.addEventListener('click', () => elements.copyIp?.click());
  elements.screenDiagnosticsToggle?.addEventListener('click', () => {
    const isOpen = elements.screenDiagnostics?.hidden === false;
    setScreenDiagnosticsVisible(!isOpen);
    if (!isOpen) renderScreenDiagnostics();
  });
  // Não passe o MouseEvent como participantId: a transmissão selecionada
  // deve ser resolvida pelo estado atual do palco.
  elements.screenFullscreen.addEventListener('click', () => toggleScreenFullscreen());
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  elements.leave.addEventListener('click', leaveRoom);
  elements.presenceNotifications?.addEventListener('change', readAudioSettingsFromControls);
  elements.chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = elements.chatInput.value.trim();
    if (!content) return;
    elements.chatInput.value = '';
    await sendChat('text', content);
  });
  elements.chatImageOpen?.addEventListener('click', () => elements.chatImageInput?.click());
  elements.chatImageInput?.addEventListener('change', async () => {
    const file = elements.chatImageInput.files?.[0];
    elements.chatImageInput.value = '';
    try { await sendChatImage(file); } catch (error) { showNotice(error.message); }
  });
  elements.appUpdateInstall?.addEventListener('click', installApplicationUpdate);
  elements.appUpdateCheck?.addEventListener('click', async () => {
    if (appUpdateState.status === 'downloaded') {
      await installApplicationUpdate();
      return;
    }
    elements.appUpdateCheck.disabled = true;
    elements.appUpdateSettingsStatus.textContent = 'Verificando atualizações…';
    try {
      const state = await window.voiceRoom?.checkForUpdates?.();
      if (state) handleAppUpdateState(state);
    } catch {
      showNotice('Não foi possível verificar atualizações agora.', 'warning');
      renderAppUpdateSettings();
    }
  });
  elements.appUpdateDismiss?.addEventListener('click', () => {
    appUpdateDismissed = true;
    renderAppUpdate();
  });
  elements.name.addEventListener('input', () => {
    try { localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, elements.name.value); } catch { /* armazenamento opcional */ }
    renderProfileAvatar();
    renderLocalProfileNote();
  });
  elements.contextMenuVolume?.addEventListener('input', () => setContextTargetVolume(elements.contextMenuVolume.value));
  elements.contextMenuMute?.addEventListener('click', toggleContextTargetMute);
  elements.contextMenuCloseStream?.addEventListener('click', () => closeContextScreen().catch(() => {}));
  elements.contextMenuWatch?.addEventListener('click', () => watchContextTransmission().catch(() => {}));
  elements.contextVoteMute?.addEventListener('click', () => startContextVote('mute', 30));
  elements.contextVoteBanTemp?.addEventListener('click', () => startContextVote('ban', Number(elements.contextBanSeconds.value) || 60));
  elements.contextVoteBanPermanent?.addEventListener('click', () => startContextVote('ban', 0));
  elements.settingsAudioTab?.addEventListener('click', () => switchSettingsPane('audio'));
  elements.settingsRoomTab?.addEventListener('click', () => switchSettingsPane('room'));
  elements.roomChatNameSave?.addEventListener('click', async () => {
    const response = await socketClient?.updateRoomSettings(elements.roomChatName.value);
    if (!response?.ok) showNotice(responseError(response));
    else showNotice('Nome do chat atualizado.', 'success');
  });
  elements.roomModeratorSelect?.addEventListener('change', syncModeratorButton);
  elements.roomModeratorToggle?.addEventListener('click', async () => {
    const participantId = elements.roomModeratorSelect.value;
    const allowed = !currentRoom?.moderatorParticipantIds?.includes(participantId);
    const response = await socketClient?.setRoomModerator(participantId, allowed);
    if (!response?.ok) showNotice(responseError(response));
  });
  elements.roomBansRefresh?.addEventListener('click', loadRoomBans);
  elements.voteYes?.addEventListener('click', async () => {
    const response = await socketClient?.castVote(activeVote?.voteId, true);
    if (!response?.ok) showNotice(responseError(response), 'warning');
    else elements.voteActions.hidden = true;
  });
  elements.voteNo?.addEventListener('click', async () => {
    const response = await socketClient?.castVote(activeVote?.voteId, false);
    if (!response?.ok) showNotice(responseError(response), 'warning');
    else elements.voteActions.hidden = true;
  });
  document.addEventListener('click', (event) => {
    if (!elements.contextMenu?.hidden && !event.target.closest('#context-menu')) closeContextMenu();
  });
  document.addEventListener('keydown', handlePttKeyDown);
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || capturingPttKey) return;
    if (!elements.contextMenu?.hidden) closeContextMenu();
    else if (document.body.classList.contains('screen-view-expanded')) setScreenViewExpanded(false);
    else closeAudioSettings();
  });
  document.addEventListener('keyup', handlePttKeyUp);
  window.addEventListener('blur', releasePtt);
  window.addEventListener('resize', fitScreenStage);
  window.voiceRoom?.onDeepLink?.(handleDeepLink);
  window.voiceRoom?.onLocalServerState?.((state) => {
    if (state?.state === 'error') {
      showNotice(state.message || 'Não foi possível iniciar a sala local.', 'error');
    }
  });
  window.voiceRoom?.onUpdateState?.(handleAppUpdateState);
  window.voiceRoom?.getUpdateState?.().then(handleAppUpdateState).catch(() => {});
  window.voiceRoom?.getAppVersion?.().then((version) => {
    appVersion = typeof version === 'string' ? version : '';
    renderAppUpdateSettings();
  }).catch(() => {});
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
  if (event === 'chat:message') {
    if (payload?.message) {
      chatMessages.push(payload.message);
      renderChatMessage(payload.message);
    }
    return;
  }
  if (event === 'vote:state') {
    renderVote(payload?.vote);
    return;
  }
  if (event === 'moderation:forced-mute') {
    forcedMutedUntil = Number(payload?.until) || null;
    if (forcedMutedUntil) {
      setMicrophoneMuted(true).catch(() => {});
      showPresenceToast('Você foi mutado por 30 segundos após votação.', 'leave');
      window.setTimeout(() => {
        forcedMutedUntil = null;
        renderVoiceControls();
      }, Math.max(0, forcedMutedUntil - Date.now()));
    } else {
      renderVoiceControls();
      showPresenceToast('Seu mute temporário terminou.', 'join');
    }
    return;
  }
  if (event === 'moderation:banned') {
    const expiry = payload?.ban?.expiresAt;
    showNotice(expiry ? `Você foi banido até ${new Date(expiry).toLocaleString('pt-BR')}.` : 'Você foi banido permanentemente desta sala.', 'error', 10_000);
    leaveRoom({ notifyServer: false, stopHost: false });
    return;
  }
  if (event === 'room:host-ended') {
    if (!roomCode) return;
    showNotice('O host encerrou a sala.', 'warning');
    leaveRoom({ notifyServer: false, stopHost: false });
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
      const viewer = currentRoom?.participants.find((participant) => participant.participantId === payload.viewerParticipantId);
      showPresenceToast(`${viewer?.displayName || 'Alguém'} entrou na sua transmissão.`, 'join');
    }
    return;
  }
  if (event === 'screen:viewer-left') {
    if (payload.ownerParticipantId === selfId) {
      peerManager?.setScreenViewer(payload.viewerParticipantId, false).catch((error) => showNotice(error.message));
      const viewer = currentRoom?.participants.find((participant) => participant.participantId === payload.viewerParticipantId);
      showPresenceToast(`${viewer?.displayName || 'Alguém'} saiu da sua transmissão.`, 'leave');
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
  if (event === 'connect-error' && roomCode) {
    setStatus('Não foi possível conectar ao host.', 'error');
  }
  if (event === 'reconnect-timeout' && roomCode) {
    showNotice('A VPN não voltou a tempo. Verifique a conexão e entre novamente.', 'warning');
    leaveRoom({ notifyServer: false, stopHost: false });
  }
  if (event === 'resume-result' && !payload?.ok) {
    showNotice('A sala expirou. Crie ou entre em uma nova sala.');
    leaveRoom({ notifyServer: false, stopHost: false });
  }
}

function bootstrap() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch { /* armazenamento opcional */ }
  applyTheme(savedTheme);
  profileId = loadProfileId();
  loadLocalPreferences();
  profileAvatar = loadProfileAvatar();
  renderProfileAvatar();
  syncAudioSettingsControls();
  bindEvents();
  socketClient = new SocketClient({ onEvent: handleSocketEvent });
  setStatus('Pronto para criar ou entrar em uma sala.');
  window.setTimeout(() => discoverNearbyRooms(), 600);
}

bootstrap();
