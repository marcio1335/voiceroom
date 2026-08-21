class RateLimiter {
  constructor({ windowMs = 10_000, max = 30 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.entries = new Map();
  }

  allow(key, now = Date.now()) {
    const timestamps = this.entries.get(key) || [];
    const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
    if (active.length >= this.max) {
      this.entries.set(key, active);
      return false;
    }
    active.push(now);
    this.entries.set(key, active);
    if (this.entries.size > 5000) {
      this.cleanup(now);
    }
    return true;
  }

  cleanup(now = Date.now()) {
    for (const [key, timestamps] of this.entries) {
      const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
      if (active.length === 0) {
        this.entries.delete(key);
      } else {
        this.entries.set(key, active);
      }
    }
  }
}

module.exports = { RateLimiter };

