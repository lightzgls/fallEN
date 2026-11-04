import { fail } from "../../shared/errors.js";
export function required<T>(value: T | undefined, code = "NOT_FOUND"): T {
  if (value === undefined) return fail(code);
  return value;
}
