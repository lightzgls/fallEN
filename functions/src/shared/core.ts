/** Compatibility barrel. New shared modules depend on each other directly to avoid cycles. */
export { db, bucket } from "../infrastructure/firebase/runtime.js";
export { type Actor, type Data } from "./types.js";
export { dayKey, addDays } from "./clock.js";
export { fail } from "./errors.js";
export {
  identifier,
  commandId,
  version,
  empty,
  parse,
  requireDoc,
  checkVersion,
} from "./validation.js";
export { id, hash, serialize, cursorEncode, cursorDecode } from "./values.js";
export { assertAdmin, assertActive } from "./access.js";
export { command, getCommandStatus } from "./idempotency.js";
