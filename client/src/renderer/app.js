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
  screenFullscreen: document.querySelector('#screen-fullscreen'),
  screenAudioStatus: document.querySelector('#screen-audio-status'),
  leave: document.querySelector('#leave-room'),
  screenStage: document.querySelector('#screen-stage'),
  sourcePicker: document.querySelector('#source-picker'),
  sourceList: document.querySelector('#source-list'),
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
  if (response?.errorCode === 'SCREEN_BUSY') return 'Outro participante já está compartilhando a tela.';
  return response?.message || 'Não foi possível concluir a operação.';
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
  elements.screen.disabled = Boolean(room.screenSharingParticipantId && room.screenSharingParticipantId !== selfId);
  elements.screen.textContent = sharingScreen ? 'Parar tela' : 'Compartilhar tela';
  renderParticipants();
  peerManager?.syncParticipants(room.participants).catch((error) => showNotice(error.message));
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
  let video = document.querySelector(`[data-participant-video="${participantId}"]`);
  if (!video) {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.controls = true;
    video.dataset.participantVideo = participantId;
    video.addEventListener('dblclick', toggleScreenFullscreen);
    elements.screenStage.replaceChildren(video);
  }
  video.muted = muted;
  video.srcObject = stream;
  video.play().catch(() => {});
  elements.screenStage.dataset.active = 'true';
  elements.screenFullscreen.disabled = false;
  elements.screenAudioStatus.textContent = stream.getAudioTracks?.().length
    ? 'Áudio da tela ativo'
    : 'Vídeo compartilhado sem áudio';
}

function attachRemoteStream(participantId, track, stream) {
  if (track.kind === 'audio') {
    const isScreenAudio = Boolean(stream.getVideoTracks?.().length);
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
    audio.play().catch(() => {});
    return;
  }
  renderScreenStream(participantId, stream);
}

async function toggleScreenFullscreen() {
  const video = document.querySelector('[data-participant-video]');
  if (!video) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
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

function removeParticipantMedia(participantId) {
  document.querySelectorAll('[data-participant-audio]').forEach((audio) => {
    if (audio.dataset.participantAudio.startsWith(`${participantId}-`)) audio.remove();
  });
  document.querySelector(`[data-participant-video="${participantId}"]`)?.remove();
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
      elements.screenStage.replaceChildren();
      elements.screenStage.dataset.active = 'false';
      elements.screenFullscreen.disabled = true;
      elements.screenAudioStatus.textContent = 'Áudio da tela: desativado';
      renderRoom(currentRoom);
      return;
    }
    const sourceId = await chooseScreenSource();
    const stream = await peerManager.startScreenShare(sourceId);
    sharingScreen = true;
    renderScreenStream(selfId, stream, { muted: true });
    renderRoom(currentRoom);
  } catch (error) {
    if (error.name !== 'AbortError') showNotice(error.message || 'Não foi possível compartilhar a tela.');
  }
}

async function chooseScreenSource() {
  if (!window.voiceRoom?.getScreenSources) return undefined;
  const sources = await window.voiceRoom.getScreenSources();
  if (!sources.length) throw new Error('Nenhuma janela ou tela disponível para compartilhar.');
  elements.sourceList.replaceChildren();
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
        resolve(source.id);
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
  elements.room.hidden = true;
  elements.landing.hidden = false;
  elements.screenStage.replaceChildren();
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
  if (event === 'screen:stopped') {
    elements.screenStage.replaceChildren();
    elements.screenStage.dataset.active = 'false';
    elements.screenFullscreen.disabled = true;
    elements.screenAudioStatus.textContent = 'Áudio da tela: desativado';
    if (payload.participantId) {
      document.querySelectorAll('[data-participant-audio]').forEach((audio) => {
        if (audio.dataset.participantAudio.startsWith(`${payload.participantId}-`) && audio.dataset.screenAudio === 'true') {
          audio.remove();
        }
      });
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
