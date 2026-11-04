import { z } from "zod";
import { ApplicationError, fail } from "./errors.js";

export const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
export const commandId = identifier;
export const version = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const empty = z.object({}).strict();

export function parse<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "Dữ liệu không hợp lệ.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function checkVersion(actual: unknown, expected: number): void {
  if (actual !== expected)
    fail("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại.");
}
