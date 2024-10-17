/**
 * This is the default solution for caching MTE State.
 * MTE State values will be saved in-memory here, unless the consumer
 * chooses to provide their own Getter and Setter methods for retrieving
 * state from their own cache solutions; Redis, Memcached, etc.
 */

// The store
const store = new Map();

// Put an Item in the store
export async function setItem(id: string, value: string) {
  const timestamp = Date.now();
  store.set(id, { value, timestamp });
}

/**
 * Set an item in the memory cache.
 * If it is a decoder, do NOT remove it's state from cache.
 * Two or more decoders can be created with the same state at the same time. This is NOT true for encoders.
 */
export async function takeItem(id: string): Promise<string | null> {
  const item = store.get(id);
  if (id.includes("encoder")) {
    store.delete(id);
  }
  return item.value;
}

// delete items more than 30m (in ms) old
function checkAndDeleteOldItems() {
  const now = Date.now();
  for (const [id, { timestamp }] of store.entries()) {
    if (now - timestamp > 1800000) {
      store.delete(id);
    }
  }
}
setInterval(checkAndDeleteOldItems, 60000); // 1m
