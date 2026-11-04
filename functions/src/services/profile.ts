import { type Actor } from "../shared/types.js";
import { ensureProfile, saveProfile } from "./profile/commands.js";
import {
  getProfile,
  getAccess,
  getAccountState,
  getDeletionInfo,
} from "./profile/queries.js";
import { beginAvatarUpload, finalizeAvatar } from "./profile/avatar.js";
export { ensureProfile } from "./profile/commands.js";
export { cleanupAvatars } from "../infrastructure/profile/avatar-cleanup.js";
export const profileHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  ensureProfile: ensureProfile,
  getProfile: getProfile,
  saveProfile: saveProfile,
  beginAvatarUpload: beginAvatarUpload,
  finalizeAvatar: finalizeAvatar,
  getAccess: getAccess,
  getAccountState: getAccountState,
  getDeletionInfo: getDeletionInfo,
};
