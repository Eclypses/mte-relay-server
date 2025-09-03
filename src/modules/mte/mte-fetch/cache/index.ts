export { getClientId, setClientId, deleteClientId } from "./client-ids";
export { getOriginStatus, setOriginStatus } from "./origin-status";
export {
  addPairIdToQueue,
  deletePairIdFromQueue,
  getNextPairIdFromQueue,
} from "./pair-ids";
export type { OriginStatus } from "./origin-status";

import { cache } from "../../index";
export const setEncDecState = cache.saveState;
export const getEncDecState = cache.takeState;
