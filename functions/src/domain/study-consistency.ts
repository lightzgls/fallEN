import { fail } from "../shared/errors.js";
export function requireRecord<T>(value: T | undefined, code = "NOT_FOUND"): T {
  if (value === undefined) fail(code);
  return value;
}
export function requireVersion(actual: unknown, expected: number): void {
  if (actual !== expected)
    fail("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại.");
}
