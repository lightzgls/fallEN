import { timingSafeEqual } from "node:crypto";
import type { Actor } from "../contracts/callable.js";
import type {
  RequestDeletionInput,
  DeletionStatusInput,
} from "../contracts/deletion/requests.js";
import type { DeletionStore } from "../contracts/deletion/store.js";
import { fail } from "../shared/errors.js";
import { hash } from "../shared/values.js";
import { runDeletionJob } from "./deletion/worker.js";

export function createDeletionService(store: DeletionStore) {
  return {
    requestDeletion: (actor: Actor, input: RequestDeletionInput) =>
      requestDeletion(actor, input, store),
    getDeletionStatus: (_actor: Actor, input: DeletionStatusInput) =>
      getDeletionStatus(input, store),
    runDeletionJob: (jobId: string) => runDeletionJob(jobId, store),
  };
}
async function requestDeletion(
  actor: Actor,
  input: RequestDeletionInput,
  store: DeletionStore,
) {
  const nowSeconds = store.now().getTime() / 1000;
  if (nowSeconds - actor.authTime > 300 || actor.authTime > nowSeconds + 60)
    fail("REAUTH_REQUIRED");
  const requestHash = hash({ ownerUid: actor.uid, ...input });
  return store.transaction(input.commandId, async (tx) => {
    const previous = await tx.readJob();
    if (previous) {
      if (previous.requestHash !== requestHash) fail("COMMAND_REUSED");
      return {
        jobId: input.commandId,
        state: previous.state,
        acceptedAt: previous.createdAt,
      };
    }
    await tx.assertActive(actor);
    const gate = await tx.readGate(actor.uid);
    tx.updateGate(actor.uid, {
      status: "DELETING",
      deletionJobId: input.commandId,
      version: gate.version + 1,
      updatedAt: tx.now,
    });
    tx.createJob({
      jobId: input.commandId,
      ownerUid: actor.uid,
      statusTokenHash: input.statusTokenHash,
      requestHash,
      state: "QUEUED",
      phase: "DISABLE_AUTH",
      createdAt: tx.now,
      updatedAt: tx.now,
    });
    return { jobId: input.commandId, state: "QUEUED", acceptedAt: tx.now };
  });
}
async function getDeletionStatus(
  input: DeletionStatusInput,
  store: DeletionStore,
) {
  const provided = Buffer.from(hash(input.statusToken), "hex");
  return store.transaction(input.jobId, async (tx) => {
    const job = await tx.readJob();
    const expected = Buffer.from(job?.statusTokenHash ?? "0".repeat(64), "hex");
    if (
      !timingSafeEqual(provided, expected) ||
      !job ||
      (job.expiresAt?.getTime() ?? Infinity) < store.now().getTime()
    )
      fail("PERMISSION_DENIED");
    const window = Math.floor(store.now().getTime() / 60_000),
      count = job.statusWindow === window ? (job.statusReads ?? 0) : 0;
    if (count >= 30) fail("RATE_LIMITED");
    tx.updateJob({ statusWindow: window, statusReads: count + 1 });
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
