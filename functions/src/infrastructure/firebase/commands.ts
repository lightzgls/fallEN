import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./runtime.js";
import { assertActive } from "./access.js";
import { fail } from "../../shared/errors.js";
import { identifier, parse } from "../../shared/validation.js";
import { hash, serialize } from "../../shared/values.js";
import type { Actor, Data } from "../../shared/types.js";

const maxReceiptBytes = 750 * 1024;
/** Gate, receipt replay and application writes share a single retriable transaction. */
export function command(
  actor: Actor,
  kind: string,
  input: Data,
  callback: (tx: Transaction, now: Timestamp) => Promise<Data>,
): Promise<Data> {
  const key = parse(identifier, input.commandId ?? input.eventId),
    requestHash = hash({ kind, input });
  return db.runTransaction(async (tx) => {
    await assertActive(actor, tx);
    const ref = db.doc(`users/${actor.uid}/commands/${key}`),
      previous = (await tx.get(ref)).data();
    if (previous) {
      if (previous.kind !== kind || previous.requestHash !== requestHash)
        fail("COMMAND_REUSED");
      if (previous.status === "SUCCEEDED") return previous.receipt;
      if (previous.status === "IN_PROGRESS")
        return {
          status: "IN_PROGRESS",
          commandId: key,
          progress: previous.progress,
        };
      fail(previous.error?.code || "COMMAND_FAILED");
    }
    const now = Timestamp.now(),
      receipt = await callback(tx, now);
    if (Buffer.byteLength(JSON.stringify(serialize(receipt))) > maxReceiptBytes)
      fail(
        "VALIDATION_FAILED",
        "Kết quả vượt giới hạn triển khai. Chọn nguồn nhỏ hơn.",
      );
    tx.create(ref, {
      kind,
      requestHash,
      status: "SUCCEEDED",
      receipt,
      createdAt: now,
    });
    return receipt;
  });
}
