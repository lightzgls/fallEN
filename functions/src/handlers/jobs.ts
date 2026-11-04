import { getFunctions } from "firebase-admin/functions";
import { getAuth } from "firebase-admin/auth";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";
import { type Actor, parse, identifier, fail } from "../shared/core.js";
import { runDeletionJob } from "../services/deletion.js";
import { cleanupAvatars } from "../services/profile.js";
import { prepareGame } from "../services/game.js";
import { resumeImport, resumePublish } from "../services/content.js";

const region = process.env.FUNCTION_REGION || "asia-southeast1";
async function enqueue(
  name: string,
  taskId: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    await getFunctions()
      .taskQueue(`locations/${region}/functions/${name}`)
      .enqueue(data, { id: taskId });
  } catch (error) {
    if ((error as { code?: string }).code !== "functions/task-already-exists")
      throw error;
  }
}
const workSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DELETE"), jobId: identifier }).strict(),
  z
    .object({ kind: z.literal("GAME"), uid: identifier, sessionId: identifier })
    .strict(),
  z
    .object({
      kind: z.literal("IMPORT"),
      uid: identifier,
      importId: identifier,
      commandId: identifier,
    })
    .strict(),
  z
    .object({
      kind: z.literal("PUBLISH"),
      uid: identifier,
      wordSetId: identifier,
      revisionId: identifier,
      commandId: identifier,
    })
    .strict(),
]);
async function verifiedWorkerActor(uid: string): Promise<Actor> {
  const user = await getAuth().getUser(uid);
  if (user.disabled) fail("UNAUTHENTICATED");
  return {
    uid,
    contentAdmin: user.customClaims?.contentAdmin === true,
    authTime: 0,
  };
}
export const backgroundWorker = onTaskDispatched(
  {
    region,
    invoker: "private",
    timeoutSeconds: 540,
    memory: "1GiB",
    retryConfig: {
      maxAttempts: 10,
      minBackoffSeconds: 30,
      maxBackoffSeconds: 600,
    },
    rateLimits: { maxConcurrentDispatches: 5 },
  },
  async (request) => {
    const job = parse(workSchema, request.data);
    if (job.kind === "DELETE") {
      await runDeletionJob(job.jobId);
      return;
    }
    const actor = await verifiedWorkerActor(job.uid);
    if (job.kind === "GAME") await prepareGame(actor, job.sessionId);
    else if (job.kind === "IMPORT")
      await resumeImport(actor, job.importId, job.commandId);
    else
      await resumePublish(actor, job.wordSetId, job.revisionId, job.commandId);
  },
);
export const dispatchDeletion = onDocumentCreated(
  { region, document: "accountDeletionJobs/{jobId}", retry: true },
  async (event) => {
    if (event.data?.data().state === "QUEUED")
      await enqueue("backgroundWorker", `delete_${event.params.jobId}`, {
        kind: "DELETE",
        jobId: event.params.jobId,
      });
  },
);
export const dispatchGame = onDocumentCreated(
  { region, document: "users/{uid}/gameSessions/{sessionId}", retry: true },
  async (event) => {
    if (event.data?.data().status === "PREPARING")
      await enqueue("backgroundWorker", `game_${event.params.sessionId}`, {
        kind: "GAME",
        uid: event.params.uid,
        sessionId: event.params.sessionId,
      });
  },
);
export const dispatchImport = onDocumentWritten(
  { region, document: "contentImports/{importId}", retry: true },
  async (event) => {
    const after = event.data?.after.data(),
      before = event.data?.before.data();
    if (
      after?.status === "APPLYING" &&
      (before?.status !== "APPLYING" ||
        before.applyCommandId !== after.applyCommandId)
    )
      await enqueue("backgroundWorker", `import_${after.applyCommandId}`, {
        kind: "IMPORT",
        uid: after.applyActorUid,
        importId: event.params.importId,
        commandId: after.applyCommandId,
      });
  },
);
export const dispatchPublication = onDocumentWritten(
  {
    region,
    document: "systemDecks/{wordSetId}/revisions/{revisionId}",
    retry: true,
  },
  async (event) => {
    const after = event.data?.after.data(),
      before = event.data?.before.data();
    if (
      after?.state === "VALIDATING" &&
      (before?.state !== "VALIDATING" ||
        before.publishCommandId !== after.publishCommandId)
    )
      await enqueue("backgroundWorker", `publish_${after.publishCommandId}`, {
        kind: "PUBLISH",
        uid: after.publishActorUid,
        wordSetId: event.params.wordSetId,
        revisionId: event.params.revisionId,
        commandId: after.publishCommandId,
      });
  },
);
export const avatarGarbageCollection = onSchedule(
  {
    region,
    schedule: "every 24 hours",
    timeZone: "Asia/Ho_Chi_Minh",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => cleanupAvatars(),
);
