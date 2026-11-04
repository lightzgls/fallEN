import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { db } from "../infrastructure/firebase/runtime.js";
import { assertActive } from "./access.js";
import { fail } from "./errors.js";
import { commandId, identifier, parse } from "./validation.js";
import { hash, serialize } from "./values.js";
import { type Actor, type Data } from "./types.js";

const maxReceiptBytes = 750 * 1024;

/** Business writes and their receipt share a transaction; replay precedes stale-version checks. */
export async function command(
  actor: Actor,
  kind: string,
  input: Data,
  callback: (transaction: Transaction, now: Timestamp) => Promise<Data>,
): Promise<Data> {
  const key = parse(identifier, input.commandId ?? input.eventId);
  const requestHash = hash({ kind, input });
  return db.runTransaction(async (transaction) => {
    await assertActive(actor, transaction);
    const reference = db.doc(`users/${actor.uid}/commands/${key}`);
    const previous = (await transaction.get(reference)).data();
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
    const now = Timestamp.now();
    const receipt = await callback(transaction, now);
    if (
      Buffer.byteLength(JSON.stringify(serialize(receipt))) > maxReceiptBytes
    ) {
      fail(
        "VALIDATION_FAILED",
        "Kết quả vượt giới hạn triển khai. Chọn nguồn nhỏ hơn.",
      );
    }
    transaction.create(reference, {
      kind,
      requestHash,
      status: "SUCCEEDED",
      receipt,
      createdAt: now,
    });
    return receipt;
  });
}

export async function getCommandStatus(
  actor: Actor,
  raw: unknown,
): Promise<Data> {
  const input = parse(z.object({ commandId }).strict(), raw);
  await assertActive(actor);
  const document = (
    await db.doc(`users/${actor.uid}/commands/${input.commandId}`).get()
  ).data();
  return document
    ? {
        status: document.status,
        receipt: document.receipt,
        error: document.error,
        progress: document.progress,
      }
    : { status: "ABSENT" };
}
