import type { Actor } from "../../contracts/callable.js";
import type { EndGameInput } from "../../contracts/game/inputs.js";
import type { Question } from "../../contracts/game/records.js";
import type { GameResultStore } from "../../contracts/game/store.js";
import {
  requireRecord,
  requireVersion,
} from "../../domain/study-consistency.js";
import { fail } from "../../shared/errors.js";
export function endGame(
  store: GameResultStore,
  actor: Actor,
  req: EndGameInput,
) {
  return store.command(actor, "endGame", req, async (ctx, now) => {
    const game = requireRecord(await ctx.game(req.sessionId));
    requireVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    const rounds = await ctx.rounds(game.id),
      active = rounds.find((r) => r.status === "ACTIVE");
    if (
      active &&
      (game.mode !== "LISTEN_AND_TYPE" || req.cancelledRoundId !== active.id)
    )
      fail(
        "CONFLICT",
        "Save the match round or explicitly cancel the active listening round",
      );
    const results: Question[] = [];
    for (const round of rounds.filter((r) => r.status === "COMMITTED"))
      results.push(...(await ctx.questions(game.id, round.id)));
    if (active) ctx.saveRound({ ...active, status: "CANCELLED", savedAt: now });
    ctx.saveGame({
      ...game,
      status: "FINISHED",
      endedAt: now,
      version: game.version + 1,
    });
    const correct = results.filter((q) => q.firstResult === "CORRECT").length,
      incorrect = results.filter((q) => q.firstResult === "INCORRECT").length;
    return {
      sessionId: game.id,
      mode: game.mode,
      gameVersion: game.version + 1,
      correctCount: correct,
      incorrectCount: incorrect,
      unansweredCount: results.filter((q) => q.firstResult === "UNANSWERED")
        .length,
      practicedWordCount: new Set(
        results.filter((q) => q.firstResult).map((q) => q.wordId),
      ).size,
      accuracy:
        correct + incorrect ? (correct / (correct + incorrect)) * 100 : null,
      bestStreak: game.bestStreak,
    };
  });
}
