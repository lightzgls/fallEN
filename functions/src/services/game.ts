import type { Actor } from "../contracts/callable.js";
import type { GameStore } from "../contracts/game/store.js";
import type * as Input from "../contracts/game/inputs.js";
import { startGame, prepareGame } from "./game/prepare.js";
import { createRound } from "./game/start-round.js";
import { saveRound } from "./game/save-round.js";
import { endGame } from "./game/results.js";
import { getEligibleGameSource } from "./game/eligible-source.js";
export function createGameService(store: GameStore) {
  return {
    startGame: (actor: Actor, input: Input.StartGameInput) =>
      startGame(store, actor, input),
    createRound: (actor: Actor, input: Input.CreateRoundInput) =>
      createRound(store, actor, input),
    saveRound: (actor: Actor, input: Input.SaveRoundInput) =>
      saveRound(store, actor, input),
    endGame: (actor: Actor, input: Input.EndGameInput) =>
      endGame(store, actor, input),
    getEligibleGameSource: (actor: Actor, input: Input.EligibleSourceInput) =>
      getEligibleGameSource(store, actor, input),
    prepareGame: (actor: Actor, sessionId: string) =>
      prepareGame(store, actor, sessionId),
  };
}
export type GameService = ReturnType<typeof createGameService>;
