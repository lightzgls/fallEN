import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import type { Data } from "../../shared/types.js";
import { fail } from "../../shared/errors.js";

/** SDK timestamp values stop at the persistence boundary. Date writes retain Timestamp storage. */
export function plainValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(plainValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plainValue(item)]),
    );
  return value;
}

export function plainRecord(data: Data): Data {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, plainValue(value)]),
  );
}

/** Legacy infrastructure readers retain raw SDK values until their feature codec runs. */
export function requireDoc(
  snapshot: DocumentSnapshot,
  code = "NOT_FOUND",
): Data {
  if (!snapshot.exists) fail(code);
  return snapshot.data()!;
}
