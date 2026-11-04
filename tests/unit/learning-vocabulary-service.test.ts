import { describe, it, expect, vi } from "vitest";
import type {
  VocabularyContext,
  VocabularyStore,
} from "../../functions/src/contracts/learning/store.js";
import type {
  Membership,
  ReviewPlan,
} from "../../functions/src/contracts/learning/records.js";
import {
  saveWord,
  removeWord,
} from "../../functions/src/services/learning/vocabulary.js";
const actor = { uid: "learner", contentAdmin: false, authTime: 0 };
const now = new Date("2026-11-04T16:30:00Z");
const membership: Membership = {
  wordId: "book",
  active: true,
  addedAt: now,
  membershipVersion: 3,
  source: "DICTIONARY",
};
const plan: ReviewPlan = {
  wordId: "book",
  cycleId: "existing-cycle",
  level: 4,
  dueDate: "2026-11-18",
  version: 7,
};
function unexpected(): never {
  throw new Error("Unexpected port access");
}
function fixture(existing: Membership | undefined) {
  const ctx: VocabularyContext = {
    membership: vi
      .fn<VocabularyContext["membership"]>()
      .mockResolvedValue(existing),
    plan: vi
      .fn<VocabularyContext["plan"]>()
      .mockResolvedValue(existing ? plan : undefined),
    study: unexpected,
    item: unexpected,
    releaseId: vi
      .fn<VocabularyContext["releaseId"]>()
      .mockResolvedValue("release"),
    entry: vi
      .fn<VocabularyContext["entry"]>()
      .mockResolvedValue({ active: true }),
    word: vi
      .fn<VocabularyContext["word"]>()
      .mockResolvedValue({ wordId: "book" }),
    savedPage: unexpected,
    savedCount: unexpected,
    saveMembership: vi.fn<VocabularyContext["saveMembership"]>(),
    savePlan: vi.fn<VocabularyContext["savePlan"]>(),
    removePlan: vi.fn<VocabularyContext["removePlan"]>(),
  };
  const store: VocabularyStore = {
    command: (_actor, _kind, _input, execute) => execute(ctx, now),
    read: unexpected,
  };
  return { ctx, store };
}
describe("vocabulary business decisions through injected ports", () => {
  it("keeps an active membership and its existing schedule across save sources before a stale optional version", async () => {
    const { ctx, store } = fixture(membership);
    expect(
      await saveWord(store, actor, {
        wordId: "book",
        source: "EXTERNAL_LOOKUP",
        expectedMembershipVersion: 0,
        commandId: "save",
      }),
    ).toEqual({ savedWord: membership, plan });
    expect(ctx.releaseId).not.toHaveBeenCalled();
    expect(ctx.saveMembership).not.toHaveBeenCalled();
    expect(ctx.savePlan).not.toHaveBeenCalled();
  });
  it("creates a fresh level-one cycle on the next UTC+7 calendar day for a missing membership", async () => {
    const { ctx, store } = fixture(undefined);
    await saveWord(store, actor, {
      wordId: "book",
      source: "SHARE",
      commandId: "new-cycle",
    });
    expect(ctx.savePlan).toHaveBeenCalledWith(
      expect.objectContaining({ level: 1, dueDate: "2026-11-05", version: 1 }),
    );
    expect(ctx.saveMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "SHARE",
        membershipVersion: 1,
        addedAt: now,
      }),
    );
  });
  it("rejects a stale deletion before staging membership or plan writes", async () => {
    const { ctx, store } = fixture(membership);
    await expect(
      removeWord(store, actor, {
        wordId: "book",
        expectedMembershipVersion: 2,
        commandId: "remove",
      }),
    ).rejects.toMatchObject({ details: { code: "CONFLICT" } });
    expect(ctx.saveMembership).not.toHaveBeenCalled();
    expect(ctx.removePlan).not.toHaveBeenCalled();
  });
});
