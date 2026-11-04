import { z } from "zod";
import { objectId } from "../../domain/values.js";
import { gradeAnswer, hasValidFirstOrder } from "../../domain/game-rules.js";
import { gameRef } from "../../infrastructure/game/refs.js";
import {
  readActivity,
  stageActivity,
} from "../../infrastructure/learning/activity.js";
import {
  checkVersion,
  command,
  db,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { firstAnswer, gameCommandSchema, rawAnswer } from "./schemas.js";

export function grade(
  answer: z.infer<typeof rawAnswer>,
  question: Data,
  mode: string,
): boolean {
  const copy = parse(
    z.object({
      spelling: z.string(),
      otherSpellings: z.array(z.string()),
      meaningId: z.string(),
    }),
    question.wordCopy,
  );
  const checkedMode = parse(
    z.enum(["MATCH_MEANINGS", "LISTEN_AND_TYPE"]),
    mode,
  );
  return gradeAnswer(answer, copy, checkedMode);
}

export async function saveRound(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema
      .extend({
        roundId: objectId,
        firstAnswers: z.array(firstAnswer).max(5),
        completionAnswers: z.array(rawAnswer).max(5),
        finishReason: z.enum(["COMPLETED", "STOP_AND_SAVE", "SKIPPED"]),
      })
      .strict(),
    raw,
  );
  return command(actor, "saveRound", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE" || game.currentRoundId !== req.roundId)
      fail("CONFLICT");
    const roundRef = ref.collection("rounds").doc(req.roundId);
    const round = requireDoc(await tx.get(roundRef));
    if (round.status !== "ACTIVE")
      fail("CONFLICT", "This round is already closed");
    const snapshots = await tx.get(roundRef.collection("questions"));
    const questions: Data[] = snapshots.docs.map((s) => ({
      ...s.data(),
      id: s.id,
    }));
    const questionById = new Map(questions.map((q) => [q.id, q]));
    if (!hasValidFirstOrder(req.firstAnswers, [...questionById.keys()]))
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
      completionIds.some((q) => !questionById.has(q))
    )
      fail("VALIDATION_FAILED");
    if (
      req.finishReason === "COMPLETED" &&
      (req.completionAnswers.length !== questions.length ||
        req.firstAnswers.length !== questions.length ||
        req.completionAnswers.some(
          (a) => !grade(a, questionById.get(a.questionId)!, game.mode),
        ))
    )
      fail(
        "VALIDATION_FAILED",
        "A completed round must finish every question correctly",
      );
    if (req.finishReason !== "COMPLETED" && req.completionAnswers.length)
      fail("VALIDATION_FAILED");
    const activity = await readActivity(tx, actor.uid, now);
    let current = game.currentStreak;
    let best = game.bestStreak;
    for (const answer of [...req.firstAnswers].sort(
      (a, b) => a.firstOrder - b.firstOrder,
    )) {
      const question = questionById.get(answer.answer.questionId)!;
      const correct = grade(answer.answer, question, game.mode);
      current = correct ? current + 1 : 0;
      best = Math.max(best, current);
      question.firstResult = correct ? "CORRECT" : "INCORRECT";
      question.firstOrder = answer.firstOrder;
      question.hintLevel = answer.hintLevel;
    }
    if (game.mode === "LISTEN_AND_TYPE" && !req.firstAnswers.length) {
      current = 0;
      questions[0].firstResult = "UNANSWERED";
    }
    for (const question of questions)
      tx.set(roundRef.collection("questions").doc(question.id), question);
    const committedRound = {
      ...round,
      status: "COMMITTED",
      savedAt: now,
      finishReason: req.finishReason,
    };
    tx.set(roundRef, committedRound);
    tx.update(ref, {
      version: game.version + 1,
      currentStreak: current,
      bestStreak: best,
    });
    stageActivity(tx, activity, game.mode, req.firstAnswers.length, 0, best);
    if (req.firstAnswers.length && game.source.sourceType === "SYSTEM_DECK")
      tx.set(
        db.doc(`users/${actor.uid}/deckActivity/${game.source.wordSetId}`),
        { wordSetId: game.source.wordSetId, lastActivityAt: now },
      );
    return {
      round: { ...committedRound, questions },
      gameVersion: game.version + 1,
      currentStreak: current,
      bestStreak: best,
      committed: true,
    };
  });
}
