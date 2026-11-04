import { readProfileView } from "../../infrastructure/profile/profile-reader.js";
import {
  assertActive,
  db,
  empty,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";

export async function getProfile(actor: Actor, raw: unknown): Promise<Data> {
  parse(empty, raw);
  await assertActive(actor);
  return readProfileView(actor);
}

export async function getAccess(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await assertActive(actor);
  return {
    uid: actor.uid,
    roles: ["LEARNER", ...(actor.contentAdmin ? ["CONTENT_ADMIN"] : [])],
  };
}

export async function getAccountState(actor: Actor, raw: unknown) {
  parse(empty, raw);
  const gate = requireDoc(await db.doc(`accountStates/${actor.uid}`).get());
  return {
    status: gate.status,
    version: gate.version,
    deletionJobId: gate.deletionJobId,
  };
}

export async function getDeletionInfo(actor: Actor, raw: unknown) {
  parse(empty, raw);
  await assertActive(actor);
  return {
    requiresRecentAuthentication: true,
    retentionDays: 7,
    scope: [
      "profile",
      "vocabulary",
      "learning",
      "games",
      "aiSummaries",
      "reports",
      "avatars",
    ],
  };
}
