import type { Transaction } from "firebase-admin/firestore";
import type { Actor } from "../../contracts/callable.js";
import { assertActiveAccount } from "../../domain/account.js";
import { fail } from "../../shared/errors.js";
import { db } from "./runtime.js";

export async function assertActive(
  actor: Actor,
  tx?: Transaction,
): Promise<void> {
  if (!actor.uid) fail("UNAUTHENTICATED");
  const ref = db.doc(`accountStates/${actor.uid}`);
  const doc = await (tx ? tx.get(ref) : ref.get());
  assertActiveAccount(actor, doc.data());
}
