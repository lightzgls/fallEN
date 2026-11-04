import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { fail } from "./errors.js";
import { type Data } from "./types.js";

export const id = (): string => randomUUID();

function canonical(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function hash(value: unknown): string {
  const encoded =
    typeof value === "string" ? value : JSON.stringify(canonical(value));
  return createHash("sha256").update(encoded).digest("hex");
}

export function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

export function cursorEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cursorDecode(value: string): Data {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    );
    if (!isRecord(parsed)) fail("VALIDATION_FAILED");
    return parsed;
  } catch {
    return fail("VALIDATION_FAILED", "Cursor không hợp lệ.");
  }
}
