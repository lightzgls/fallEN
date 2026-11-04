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
  checkVersion,
} from "./validation.js";
export { requireDoc } from "../infrastructure/firebase/records.js";
export { id, hash, serialize, cursorEncode, cursorDecode } from "./values.js";
export { assertAdmin } from "../domain/account.js";
export { assertActive } from "../infrastructure/firebase/access.js";
export { command } from "../infrastructure/firebase/commands.js";
