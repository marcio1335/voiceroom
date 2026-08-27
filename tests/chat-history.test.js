const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ChatHistoryStore } = require('../shared/chat-history');

test('persiste chat local e entrega histórico somente ao público presente', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceroom-chat-'));
  const file = path.join(directory, 'history.json');
  try {
    const store = new ChatHistoryStore(file);
    store.append({
      roomCode: 'VPN234',
      author: { participantId: 'host', displayName: 'Host', avatar: null },
      kind: 'text',
      content: 'link privado',
      audienceProfileIds: ['profile-host', 'profile-present']
    });

    const reopened = new ChatHistoryStore(file);
    assert.equal(reopened.list('VPN234', 'profile-present').length, 1);
    assert.equal(reopened.list('VPN234', 'profile-late').length, 0);
    assert.equal(reopened.list('OTHER', 'profile-present').length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
