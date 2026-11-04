import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import type { AvatarCleanupStore } from "../../contracts/profile/cleanup.js";
import { db, bucket } from "../firebase/runtime.js";
import { plainValue } from "../firebase/records.js";
import { parse } from "../../shared/validation.js";
const cleanupAsset = z.object({
  ownerUid: z.string(),
  state: z.string(),
  expiresAt: z.date().nullable().optional(),
  stagingPath: z.string().optional(),
  storagePath: z.string().optional(),
});
export const avatarCleanupStore: AvatarCleanupStore = {
  now: () => new Date(),
  async candidates(before) {
    const page = await db
      .collectionGroup("profileAssets")
      .where("state", "in", ["STAGING", "RETIRING"])
      .where("expiresAt", "<=", Timestamp.fromDate(before))
      .limit(100)
      .get();
    return page.docs.map((doc) => ({ key: doc.ref.path, assetId: doc.id }));
  },
  transaction(candidate, work) {
    const ref = db.doc(candidate.key);
    return db.runTransaction((tx) =>
      work({
        async readAsset() {
          const doc = await tx.get(ref);
          return doc.exists
            ? parse(cleanupAsset, plainValue(doc.data()))
            : undefined;
        },
        async currentAvatar(uid) {
          const doc = await tx.get(db.doc(`users/${uid}`));
          return parse(
            z.object({ avatarAssetId: z.string().optional() }),
            doc.data() ?? {},
          ).avatarAssetId;
        },
        lease(until) {
          tx.update(ref, { cleanupLeaseUntil: until });
        },
      }),
    );
  },
  async deleteFile(path) {
    await bucket.file(path).delete({ ignoreNotFound: true });
  },
  async deleteAsset(candidate) {
    await db.doc(candidate.key).delete();
  },
};
