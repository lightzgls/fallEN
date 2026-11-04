import { callable } from "../handlers/callable.js";
import { createProfileControllers } from "../controllers/profile.js";
import { createProfileService } from "../services/profile.js";
import { profileStore } from "../infrastructure/profile/store.js";
import { createAvatarCleanup } from "../services/profile/cleanup.js";
import { avatarCleanupStore } from "../infrastructure/profile/avatar-cleanup.js";
export const cleanupAvatars = createAvatarCleanup(avatarCleanupStore);
export const profileHandlers = createProfileControllers(
  createProfileService(profileStore),
);
export const ensureProfile = callable(
  "ensureProfile",
  profileHandlers.ensureProfile,
);
export const getProfile = callable("getProfile", profileHandlers.getProfile);
export const saveProfile = callable("saveProfile", profileHandlers.saveProfile);
export const getAccess = callable("getAccess", profileHandlers.getAccess);
export const getAccountState = callable(
  "getAccountState",
  profileHandlers.getAccountState,
);
export const getDeletionInfo = callable(
  "getDeletionInfo",
  profileHandlers.getDeletionInfo,
);
export const beginAvatarUpload = callable(
  "beginAvatarUpload",
  profileHandlers.beginAvatarUpload,
);
export const finalizeAvatar = callable(
  "finalizeAvatar",
  profileHandlers.finalizeAvatar,
);
