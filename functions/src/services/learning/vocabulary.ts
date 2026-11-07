import type { Actor } from "../../contracts/callable.js";
import type {
  SaveWordInput,
  RemoveWordInput,
  SavedPageInput,
} from "../../contracts/learning/inputs.js";
import type { Membership } from "../../contracts/learning/records.js";
import type { VocabularyStore } from "../../contracts/learning/store.js";
import { newPlan } from "../../domain/review-plan.js";
import { stableId } from "../../domain/values.js";
import {
  requireRecord,
  requireVersion,
} from "../../domain/study-consistency.js";
import { fail } from "../../shared/errors.js";
export function saveWord(
  store: VocabularyStore,
  actor: Actor,
  req: SaveWordInput,
) {
  return store.command(actor, "saveWord", req, async (ctx, now) => {
    const existing = await ctx.membership(req.wordId),
      schedule = await ctx.plan(req.wordId);
    if (existing?.active)
      return { savedWord: existing, ...(schedule ? { plan: schedule } : {}) };
    if (req.expectedMembershipVersion !== undefined)
      requireVersion(
        existing?.membershipVersion ?? 0,
        req.expectedMembershipVersion,
      );
    const releaseId = await ctx.releaseId(),
      entry = await ctx.entry(req.wordId, releaseId);
    if (!entry?.active) fail("WORD_UNAVAILABLE");
    let provenance: { sourceWordSetId?: string; sourceRevisionId?: string } =
      {};
    if (req.source === "FLASHCARD") {
      if (!req.studyId)
        fail("VALIDATION_FAILED", "FLASHCARD saving requires a study session");
      const study = requireRecord(await ctx.study(req.studyId)),
        item = await ctx.item(req.studyId, req.wordId);
      if (study.mode !== "FLASHCARD" || !item)
        fail(
          "VALIDATION_FAILED",
          "Word does not belong to this flashcard session",
        );
      if (study.source.sourceType === "SYSTEM_DECK")
        provenance = {
          sourceWordSetId: study.source.wordSetId,
          sourceRevisionId: study.source.revisionId,
        };
    } else if (req.studyId)
      fail("VALIDATION_FAILED", "Only a flashcard source accepts studyId");
    await ctx.word(req.wordId, req.releaseId);
    const savedWord: Membership = {
      wordId: req.wordId,
      active: true,
      addedAt: now,
      membershipVersion: (existing?.membershipVersion ?? 0) + 1,
      source: req.source,
      ...provenance,
    };
    const plan = newPlan(
      req.wordId,
      stableId(actor.uid, "cycle", req.commandId),
      now,
    );
    ctx.saveMembership(savedWord);
    ctx.savePlan(plan);
    return { savedWord, plan };
  });
}
export function removeWord(
  store: VocabularyStore,
  actor: Actor,
  req: RemoveWordInput,
) {
  return store.command(actor, "removeWord", req, async (ctx, now) => {
    const current = requireRecord(await ctx.membership(req.wordId));
    requireVersion(current.membershipVersion, req.expectedMembershipVersion);
    const savedWord = {
      ...current,
      active: false,
      removedAt: now,
      membershipVersion: current.membershipVersion + 1,
    };
    ctx.saveMembership(savedWord);
    ctx.removePlan(req.wordId);
    return { savedWord };
  });
}

export function removeOfflineWord(
  store: VocabularyStore,
  actor: Actor,
  req: { wordId: string; commandId: string },
) {
  return store.command(actor, "removeOfflineWord", req, async (ctx, now) => {
    const current = await ctx.membership(req.wordId);
    if (!current?.active) return { removed: true };
    ctx.saveMembership({
      ...current,
      active: false,
      removedAt: now,
      membershipVersion: current.membershipVersion + 1,
    });
    ctx.removePlan(req.wordId);
    return { removed: true };
  });
}
export function getSavedWords(
  store: VocabularyStore,
  actor: Actor,
  req: SavedPageInput,
) {
  return store.read(actor, async (ctx) => {
    const page = await ctx.savedPage(req.cursor, req.pageSize),
      releaseId = await ctx.releaseId(),
      items = [];
    for (const saved of page.items) {
      const entry = await ctx.entry(saved.wordId, releaseId);
      items.push({
        ...saved,
        available: !!entry?.active,
        ...(entry?.active
          ? { word: await ctx.word(saved.wordId, releaseId) }
          : {}),
      });
    }
    return { items, ...(page.cursor ? { cursor: page.cursor } : {}) };
  });
}
export function getSavedWordCount(store: VocabularyStore, actor: Actor) {
  return store.read(actor, async (ctx) => ({ count: await ctx.savedCount() }));
}
