import { gameRef } from "../../infrastructure/game/references.js";
import { stageRound } from "../../infrastructure/game/round-records.js";
import {
  checkVersion,
  command,
  fail,
  parse,
  requireDoc,
  type Actor,
} from "../../shared/core.js";
import { gameCommandSchema, ttsSchema } from "./schemas.js";
import { chooseQuestions } from "./source-selection.js";

export async function createRound(actor: Actor, raw: unknown) {
  const req = parse(
    gameCommandSchema.extend({ ttsConfig: ttsSchema.optional() }).strict(),
    raw,
  );
  return command(actor, "createRound", req, async (tx, now) => {
    const ref = gameRef(actor, req.sessionId);
    const game = requireDoc(await tx.get(ref));
    checkVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    if (game.currentRoundId) {
      const previous = requireDoc(
        await tx.get(ref.collection("rounds").doc(game.currentRoundId)),
      );
      if (!["COMMITTED", "CANCELLED"].includes(previous.status))
        fail("CONFLICT", "Finish the current round before starting another");
    }
    const questions = await chooseQuestions(actor, game, tx, req.ttsConfig);
    const round = stageRound(tx, actor, game, questions, now);
    tx.update(ref, {
      currentRoundId: round.id,
      nextRoundOrder: game.nextRoundOrder + 1,
      version: game.version + 1,
    });
    return { round, gameVersion: game.version + 1 };
  });
}
