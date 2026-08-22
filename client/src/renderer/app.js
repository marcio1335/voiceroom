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
  participants: document.querySelector('#participants'),
  microphone: document.querySelector('#microphone'),
  microphoneSelect: document.querySelector('#microphone-select'),
  echoCancellation: document.querySelector('#echo-cancellation'),
  noiseSuppression: document.querySelector('#noise-suppression'),
  autoGainControl: document.querySelector('#auto-gain-control'),
  processMicrophoneTest: document.querySelector('#process-microphone-test'),
  microphoneGain: document.querySelector('#microphone-gain'),
  microphoneGainValue: document.querySelector('#microphone-gain-value'),
  audioProcessingStatus: document.querySelector('#audio-processing-status'),
  testMicrophone: document.querySelector('#test-microphone'),
  microphoneLevel: document.querySelector('#microphone-level'),
  microphoneTestStatus: document.querySelector('#microphone-test-status'),
  screen: document.querySelector('#screen-share'),
  screenVolume: document.querySelector('#screen-volume'),
  screenVolumeValue: document.querySelector('#screen-volume-value'),
  screenFullscreen: document.querySelector('#screen-fullscreen'),
  screenAudioStatus: document.querySelector('#screen-audio-status'),
  leave: document.querySelector('#leave-room'),
  screenStage: document.querySelector('#screen-stage'),
  screenEmptyStage: document.querySelector('#screen-empty-stage'),
  screenShareList: document.querySelector('#screen-share-list'),
  sourcePicker: document.querySelector('#source-picker'),
  sourceList: document.querySelector('#source-list'),
  includeScreenAudio: document.querySelector('#include-screen-audio'),
  cancelSource: document.querySelector('#cancel-source'),
  status: document.querySelector('#status'),
  notice: document.querySelector('#notice')
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
const screenAudioSourceIds = new Set();

const AUDIO_SETTINGS_STORAGE_KEY = 'voiceroom.audioSettings';
const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  processMicrophoneTest: false,
  inputGain: 1
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
      inputGain: clampInputGain(saved.inputGain)
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

let audioSettings = loadAudioSettings();

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
  elements.microphoneGain.value = String(Math.round(audioSettings.inputGain * 100));
  elements.microphoneGainValue.textContent = `${Math.round(audioSettings.inputGain * 100)}%`;
}

function collectAudioSettingsFromControls() {
  return {
    echoCancellation: elements.echoCancellation.checked,
    noiseSuppression: elements.noiseSuppression.checked,
    autoGainControl: elements.autoGainControl.checked,
    processMicrophoneTest: elements.processMicrophoneTest.checked,
    inputGain: clampInputGain(Number(elements.microphoneGain.value) / 100)
  };
}

function readAudioSettingsFromControls() {
  audioSettings = collectAudioSettingsFromControls();
  elements.microphoneGainValue.textContent = `${Math.round(audioSettings.inputGain * 100)}%`;
  persistAudioSettings();
  peerManager?.setInputGain(audioSettings.inputGain);
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
    const state = participant.screenSharing ? '🖥' : participant.muted ? '🔇' : participant.connected ? '●' : '○';
    const stateElement = document.createElement('span');
    stateElement.className = 'participant-state';
    stateElement.setAttribute('aria-hidden', 'true');
    stateElement.textContent = state;
    const nameElement = document.createElement('span');
    nameElement.textContent = participant.displayName + (participant.participantId === selfId ? ' (você)' : '');
    item.append(stateElement, nameElement);
    elements.participants.append(item);
  }
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
      setStatus(`Conexão com ${participantId.slice(0, 6)}: ${state}`);
    },
    onError: (_participantId, code) => showNotice(code === 'P2P_FAILED' ? 'Não foi possível conectar com este participante. Tente trocar de rede ou reiniciar a chamada.' : code)
  });
  peerManager.syncParticipants(currentRoom?.participants || result.data.room.participants).catch((error) => showNotice(error.message));
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
      audio.dataset.screenAudio = String(isScreenAudio);
      audio.onended = () => audio.remove();
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
}

async function initializeAudio() {
  try {
    await peerManager.startAudio(elements.microphoneSelect.value || undefined, audioSettings);
    elements.microphone.disabled = false;
    renderAudioProcessingStatus(peerManager.getAudioProcessingSettings());
    setStatus('Microfone conectado.', 'success');
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
  elements.create.disabled = true;
  elements.join.disabled = true;
  setStatus('Conectando ao servidor…');
  const result = action === 'create'
    ? await socketClient.createRoom(displayName)
    : await socketClient.joinRoom(elements.roomCode.value, displayName);
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
      includeSystemAudio: selection.includeSystemAudio
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
          includeSystemAudio: elements.includeScreenAudio.checked
        });
      }, { once: true });
      elements.sourceList.append(button);
    }
    elements.sourcePicker.hidden = false;
  });
}

async function leaveRoom() {
  try { await socketClient.leaveRoom(); } catch { /* conexão já pode ter caído */ }
  peerManager?.close();
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
  setStatus('Pronto para criar ou entrar em uma sala.');
}

function bindEvents() {
  elements.create.addEventListener('click', () => createOrJoin('create'));
  elements.join.addEventListener('click', () => createOrJoin('join'));
  elements.roomCode.addEventListener('input', () => { elements.roomCode.value = elements.roomCode.value.toUpperCase(); });
  elements.copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(roomCode);
    showNotice('Código copiado.', 'success');
  });
  elements.microphone.addEventListener('click', toggleMicrophone);
  elements.microphoneSelect.addEventListener('change', initializeAudio);
  elements.echoCancellation.addEventListener('change', changeAudioProcessing);
  elements.noiseSuppression.addEventListener('change', changeAudioProcessing);
  elements.autoGainControl.addEventListener('change', changeAudioProcessing);
  elements.processMicrophoneTest.addEventListener('change', async () => {
    readAudioSettingsFromControls();
    await restartMicrophoneLoopback();
  });
  elements.microphoneGain.addEventListener('input', readAudioSettingsFromControls);
  elements.testMicrophone.addEventListener('click', toggleMicrophoneLoopback);
  elements.screen.addEventListener('click', toggleScreen);
  elements.screenVolume.addEventListener('input', () => setScreenVolume(elements.screenVolume.value));
  elements.screenFullscreen.addEventListener('click', toggleScreenFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  elements.leave.addEventListener('click', leaveRoom);
}

function handleSocketEvent(event, payload) {
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
  syncAudioSettingsControls();
  bindEvents();
  socketClient = new SocketClient({ onEvent: handleSocketEvent });
  setStatus('Conectando ao servidor…');
}

bootstrap();
