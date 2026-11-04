import { timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  db,
  bucket,
  type Actor,
  type Data,
  hash,
  parse,
  identifier,
  commandId,
  fail,
  assertActive,
  requireDoc,
  id,
} from "../shared/core.js";

export async function requestDeletion(
  actor: Actor,
  raw: unknown,
): Promise<Data> {
  const input = parse(
    z
      .object({
        commandId,
        statusTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    raw,
  );
  if (
    Date.now() / 1000 - actor.authTime > 300 ||
    actor.authTime > Date.now() / 1000 + 60
  )
    fail("REAUTH_REQUIRED");
  const requestHash = hash({ ownerUid: actor.uid, ...input });
  return db.runTransaction(async (tx) => {
    const jobRef = db.doc(`accountDeletionJobs/${input.commandId}`),
      gateRef = db.doc(`accountStates/${actor.uid}`);
    const previous = (await tx.get(jobRef)).data();
    if (previous) {
      if (previous.requestHash !== requestHash) fail("COMMAND_REUSED");
      return {
        jobId: input.commandId,
        state: previous.state,
        acceptedAt: previous.createdAt,
      };
    }
    await assertActive(actor, tx);
    const gate = requireDoc(await tx.get(gateRef));
    const now = Timestamp.now();
    tx.update(gateRef, {
      status: "DELETING",
      deletionJobId: input.commandId,
      version: gate.version + 1,
      updatedAt: now,
    });
    tx.create(jobRef, {
      jobId: input.commandId,
      ownerUid: actor.uid,
      statusTokenHash: input.statusTokenHash,
      requestHash,
      state: "QUEUED",
      phase: "DISABLE_AUTH",
      createdAt: now,
      updatedAt: now,
    });
    return { jobId: input.commandId, state: "QUEUED", acceptedAt: now };
  });
}
export async function getDeletionStatus(
  _actor: Actor,
  raw: unknown,
): Promise<Data> {
  const input = parse(
    z
      .object({
        jobId: identifier,
        statusToken: z
          .string()
          .min(43)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .strict(),
    raw,
  );
  const provided = Buffer.from(hash(input.statusToken), "hex");
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`accountDeletionJobs/${input.jobId}`),
      job = (await tx.get(ref)).data();
    const expected = Buffer.from(job?.statusTokenHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(provided, expected) ||
      !job ||
      job.expiresAt?.toMillis() < Date.now()
    )
      fail("PERMISSION_DENIED");
    const window = Math.floor(Date.now() / 60_000),
      count = job.statusWindow === window ? (job.statusReads ?? 0) : 0;
    if (count >= 30) fail("RATE_LIMITED");
    tx.update(ref, { statusWindow: window, statusReads: count + 1 });
    return {
      jobId: input.jobId,
      state: job.state,
      phase: job.phase,
      lastErrorCode: job.lastErrorCode,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    };
  });
}
const missingAuth = (error: unknown): boolean =>
  (error as { code?: string }).code === "auth/user-not-found";
export async function runDeletionJob(jobId: string): Promise<void> {
  parse(identifier, jobId);
  const ref = db.doc(`accountDeletionJobs/${jobId}`);
  const leaseOwner = id();
  const job = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || current.state === "COMPLETE") return null;
    if (current.leaseUntil?.toMillis() > Date.now()) fail("JOB_IN_PROGRESS");
    tx.update(ref, {
      state: "RUNNING",
      leaseOwner,
      leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000),
      updatedAt: Timestamp.now(),
    });
    return current;
  });
  if (!job) return;
  const uid = parse(identifier, job.ownerUid);
  const checkpoint = async (phase: string) =>
    db.runTransaction(async (tx) => {
      const latest = requireDoc(await tx.get(ref));
      if (latest.leaseOwner !== leaseOwner || latest.state === "COMPLETE")
        fail("LEASE_LOST");
      tx.update(ref, {
        phase,
        leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000),
        updatedAt: Timestamp.now(),
      });
    });
  try {
    const phases = [
      "DISABLE_AUTH",
      "PURGE_REPORTS",
      "PURGE_AVATARS",
      "PURGE_USER",
      "DELETE_AUTH",
      "COMPLETE",
    ];
    let phase = phases.indexOf(job.phase);
    if (phase < 0) fail("JOB_INVALID");
    if (phase <= 0) {
      await getAuth()
        .updateUser(uid, { disabled: true })
        .catch((error) => {
          if (!missingAuth(error)) throw error;
        });
      await getAuth()
        .revokeRefreshTokens(uid)
        .catch((error) => {
          if (!missingAuth(error)) throw error;
        });
      await checkpoint("PURGE_REPORTS");
      phase = 1;
    }
    if (phase <= 1) {
      while (true) {
        const reports = await db
          .collection("contentReports")
          .where("ownerUid", "==", uid)
          .limit(100)
          .get();
        if (reports.empty) break;
        for (const report of reports.docs) await db.recursiveDelete(report.ref);
        await checkpoint("PURGE_REPORTS");
      }
      await checkpoint("PURGE_AVATARS");
      phase = 2;
    }
    if (phase <= 2) {
      await bucket.deleteFiles({ prefix: `avatars/${uid}/`, force: true });
      await checkpoint("PURGE_USER");
      phase = 3;
    }
    if (phase <= 3) {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await checkpoint("DELETE_AUTH");
      phase = 4;
    }
    if (phase <= 4) {
      await getAuth()
        .deleteUser(uid)
        .catch((error) => {
          if (!missingAuth(error)) throw error;
        });
    }
    await db.runTransaction(async (tx) => {
      const latest = requireDoc(await tx.get(ref));
      const now = Timestamp.now();
      if (latest.leaseOwner !== leaseOwner || latest.state === "COMPLETE")
        fail("LEASE_LOST");
      tx.delete(db.doc(`accountStates/${uid}`));
      tx.set(ref, {
        jobId,
        statusTokenHash: latest.statusTokenHash,
        state: "COMPLETE",
        phase: "COMPLETE",
        createdAt: latest.createdAt,
        completedAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 3600_000),
      });
    });
  } catch {
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (latest?.leaseOwner === leaseOwner && latest.state !== "COMPLETE")
        tx.update(ref, {
          state: "FAILED_RETRYABLE",
          lastErrorCode: "DELETION_RETRY_REQUIRED",
          leaseUntil: Timestamp.fromMillis(0),
          updatedAt: Timestamp.now(),
        });
    });
    throw new Error("DELETION_RETRY_REQUIRED");
  }
}
export const deletionHandlers = { requestDeletion, getDeletionStatus };
