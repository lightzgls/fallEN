import { Timestamp } from "firebase-admin/firestore";
import { bucket, db } from "../../shared/core.js";

export async function cleanupAvatars(): Promise<void> {
  const expired = await db
    .collectionGroup("profileAssets")
    .where("state", "in", ["STAGING", "RETIRING"])
    .where("expiresAt", "<=", Timestamp.now())
    .limit(100)
    .get();
  for (const candidate of expired.docs) {
    const asset = await db.runTransaction(async (tx) => {
      const latest = (await tx.get(candidate.ref)).data();
      if (
        !latest ||
        !["STAGING", "RETIRING"].includes(latest.state) ||
        latest.expiresAt?.toMillis() > Date.now()
      )
        return null;
      const user = (await tx.get(db.doc(`users/${latest.ownerUid}`))).data();
      if (user?.avatarAssetId === candidate.id) return null;
      tx.update(candidate.ref, {
        cleanupLeaseUntil: Timestamp.fromMillis(Date.now() + 5 * 60_000),
      });
      return latest;
    });
    if (!asset) continue;
    for (const path of [asset.stagingPath, asset.storagePath].filter(Boolean))
      await bucket.file(path).delete({ ignoreNotFound: true });
    await candidate.ref.delete();
  }
}
