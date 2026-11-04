import * as schemas from "../contracts/game/inputs.js";
import type { GameService } from "../services/game.js";
import { controller } from "./controller.js";
import { requireUser } from "../middleware/auth.js";
export function createGameControllers(service: GameService) {
  return {
    startGame: controller(schemas.startSchema, service.startGame, requireUser),
    createRound: controller(
      schemas.createRoundSchema,
      service.createRound,
      requireUser,
    ),
    saveRound: controller(
      schemas.saveRoundSchema,
      service.saveRound,
      requireUser,
    ),
    endGame: controller(schemas.endGameSchema, service.endGame, requireUser),
    getEligibleGameSource: controller(
      schemas.eligibleSourceSchema,
      service.getEligibleGameSource,
      requireUser,
    ),
  };
}
