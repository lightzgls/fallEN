import { callable } from "../handlers/callable.js";
import { createDeletionService } from "../services/deletion.js";
import { createDeletionControllers } from "../controllers/deletion.js";
import { deletionStore } from "../infrastructure/deletion/store.js";
const service = createDeletionService(deletionStore);
export const deletionHandlers = createDeletionControllers(service);
export const runDeletionJob = service.runDeletionJob;
export const requestDeletion = callable(
  "requestDeletion",
  deletionHandlers.requestDeletion,
);
export const getDeletionStatus = callable(
  "getDeletionStatus",
  deletionHandlers.getDeletionStatus,
  { access: "public" },
);
