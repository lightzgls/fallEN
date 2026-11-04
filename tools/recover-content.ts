import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, requireDoc } from "../functions/src/shared/core.js";

if (
  !process.env.GCLOUD_PROJECT ||
  !process.argv.includes("--confirm-orphan-recovery")
)
  throw new Error(
    "Operator only: set GCLOUD_PROJECT and pass --confirm-orphan-recovery. Requires IAM/ADC. Only jobs whose owner was deleted are unlocked.",
  );
async function ownerUnavailable(uid: string): Promise<boolean> {
  const gate = (await db.doc(`accountStates/${uid}`).get()).data();
  if (gate?.status === "DELETING") return true;
  if (gate?.status === "ACTIVE") return false;
  try {
    await getAuth().getUser(uid);
    return false;
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found")
      return true;
    throw error;
  }
}
const revisions = await db
  .collectionGroup("revisions")
  .where("state", "==", "VALIDATING")
  .get();
for (const revision of revisions.docs) {
  const owner = revision.data().publishActorUid;
  if (!owner || !(await ownerUnavailable(owner))) continue;
  await db.runTransaction(async (tx) => {
    const current = requireDoc(await tx.get(revision.ref));
    const gate = (await tx.get(db.doc(`accountStates/${owner}`))).data();
    if (
      current.state !== "VALIDATING" ||
      current.publishActorUid !== owner ||
      gate?.status === "ACTIVE"
    )
      return;
    tx.update(revision.ref, {
      state: "DRAFT",
      publishCommandId: FieldValue.delete(),
      publishActorUid: FieldValue.delete(),
      lastRecovery: { reason: "OWNER_DELETED", at: Timestamp.now() },
    });
  });
}
const imports = await db
  .collection("contentImports")
  .where("status", "==", "APPLYING")
  .get();
for (const item of imports.docs) {
  const owner = item.data().applyActorUid;
  if (!owner || !(await ownerUnavailable(owner))) continue;
  await db.runTransaction(async (tx) => {
    const current = requireDoc(await tx.get(item.ref));
    const gate = (await tx.get(db.doc(`accountStates/${owner}`))).data();
    if (
      current.status !== "APPLYING" ||
      current.applyActorUid !== owner ||
      gate?.status === "ACTIVE"
    )
      return;
    tx.update(item.ref, {
      status: "FAILED",
      error: { code: "OWNER_DELETED" },
      lastRecovery: { reason: "OWNER_DELETED", at: Timestamp.now() },
    });
  });
}
console.log(
  "Orphan recovery completed; published data and already-applied rows were preserved.",
);
