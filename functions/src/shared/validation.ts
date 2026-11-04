import { type DocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { fail } from "./errors.js";
import { type Data } from "./types.js";

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
    throw new HttpsError("invalid-argument", "Dữ liệu không hợp lệ.", {
      code: "VALIDATION_FAILED",
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function requireDoc(
  snapshot: DocumentSnapshot,
  code = "NOT_FOUND",
): Data {
  if (!snapshot.exists) fail(code);
  return snapshot.data()!;
}

export function checkVersion(actual: unknown, expected: number): void {
  if (actual !== expected)
    fail("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại.");
}
