import type { Actor } from "../../contracts/callable.js";
import type {
  SourceInput,
  RatingContextInput,
} from "../../contracts/learning/inputs.js";
import type { StudyQueryStore } from "../../contracts/learning/store.js";
import { requireRecord } from "../../domain/study-consistency.js";
export function getStudySource(
  store: StudyQueryStore,
  actor: Actor,
  req: SourceInput,
) {
  return store.read(actor, async (ctx) => {
    const result = await ctx.source(req.source),
      bookmark = await ctx.place(req.source);
    return {
      ...result,
      wordRefs: result.words.map((w) => ({
        wordId: w.wordId,
        wordVersion: w.wordVersion,
      })),
      ...(bookmark ? { bookmark } : {}),
    };
  });
}
export function getStudyPlace(
  store: StudyQueryStore,
  actor: Actor,
  req: SourceInput,
) {
  return store.read(
    actor,
    async (ctx) => (await ctx.place(req.source)) ?? null,
  );
}
export function getRatingContext(
  store: StudyQueryStore,
  actor: Actor,
  req: RatingContextInput,
) {
  return store.read(actor, async (ctx) => {
    const study = requireRecord(await ctx.study(req.sessionId));
    requireRecord(await ctx.item(req.sessionId, req.wordId));
    const memory = await ctx.memory(req.wordId);
    if (study.mode === "FLASHCARD") {
      const place = requireRecord(await ctx.place(study.source));
      return {
        memoryVersion: memory?.version ?? 0,
        placeVersion: place.version,
      };
    }
    const plan = requireRecord(await ctx.plan(req.wordId)),
      membership = requireRecord(await ctx.membership(req.wordId));
    return {
      memoryVersion: memory?.version ?? 0,
      planVersion: plan.version,
      cycleId: plan.cycleId,
      membershipVersion: membership.membershipVersion,
    };
  });
}
