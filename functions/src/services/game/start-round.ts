import type { Actor } from "../../contracts/callable.js";
import type { CreateRoundInput } from "../../contracts/game/inputs.js";
import type { RoundStartStore } from "../../contracts/game/store.js";
import {
  requireRecord,
  requireVersion,
} from "../../domain/study-consistency.js";
import { fail } from "../../shared/errors.js";
import { chooseQuestions, makeRound } from "./questions.js";
export function createRound(
  store: RoundStartStore,
  actor: Actor,
  req: CreateRoundInput,
) {
  return store.command(actor, "createRound", req, async (ctx, now) => {
    const game = requireRecord(await ctx.game(req.sessionId));
    requireVersion(game.version, req.expectedGameVersion);
    if (game.status !== "ACTIVE") fail("CONFLICT");
    if (game.currentRoundId) {
      const previous = requireRecord(
        await ctx.round(game.id, game.currentRoundId),
      );
      if (!["COMMITTED", "CANCELLED"].includes(previous.status))
        fail("CONFLICT", "Finish the current round before starting another");
    }
    const questions = await chooseQuestions(ctx, game, req.ttsConfig),
      round = makeRound(game, questions, now);
    ctx.createRound(round);
    ctx.createQuestions(game.id, round.id, questions);
    ctx.saveGame({
      ...game,
      currentRoundId: round.id,
      nextRoundOrder: game.nextRoundOrder + 1,
      version: game.version + 1,
    });
    return { round: { ...round, questions }, gameVersion: game.version + 1 };
  });
}
