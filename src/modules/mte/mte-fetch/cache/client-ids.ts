import { getCacheItem, setCacheItem, deleteCacheItem } from "./cache";

// get clientId from cache
export function getClientId(origin: string) {
  const key = prefixKey(origin);
  return getCacheItem<string | undefined>(key);
}

// set clientId in cache
export function setClientId(origin: string, clientId: string) {
  const key = prefixKey(origin);
  setCacheItem(key, clientId);
}

// delete clientId
export function deleteClientId(origin: string) {
  const key = prefixKey(origin);
  deleteCacheItem(key);
}

// prefix keys with 'clientid:'
function prefixKey(key: string) {
  return `clientid:${key}`;
}
