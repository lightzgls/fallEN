import { z } from "zod";
import { objectId, sourceKey, sourceSchema } from "../../domain/backend.js";
import { userRef } from "../../infrastructure/learning/references.js";
import {
  assertActive,
  db,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { sourceWords } from "./sources.js";

export async function getStudySource(actor: Actor, input: unknown) {
  const req = parse(z.object({ source: sourceSchema }).strict(), input);
  await assertActive(actor);
  const result = await sourceWords(actor, req.source);
  const bookmark = (
    await userRef(actor, "flashcardPositions", sourceKey(req.source)).get()
  ).data();
  return {
    ...result,
    wordRefs: result.words.map((w: Data) => ({
      wordId: w.wordId,
      wordVersion: w.wordVersion,
    })),
    ...(bookmark ? { bookmark } : {}),
  };
}

export async function getStudyPlace(actor: Actor, input: unknown) {
  const req = parse(z.object({ source: sourceSchema }).strict(), input);
  await assertActive(actor);
  return (
    (
      await userRef(actor, "flashcardPositions", sourceKey(req.source)).get()
    ).data() ?? null
  );
}

export async function getRatingContext(actor: Actor, input: unknown) {
  const req = parse(
    z.object({ sessionId: objectId, wordId: objectId }).strict(),
    input,
  );
  await assertActive(actor);
  const study = requireDoc(
    await userRef(actor, "studySessions", req.sessionId).get(),
  );
  requireDoc(
    await db
      .doc(
        `users/${actor.uid}/studySessions/${req.sessionId}/items/${req.wordId}`,
      )
      .get(),
  );
  const memory = (
    await userRef(actor, "wordProgress", req.wordId).get()
  ).data();
  if (study.mode === "FLASHCARD") {
    const place = requireDoc(
      await userRef(actor, "flashcardPositions", sourceKey(study.source)).get(),
    );
    return {
      memoryVersion: memory?.version ?? 0,
      placeVersion: place.version,
    };
  }
  const plan = requireDoc(
    await userRef(actor, "srsSchedules", req.wordId).get(),
  );
  const membership = requireDoc(
    await userRef(actor, "personalWords", req.wordId).get(),
  );
  return {
    memoryVersion: memory?.version ?? 0,
    planVersion: plan.version,
    cycleId: plan.cycleId,
    membershipVersion: membership.membershipVersion,
  };
}
