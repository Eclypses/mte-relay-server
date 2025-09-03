const cache = new Map<
  string,
  {
    timestamp: number;
    value: any;
  }
>();

// every minute, scan and remove items > 1 hour old
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.timestamp > 3600000) {
      cache.delete(key);
    }
  }
}, 60000);

export function setCacheItem(key: string, value: any): void {
  cache.set(key, {
    timestamp: Date.now(),
    value,
  });
}

export function getCacheItem<T>(key: string): T | undefined {
  const item = cache.get(key);
  if (!item) {
    return undefined;
  }
  return item.value;
}

export function deleteCacheItem(key: string): void {
  cache.delete(key);
}
