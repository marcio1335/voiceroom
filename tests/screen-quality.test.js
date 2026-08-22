const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BAD_SAMPLE_LIMIT,
  GOOD_SAMPLE_LIMIT,
  SCREEN_PROFILES,
  ScreenQualityController,
  calculateScreenScale,
  classifyScreenSample,
  getHigherScreenProfile,
  getLowerScreenProfile,
  getScreenProfile,
  normalizeScreenProfile,
  orderScreenCodecs
} = require('../client/src/renderer/screen-quality');

test('normaliza perfis novos e preferências antigas', () => {
  assert.equal(normalizeScreenProfile('480p'), 'economic');
  assert.equal(normalizeScreenProfile('720p'), 'balanced');
  assert.equal(normalizeScreenProfile('1080p'), 'sharp');
  assert.equal(normalizeScreenProfile('720p60'), 'fluid');
  assert.equal(normalizeScreenProfile('desconhecido'), 'balanced');
  assert.equal(getScreenProfile('sharp').maxBitrate, 5_000_000);
});

test('calcula escala sem ampliar nem deformar a fonte', () => {
  assert.equal(calculateScreenScale(1920, 1080, 'sharp'), 1);
  assert.equal(calculateScreenScale(1920, 1080, 'balanced'), 1.5);
  assert.equal(calculateScreenScale(3440, 1440, 'balanced'), 2.6875);
  assert.equal(calculateScreenScale(800, 600, 'balanced'), 1);
});

test('classifica rede ruim, estável e inconclusiva', () => {
  assert.equal(classifyScreenSample({ lossFraction: 0.06, rttMs: 40 }), 'bad');
  assert.equal(classifyScreenSample({ lossFraction: 0.01, rttMs: 80 }), 'good');
  assert.equal(classifyScreenSample({ qualityLimitationReason: 'bandwidth' }), 'bad');
  assert.equal(classifyScreenSample({ lossFraction: null, rttMs: null }), 'unknown');
  assert.equal(classifyScreenSample({ lossFraction: 0.03, rttMs: 220 }), 'unknown');
});

test('escadas respeitam o perfil escolhido como teto', () => {
  assert.equal(getLowerScreenProfile('sharp', 'sharp'), 'balanced');
  assert.equal(getHigherScreenProfile('balanced', 'sharp'), 'sharp');
  assert.equal(getHigherScreenProfile('balanced', 'balanced'), 'balanced');
  assert.equal(getLowerScreenProfile('economic', 'economic'), 'economic');
});

test('controlador reduz após três amostras ruins e sobe após dez boas', () => {
  let now = 1_000_000;
  const controller = new ScreenQualityController({ desiredProfile: 'sharp', now: () => now });
  assert.equal(controller.effectiveProfile, 'sharp');

  for (let index = 0; index < BAD_SAMPLE_LIMIT - 1; index += 1) {
    now += 2_000;
    assert.equal(controller.update({ timestamp: now, lossFraction: 0.08, rttMs: 400 }).changed, false);
  }
  now += 2_000;
  const downgrade = controller.update({ timestamp: now, lossFraction: 0.08, rttMs: 400 });
  assert.equal(downgrade.changed, true);
  assert.equal(downgrade.effectiveProfile, 'balanced');

  // O cooldown evita uma subida imediata após a queda.
  for (let index = 0; index < GOOD_SAMPLE_LIMIT; index += 1) {
    now += 2_000;
    const decision = controller.update({ timestamp: now, lossFraction: 0.01, rttMs: 80 });
    if (index < 6) assert.equal(decision.changed, false);
  }
  assert.equal(controller.effectiveProfile, 'sharp');
});

test('trocar o perfil limpa contadores e mantém estado válido', () => {
  const controller = new ScreenQualityController({ desiredProfile: 'balanced' });
  controller.update({ lossFraction: 0.08, rttMs: 400, timestamp: 1_000 });
  controller.setDesiredProfile('fluid');
  assert.equal(controller.desiredProfile, 'fluid');
  assert.equal(controller.effectiveProfile, 'fluid');
  assert.equal(controller.badSamples, 0);
  assert.equal(controller.goodSamples, 0);
  assert.ok(['fluid', 'balanced', 'economic'].includes(controller.effectiveProfile));
});

test('ordena VP9 e VP8 sem remover codecs auxiliares', () => {
  const codecs = [
    { mimeType: 'video/rtx', payloadType: 127 },
    { mimeType: 'video/vp8', payloadType: 96 },
    { mimeType: 'video/vp9', payloadType: 98 },
    { mimeType: 'video/ulpfec', payloadType: 122 }
  ];
  const ordered = orderScreenCodecs(codecs);
  assert.equal(ordered[0].mimeType, 'video/vp9');
  assert.equal(ordered[1].mimeType, 'video/vp8');
  assert.equal(ordered.length, codecs.length);
  assert.deepEqual(Object.keys(SCREEN_PROFILES).sort(), ['balanced', 'economic', 'fluid', 'sharp']);
});
