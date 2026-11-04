import { objectId } from "../../domain/backend.js";
import { fail, type Data } from "../../shared/core.js";

export function encodeCursor(value: Data) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor(
  value: string,
  uid: string,
  kind: string,
): { time: number; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      parsed.uid !== uid ||
      parsed.kind !== kind ||
      !Number.isFinite(parsed.time) ||
      !objectId.safeParse(parsed.id).success
    )
      throw Error();
    return parsed;
  } catch {
    return fail("VALIDATION_FAILED", "Cursor does not match this request");
  }
}
