const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class ModerationStore {
  constructor(filePath = null, now = () => Date.now()) {
    this.filePath = filePath;
    this.now = now;
    this.bans = [];
    this.#load();
  }

  add({ profileId, displayName, durationSeconds = 0 }) {
    this.revoke(profileId, { save: false });
    const seconds = Math.max(0, Math.min(31_536_000, Math.floor(Number(durationSeconds) || 0)));
    const ban = {
      id: crypto.randomUUID(),
      profileId,
      displayName,
      createdAt: this.now(),
      expiresAt: seconds ? this.now() + seconds * 1_000 : null
    };
    this.bans.push(ban);
    this.#save();
    return ban;
  }

  getActive(profileId) {
    this.#prune();
    return this.bans.find((ban) => ban.profileId === profileId) || null;
  }

  list() {
    this.#prune();
    return this.bans.map(({ profileId: _privateProfileId, ...ban }) => ban);
  }

  revoke(idOrProfileId, { save = true } = {}) {
    const previousLength = this.bans.length;
    this.bans = this.bans.filter((ban) => ban.id !== idOrProfileId && ban.profileId !== idOrProfileId);
    if (save && this.bans.length !== previousLength) this.#save();
    return this.bans.length !== previousLength;
  }

  #prune() {
    const now = this.now();
    const previousLength = this.bans.length;
    this.bans = this.bans.filter((ban) => ban.expiresAt === null || ban.expiresAt > now);
    if (this.bans.length !== previousLength) this.#save();
  }

  #load() {
    if (!this.filePath) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(parsed)) this.bans = parsed;
      this.#prune();
    } catch { /* nenhum ban salvo */ }
  }

  #save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.bans), 'utf8');
      fs.renameSync(temporaryPath, this.filePath);
    } catch { /* a moderação em memória continua ativa */ }
  }
}

module.exports = { ModerationStore };
