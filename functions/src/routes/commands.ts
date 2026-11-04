import { createCommandService } from "../services/commands.js";
import { createCommandControllers } from "../controllers/commands.js";
import { commandStatusStore } from "../infrastructure/firebase/command-status.js";
import { callable } from "../handlers/callable.js";
export const commandHandlers = createCommandControllers(
  createCommandService(commandStatusStore),
);
export const getCommandStatus = callable(
  "getCommandStatus",
  commandHandlers.getCommandStatus,
);
