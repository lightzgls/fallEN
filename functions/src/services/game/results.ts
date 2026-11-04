import { objectId } from "../../domain/backend.js";
import { gameRef } from "../../infrastructure/game/references.js";
import {
  checkVersion,
  command,
  fail,
  parse,
  requireDoc,
  type Actor,
  type Data,
} from "../../shared/core.js";
import { gameCommandSchema } from "./schemas.js";

export async function endGame(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema
      .extend({ cancelledRoundId: objectId.optional() })
      .strict(),
    raw,
  );
  return command(actor, "endGame", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    const rounds = await tx.get(ref.collection("rounds"));
    const active = rounds.docs.find((s) => s.data().status === "ACTIVE");
    if (
      active &&
      (game.mode !== "LISTEN_AND_TYPE" || req.cancelledRoundId !== active.id)
    )
      fail(
        "CONFLICT",
        "Save the match round or explicitly cancel the active listening round",
      );
    const results: Data[] = [];
    for (const round of rounds.docs.filter(
      (s) => s.data().status === "COMMITTED",
    )) {
      const questions = await tx.get(round.ref.collection("questions"));
      results.push(...questions.docs.map((s) => s.data()));
    }
    if (active) tx.update(active.ref, { status: "CANCELLED", savedAt: now });
    tx.update(ref, {
      status: "FINISHED",
      endedAt: now,
      version: game.version + 1,
    });
    const correct = results.filter((q) => q.firstResult === "CORRECT").length;
    const incorrect = results.filter(
      (q) => q.firstResult === "INCORRECT",
    ).length;
    return {
      sessionId: req.sessionId,
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
