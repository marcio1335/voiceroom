const SCREEN_PROFILES = Object.freeze({
  economic: Object.freeze({
    id: 'economic',
    label: 'Econômico',
    description: '480p · 30 fps · menos banda',
    width: 854,
    height: 480,
    frameRate: 30,
    maxBitrate: 1_200_000,
    contentHint: 'detail',
    degradationPreference: 'balanced'
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Equilibrado',
    description: '720p · 30 fps · recomendado',
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 2_500_000,
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution'
  }),
  sharp: Object.freeze({
    id: 'sharp',
    label: 'Nitidez',
    description: '1080p · 30 fps · texto e trabalho',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 5_000_000,
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution'
  }),
  fluid: Object.freeze({
    id: 'fluid',
    label: 'Fluido',
    description: '720p · 60 fps · vídeo e jogos',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxBitrate: 5_000_000,
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate'
  }),
  maximum: Object.freeze({
    id: 'maximum',
    label: 'Máximo',
    description: '1080p · 60 fps · uso muito alto de banda e CPU',
    width: 1920,
    height: 1080,
    frameRate: 60,
    maxBitrate: 10_000_000,
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate'
  })
});

const SCREEN_PROFILE_ALIASES = Object.freeze({
  '480p': 'economic',
  '720p': 'balanced',
  '1080p': 'sharp',
  '720p60': 'fluid',
  '1080p60': 'maximum'
});

const SCREEN_PROFILE_LADDERS = Object.freeze({
  economic: Object.freeze(['economic']),
  balanced: Object.freeze(['balanced', 'economic']),
  sharp: Object.freeze(['sharp', 'balanced', 'economic']),
  fluid: Object.freeze(['fluid', 'balanced', 'economic']),
  maximum: Object.freeze(['maximum', 'fluid', 'balanced', 'economic'])
});

const DEFAULT_SCREEN_PROFILE = 'balanced';
const MIN_RTT_GOOD_MS = 180;
const MAX_RTT_BAD_MS = 350;
const GOOD_LOSS_FRACTION = 0.02;
const BAD_LOSS_FRACTION = 0.05;
const BAD_SAMPLE_LIMIT = 3;
const GOOD_SAMPLE_LIMIT = 10;
const PROFILE_CHANGE_COOLDOWN_MS = 15_000;

function normalizeScreenProfile(value) {
  const candidate = SCREEN_PROFILE_ALIASES[value] || value;
  return Object.hasOwn(SCREEN_PROFILES, candidate) ? candidate : DEFAULT_SCREEN_PROFILE;
}

function getScreenProfile(value) {
  return SCREEN_PROFILES[normalizeScreenProfile(value)];
}

function listScreenProfiles() {
  return Object.values(SCREEN_PROFILES);
}

function getScreenProfileLadder(value) {
  const profile = normalizeScreenProfile(value);
  return SCREEN_PROFILE_LADDERS[profile] || SCREEN_PROFILE_LADDERS[DEFAULT_SCREEN_PROFILE];
}

function getLowerScreenProfile(current, desired) {
  const ladder = getScreenProfileLadder(desired);
  const currentId = normalizeScreenProfile(current);
  const index = ladder.indexOf(currentId);
  if (index < 0 || index >= ladder.length - 1) return currentId;
  return ladder[index + 1];
}

function getHigherScreenProfile(current, desired) {
  const ladder = getScreenProfileLadder(desired);
  const currentId = normalizeScreenProfile(current);
  const index = ladder.indexOf(currentId);
  if (index <= 0) return currentId;
  return ladder[index - 1];
}

function calculateScreenScale(sourceWidth, sourceHeight, profileValue) {
  const profile = getScreenProfile(profileValue);
  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.max(1, width / profile.width, height / profile.height);
}

function normalizeFraction(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  // Alguns relatórios usam uma fração entre 0 e 1; outros podem expor a
  // unidade percentual. Normalize os dois formatos para a máquina de estados.
  return numericValue > 1 ? numericValue / 100 : numericValue;
}

function classifyScreenSample({
  lossFraction = null,
  rttMs = null,
  qualityLimitationReason = 'none',
  framesPerSecond = null,
  targetFrameRate = null
} = {}) {
  const loss = normalizeFraction(lossFraction);
  const rtt = rttMs === null || rttMs === undefined || rttMs === ''
    ? null
    : Number.isFinite(Number(rttMs)) ? Number(rttMs) : null;
  const fps = framesPerSecond === null || framesPerSecond === undefined ? null : Number(framesPerSecond);
  const targetFps = targetFrameRate === null || targetFrameRate === undefined ? null : Number(targetFrameRate);
  const fpsRatio = Number.isFinite(fps) && Number.isFinite(targetFps) && targetFps > 0
    ? fps / targetFps
    : null;
  const hasBandwidthProblem = qualityLimitationReason === 'bandwidth';
  const hasCpuProblem = qualityLimitationReason === 'cpu';
  const hasComparableMetric = loss !== null || rtt !== null || Number.isFinite(fps);
  if (!hasComparableMetric && qualityLimitationReason === 'none') return 'unknown';
  const bad = (loss !== null && loss >= BAD_LOSS_FRACTION)
    || (rtt !== null && rtt >= MAX_RTT_BAD_MS)
    || hasBandwidthProblem
    || (hasCpuProblem && fpsRatio !== null && fpsRatio < 0.7);
  if (bad) return 'bad';

  const good = (loss === null || loss < GOOD_LOSS_FRACTION)
    && (rtt === null || rtt < MIN_RTT_GOOD_MS)
    && !hasBandwidthProblem
    && !hasCpuProblem;
  return good ? 'good' : 'unknown';
}

function finiteOrNull(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

class ScreenQualityController {
  constructor({ desiredProfile = DEFAULT_SCREEN_PROFILE, now = () => Date.now() } = {}) {
    this.desiredProfile = normalizeScreenProfile(desiredProfile);
    this.effectiveProfile = this.desiredProfile;
    this.now = now;
    this.badSamples = 0;
    this.goodSamples = 0;
    this.lastChangeAt = -Infinity;
    this.lastDecision = 'initial';
  }

  setDesiredProfile(value) {
    const nextDesired = normalizeScreenProfile(value);
    const profileChanged = nextDesired !== this.desiredProfile;
    this.desiredProfile = nextDesired;
    const ladder = getScreenProfileLadder(nextDesired);
    // A manual selection is explicit: apply the selected level immediately.
    // Automatic adaptation only changes levels from update(), with hysteresis.
    if (profileChanged || !ladder.includes(this.effectiveProfile)) this.effectiveProfile = nextDesired;
    this.badSamples = 0;
    this.goodSamples = 0;
    this.lastDecision = 'profile-selected';
    return this.getState();
  }

  update(metrics = {}) {
    const classification = classifyScreenSample({
      lossFraction: metrics.lossFraction,
      rttMs: metrics.rttMs,
      qualityLimitationReason: metrics.qualityLimitationReason,
      framesPerSecond: metrics.framesPerSecond,
      targetFrameRate: metrics.targetFrameRate
    });
    if (classification === 'bad') {
      this.badSamples += 1;
      this.goodSamples = 0;
    } else if (classification === 'good') {
      this.goodSamples += 1;
      this.badSamples = 0;
    } else {
      this.badSamples = 0;
      this.goodSamples = 0;
    }

    const timestamp = finiteOrNull(metrics.timestamp) ?? this.now();
    const canChange = timestamp - this.lastChangeAt >= PROFILE_CHANGE_COOLDOWN_MS;
    let changed = false;
    let reason = classification;
    if (canChange && this.badSamples >= BAD_SAMPLE_LIMIT) {
      const next = getLowerScreenProfile(this.effectiveProfile, this.desiredProfile);
      if (next !== this.effectiveProfile) {
        this.effectiveProfile = next;
        this.lastChangeAt = timestamp;
        this.badSamples = 0;
        this.goodSamples = 0;
        changed = true;
        reason = 'network-degraded';
      }
    } else if (canChange && this.goodSamples >= GOOD_SAMPLE_LIMIT) {
      const next = getHigherScreenProfile(this.effectiveProfile, this.desiredProfile);
      if (next !== this.effectiveProfile) {
        this.effectiveProfile = next;
        this.lastChangeAt = timestamp;
        this.badSamples = 0;
        this.goodSamples = 0;
        changed = true;
        reason = 'network-stable';
      }
    }
    this.lastDecision = reason;
    return { changed, classification, reason, ...this.getState() };
  }

  getState() {
    return {
      desiredProfile: this.desiredProfile,
      effectiveProfile: this.effectiveProfile,
      badSamples: this.badSamples,
      goodSamples: this.goodSamples,
      lastChangeAt: this.lastChangeAt,
      lastDecision: this.lastDecision
    };
  }
}

function orderScreenCodecs(codecs = [], { allowAv1 = false } = {}) {
  const preferred = allowAv1
    ? ['video/av01', 'video/vp9', 'video/vp8']
    : ['video/vp9', 'video/vp8'];
  return codecs
    .map((codec, index) => ({ codec, index }))
    .sort((left, right) => {
      const leftMime = String(left.codec?.mimeType || '').toLowerCase();
      const rightMime = String(right.codec?.mimeType || '').toLowerCase();
      const leftRank = preferred.indexOf(leftMime);
      const rightRank = preferred.indexOf(rightMime);
      const normalizedLeftRank = leftRank < 0 ? preferred.length : leftRank;
      const normalizedRightRank = rightRank < 0 ? preferred.length : rightRank;
      return normalizedLeftRank - normalizedRightRank || left.index - right.index;
    })
    .map(({ codec }) => codec);
}

module.exports = {
  BAD_LOSS_FRACTION,
  BAD_SAMPLE_LIMIT,
  DEFAULT_SCREEN_PROFILE,
  GOOD_LOSS_FRACTION,
  GOOD_SAMPLE_LIMIT,
  PROFILE_CHANGE_COOLDOWN_MS,
  SCREEN_PROFILES,
  ScreenQualityController,
  calculateScreenScale,
  classifyScreenSample,
  getHigherScreenProfile,
  getLowerScreenProfile,
  getScreenProfile,
  getScreenProfileLadder,
  listScreenProfiles,
  normalizeFraction,
  normalizeScreenProfile,
  orderScreenCodecs
};
