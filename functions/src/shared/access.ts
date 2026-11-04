import { type Transaction } from "firebase-admin/firestore";
import { db } from "../infrastructure/firebase/runtime.js";
import { fail } from "./errors.js";
import { type Actor } from "./types.js";

export function assertAdmin(actor: Actor): void {
  if (!actor.contentAdmin) fail("PERMISSION_DENIED");
}

export async function assertActive(
  actor: Actor,
  transaction?: Transaction,
): Promise<void> {
  if (!actor.uid) fail("UNAUTHENTICATED");
  const reference = db.doc(`accountStates/${actor.uid}`);
  const snapshot = await (transaction
    ? transaction.get(reference)
    : reference.get());
  const state = snapshot.data();
  if (state?.status === "DELETING") fail("ACCOUNT_DELETING");
  if (state?.status !== "ACTIVE") fail("PROFILE_PENDING");
}
