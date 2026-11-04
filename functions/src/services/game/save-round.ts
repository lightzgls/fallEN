import type { Actor } from "../../contracts/callable.js";
import type { SaveRoundInput, RawAnswer } from "../../contracts/game/inputs.js";
import type { Question, Game } from "../../contracts/game/records.js";
import type { RoundCommitStore } from "../../contracts/game/store.js";
import { gradeAnswer, hasValidFirstOrder } from "../../domain/game-rules.js";
import { advanceActivity } from "../../domain/learning-activity.js";
import {
  requireRecord,
  requireVersion,
} from "../../domain/study-consistency.js";
import { dayKey } from "../../shared/clock.js";
import { fail } from "../../shared/errors.js";
function grade(answer: RawAnswer, question: Question, mode: Game["mode"]) {
  return gradeAnswer(answer, question.wordCopy, mode);
}
function validateAnswers(
  req: SaveRoundInput,
  game: Game,
  questions: Question[],
) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  if (!hasValidFirstOrder(req.firstAnswers, [...byId.keys()]))
    fail(
      "VALIDATION_FAILED",
      "First answers must be unique with continuous firstOrder",
    );
  if (req.finishReason === "STOP_AND_SAVE" && game.mode !== "MATCH_MEANINGS")
    fail("VALIDATION_FAILED");
  if (req.finishReason === "SKIPPED" && game.mode !== "LISTEN_AND_TYPE")
    fail("VALIDATION_FAILED");
  const completionIds = req.completionAnswers.map((a) => a.questionId);
  if (
    new Set(completionIds).size !== completionIds.length ||
    completionIds.some((q) => !byId.has(q))
  )
    fail("VALIDATION_FAILED");
  if (
    req.finishReason === "COMPLETED" &&
    (req.completionAnswers.length !== questions.length ||
      req.firstAnswers.length !== questions.length ||
      req.completionAnswers.some(
        (a) => !grade(a, byId.get(a.questionId)!, game.mode),
      ))
  )
    fail(
      "VALIDATION_FAILED",
      "A completed round must finish every question correctly",
    );
  if (req.finishReason !== "COMPLETED" && req.completionAnswers.length)
    fail("VALIDATION_FAILED");
  return byId;
}
export function saveRound(
  store: RoundCommitStore,
  actor: Actor,
  req: SaveRoundInput,
) {
  return store.command(actor, "saveRound", req, async (ctx, now) => {
    const game = requireRecord(await ctx.game(req.sessionId));
    requireVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE" || game.currentRoundId !== req.roundId)
      fail("CONFLICT");
    const round = requireRecord(await ctx.round(game.id, req.roundId));
    if (round.status !== "ACTIVE")
      fail("CONFLICT", "This round is already closed");
    const questions = await ctx.questions(game.id, round.id),
      byId = validateAnswers(req, game, questions),
      today = await ctx.day(dayKey(now)),
      summary = await ctx.summary();
    let current = game.currentStreak,
      best = game.bestStreak;
    for (const answer of [...req.firstAnswers].sort(
      (a, b) => a.firstOrder - b.firstOrder,
    )) {
      const q = byId.get(answer.answer.questionId)!;
      const correct = grade(answer.answer, q, game.mode);
      current = correct ? current + 1 : 0;
      best = Math.max(best, current);
      q.firstResult = correct ? "CORRECT" : "INCORRECT";
      q.firstOrder = answer.firstOrder;
      q.hintLevel = answer.hintLevel;
    }
    if (game.mode === "LISTEN_AND_TYPE" && !req.firstAnswers.length) {
      current = 0;
      questions[0].firstResult = "UNANSWERED";
    }
    const committedRound = {
      ...round,
      status: "COMMITTED",
      savedAt: now,
      finishReason: req.finishReason,
    };
    ctx.saveQuestions(game.id, round.id, questions);
    ctx.saveRound(committedRound);
    ctx.saveGame({
      ...game,
      version: game.version + 1,
      currentStreak: current,
      bestStreak: best,
    });
    const activity = advanceActivity(
      now,
      today,
      summary,
      game.mode,
      req.firstAnswers.length,
      0,
      best,
    );
    if (activity.day) ctx.saveDay(activity.day);
    ctx.saveSummary(activity.summary);
    if (req.firstAnswers.length && game.source.sourceType === "SYSTEM_DECK")
      ctx.saveRecentSet({
        wordSetId: game.source.wordSetId!,
        lastActivityAt: now,
      });
    return {
      round: { ...committedRound, questions },
      gameVersion: game.version + 1,
      currentStreak: current,
      bestStreak: best,
      committed: true,
    };
  });
}
