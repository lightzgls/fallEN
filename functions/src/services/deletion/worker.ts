import type { DeletionStore } from "../../contracts/deletion/store.js";
import { fail } from "../../shared/errors.js";
import { id } from "../../shared/values.js";

export async function runDeletionJob(
  jobId: string,
  store: DeletionStore,
): Promise<void> {
  const leaseOwner = id();
  const job = await store.transaction(jobId, async (tx) => {
    const current = await tx.readJob();
    if (!current || current.state === "COMPLETE") return null;
    if ((current.leaseUntil?.getTime() ?? 0) > store.now().getTime())
      fail("JOB_IN_PROGRESS");
    tx.updateJob({
      state: "RUNNING",
      leaseOwner,
      leaseUntil: new Date(store.now().getTime() + 10 * 60_000),
      updatedAt: tx.now,
    });
    return current;
  });
  if (!job) return;
  const uid = job.ownerUid ?? fail("JOB_INVALID");
  const checkpoint = (phase: string) =>
    store.transaction(jobId, async (tx) => {
      const latest = (await tx.readJob()) ?? fail("NOT_FOUND");
      if (latest.leaseOwner !== leaseOwner || latest.state === "COMPLETE")
        fail("LEASE_LOST");
      tx.updateJob({
        phase,
        leaseUntil: new Date(store.now().getTime() + 10 * 60_000),
        updatedAt: tx.now,
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
      await store.disableAuth(uid);
      await store.revokeTokens(uid);
      await checkpoint("PURGE_REPORTS");
      phase = 1;
    }
    if (phase <= 1) {
      while (true) {
        const reports = await store.listOwnedReports(uid);
        if (!reports.length) break;
        for (const reportId of reports) await store.deleteReport(reportId);
        await checkpoint("PURGE_REPORTS");
      }
      await checkpoint("PURGE_AVATARS");
      phase = 2;
    }
    if (phase <= 2) {
      await store.deleteAvatars(uid);
      await checkpoint("PURGE_USER");
      phase = 3;
    }
    if (phase <= 3) {
      await store.deletePersonalData(uid);
      await checkpoint("DELETE_AUTH");
      phase = 4;
    }
    if (phase <= 4) await store.deleteAuth(uid);
    await store.transaction(jobId, async (tx) => {
      const latest = (await tx.readJob()) ?? fail("NOT_FOUND");
      if (latest.leaseOwner !== leaseOwner || latest.state === "COMPLETE")
        fail("LEASE_LOST");
      tx.completeJob(uid, {
        jobId,
        statusTokenHash: latest.statusTokenHash,
        state: "COMPLETE",
        phase: "COMPLETE",
        createdAt: latest.createdAt,
        completedAt: tx.now,
        expiresAt: new Date(tx.now.getTime() + 7 * 24 * 3600_000),
      });
    });
  } catch {
    await store.transaction(jobId, async (tx) => {
      const latest = await tx.readJob();
      if (latest?.leaseOwner === leaseOwner && latest.state !== "COMPLETE")
        tx.updateJob({
          state: "FAILED_RETRYABLE",
          lastErrorCode: "DELETION_RETRY_REQUIRED",
          leaseUntil: new Date(0),
          updatedAt: tx.now,
        });
    });
    throw new Error("DELETION_RETRY_REQUIRED");
  }
}
