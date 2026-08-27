const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ModerationStore } = require('../shared/moderation-store');

test('persiste ban permanente e expira ban temporário', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceroom-moderation-'));
  const file = path.join(directory, 'moderation.json');
  let now = 1_000;
  try {
    const store = new ModerationStore(file, () => now);
    store.add({ profileId: 'profile-permanent', displayName: 'Permanente' });
    store.add({ profileId: 'profile-temporary', displayName: 'Temporário', durationSeconds: 10 });
    assert.equal(store.list().length, 2);
    now += 11_000;
    assert.equal(store.getActive('profile-temporary'), null);
    assert.ok(store.getActive('profile-permanent'));
    const reopened = new ModerationStore(file, () => now);
    assert.equal(reopened.list().length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
