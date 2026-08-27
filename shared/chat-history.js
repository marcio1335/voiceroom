const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_HISTORY_MESSAGES = 1_000;

class ChatHistoryStore {
  constructor(filePath = null) {
    this.filePath = filePath;
    this.messages = [];
    this.#load();
  }

  list(roomCode, profileId) {
    if (!profileId) return [];
    return this.messages
      .filter((message) => message.roomCode === roomCode && message.audienceProfileIds.includes(profileId))
      .slice(-250)
      .map(({ audienceProfileIds, ...message }) => message);
  }

  append({ roomCode, author, kind, content, audienceProfileIds }) {
    const message = {
      id: crypto.randomUUID(),
      roomCode,
      author,
      kind,
      content,
      sentAt: Date.now(),
      audienceProfileIds: [...new Set(audienceProfileIds.filter(Boolean))]
    };
    this.messages.push(message);
    if (this.messages.length > MAX_HISTORY_MESSAGES) this.messages.splice(0, this.messages.length - MAX_HISTORY_MESSAGES);
    this.#save();
    const { audienceProfileIds: _privateAudience, ...publicMessage } = message;
    return publicMessage;
  }

  #load() {
    if (!this.filePath) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(parsed)) this.messages = parsed.slice(-MAX_HISTORY_MESSAGES);
    } catch { /* histórico ausente ou inválido começa vazio */ }
  }

  #save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.messages), 'utf8');
      fs.renameSync(temporaryPath, this.filePath);
    } catch { /* chat ao vivo continua mesmo se o disco estiver indisponível */ }
  }
}

module.exports = { ChatHistoryStore, MAX_HISTORY_MESSAGES };
