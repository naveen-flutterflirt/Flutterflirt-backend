/**
 * High-performance In-Memory TTL Cache for Backend APIs
 * Provides instant sub-millisecond responses without repetitive DB roundtrips.
 * Automatically purges on mutations (Create, Update, Delete).
 */
class MemoryCache {
  constructor(defaultTtlSeconds = 60) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  set(key, value, ttlSeconds = null) {
    const ttlMs = ttlSeconds !== null ? ttlSeconds * 1000 : this.defaultTtlMs;
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  del(key) {
    this.cache.delete(key);
  }

  /**
   * Delete keys matching prefix or pattern (e.g. 'blogs:')
   */
  invalidatePattern(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Global singleton cache instance with 60 seconds default TTL
const blogCache = new MemoryCache(60);

module.exports = {
  blogCache,
  MemoryCache,
};
