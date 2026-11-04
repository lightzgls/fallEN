import { createGameService } from "../services/game.js";
import { createFirebaseGameStore } from "../infrastructure/game/store.js";
import { createGameControllers } from "../controllers/game.js";
import { callable } from "../handlers/callable.js";
const service = createGameService(createFirebaseGameStore());
export const gameHandlers = createGameControllers(service);
export const prepareGame = service.prepareGame;
export const startGame = callable("startGame", gameHandlers.startGame);
export const createRound = callable("createRound", gameHandlers.createRound);
export const saveRound = callable("saveRound", gameHandlers.saveRound);
export const endGame = callable("endGame", gameHandlers.endGame);
export const getEligibleGameSource = callable(
  "getEligibleGameSource",
  gameHandlers.getEligibleGameSource,
);
