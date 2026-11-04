import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import type { DeletionStore } from "../../contracts/deletion/store.js";
import { db, bucket } from "../firebase/runtime.js";
import { plainValue } from "../firebase/records.js";
import { decodeGate } from "../profile/codecs.js";
import { assertActive } from "../firebase/access.js";
import { fail } from "../../shared/errors.js";
import { identifier, parse } from "../../shared/validation.js";

const jobSchema = z.object({
  jobId: identifier,
  ownerUid: identifier.optional(),
  statusTokenHash: z.string(),
  requestHash: z.string().optional(),
  state: z.string(),
  phase: z.string(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  leaseOwner: z.string().optional(),
  leaseUntil: z.date().optional(),
  statusWindow: z.number().optional(),
  statusReads: z.number().optional(),
  lastErrorCode: z.string().optional(),
});
function missingAuth(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "auth/user-not-found"
  );
}
async function ignoreMissing(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!missingAuth(error)) throw error;
  }
}
export const deletionStore: DeletionStore = {
  now: () => new Date(),
  transaction(jobId, work) {
    const ref = db.doc(`accountDeletionJobs/${jobId}`);
    return db.runTransaction(async (tx) =>
      work({
        now: new Date(),
        async readJob() {
          const doc = await tx.get(ref);
          return doc.exists
            ? parse(jobSchema, plainValue(doc.data()))
            : undefined;
        },
        assertActive: (actor) => assertActive(actor, tx),
        async readGate(uid) {
          const doc = await tx.get(db.doc(`accountStates/${uid}`));
          if (!doc.exists) fail("NOT_FOUND");
          return decodeGate(doc.data());
        },
        updateGate(uid, patch) {
          tx.update(db.doc(`accountStates/${uid}`), patch);
        },
        createJob(job) {
          tx.create(ref, { ...job });
        },
        updateJob(patch) {
          tx.update(ref, { ...patch });
        },
        completeJob(uid, job) {
          tx.delete(db.doc(`accountStates/${uid}`));
          tx.set(ref, { ...job });
        },
      }),
    );
  },
  disableAuth: (uid) =>
    ignoreMissing(() => getAuth().updateUser(uid, { disabled: true })),
  revokeTokens: (uid) =>
    ignoreMissing(() => getAuth().revokeRefreshTokens(uid)),
  async listOwnedReports(uid) {
    const page = await db
      .collection("contentReports")
      .where("ownerUid", "==", uid)
      .limit(100)
      .get();
    return page.docs.map((doc) => doc.id);
  },
  async deleteReport(id) {
    await db.recursiveDelete(db.doc(`contentReports/${id}`));
  },
  async deleteAvatars(uid) {
    await bucket.deleteFiles({ prefix: `avatars/${uid}/`, force: true });
  },
  async deletePersonalData(uid) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
  },
  deleteAuth: (uid) => ignoreMissing(() => getAuth().deleteUser(uid)),
};
