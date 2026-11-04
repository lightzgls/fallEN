import { defineSecret } from "firebase-functions/params";
import { callable } from "./handlers/callable.js";
import { getCommandStatus as commandStatus } from "./shared/core.js";
import { dictionaryHandlers as dictionary } from "./services/dictionary.js";
import { profileHandlers as profile } from "./services/profile.js";
import { deletionHandlers as deletion } from "./services/deletion.js";
import { learningHandlers as learning } from "./services/learning.js";
import { gameHandlers as game } from "./services/game.js";
import { contentHandlers as content } from "./services/content.js";
import { reportHandlers as reports } from "./services/reports.js";
import { createChatHandlers } from "./services/chat.js";
import { GeminiChatApi } from "./infrastructure/ai/gemini.js";
const geminiKey = defineSecret("GEMINI_API_KEY");
const chat = createChatHandlers(
  new GeminiChatApi({
    apiKey: () => geminiKey.value(),
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  }),
);
export const ensureProfile = callable("ensureProfile", profile.ensureProfile),
  getProfile = callable("getProfile", profile.getProfile),
  saveProfile = callable("saveProfile", profile.saveProfile),
  getAccess = callable("getAccess", profile.getAccess),
  getAccountState = callable("getAccountState", profile.getAccountState),
  getDeletionInfo = callable("getDeletionInfo", profile.getDeletionInfo),
  beginAvatarUpload = callable("beginAvatarUpload", profile.beginAvatarUpload),
  finalizeAvatar = callable("finalizeAvatar", profile.finalizeAvatar);
export const requestDeletion = callable(
    "requestDeletion",
    deletion.requestDeletion,
  ),
  getDeletionStatus = callable("getDeletionStatus", deletion.getDeletionStatus);
export const findWords = callable("findWords", dictionary.findWords),
  getWord = callable("getWord", dictionary.getWord),
  getWordVersion = callable("getWordVersion", dictionary.getWordVersion),
  findConnections = callable("findConnections", dictionary.findConnections),
  getPublishedDecks = callable(
    "getPublishedDecks",
    dictionary.getPublishedDecks,
  );
export const saveWord = callable("saveWord", learning.saveWord),
  removeWord = callable("removeWord", learning.removeWord),
  getSavedWords = callable("getSavedWords", learning.getSavedWords),
  getSavedWordCount = callable("getSavedWordCount", learning.getSavedWordCount),
  getDueWords = callable("getDueWords", learning.getDueWords),
  getStudySource = callable("getStudySource", learning.getStudySource),
  getStudyPlace = callable("getStudyPlace", learning.getStudyPlace),
  getRatingContext = callable("getRatingContext", learning.getRatingContext),
  startStudy = callable("startStudy", learning.startStudy),
  startReview = callable("startReview", learning.startReview),
  saveRating = callable("saveRating", learning.saveRating),
  endStudy = callable("endStudy", learning.endStudy);
export const getStats = callable("getStats", learning.getStats),
  getDashboard = callable("getDashboard", learning.getDashboard),
  getLearningDays = callable("getLearningDays", learning.getLearningDays),
  getHeatmap = callable("getHeatmap", learning.getHeatmap),
  getDayActivity = callable("getDayActivity", learning.getDayActivity),
  getChart = callable("getChart", learning.getChart),
  getRecentSets = callable("getRecentSets", learning.getRecentSets);
export const startGame = callable("startGame", game.startGame),
  createRound = callable("createRound", game.createRound),
  saveRound = callable("saveRound", game.saveRound),
  endGame = callable("endGame", game.endGame),
  getEligibleGameSource = callable(
    "getEligibleGameSource",
    game.getEligibleGameSource,
  );
export const createDeck = callable("createDeck", content.createDeck),
  openDraft = callable("openDraft", content.openDraft),
  getDraft = callable("getDraft", content.getDraft),
  saveDraft = callable("saveDraft", content.saveDraft),
  publishSet = callable("publishSet", content.publishSet),
  listDecks = callable("listDecks", content.listDecks),
  setDeckActive = callable("setDeckActive", content.setDeckActive),
  previewImport = callable("previewImport", content.previewImport),
  resolveImportRow = callable("resolveImportRow", content.resolveImportRow),
  applyImport = callable("applyImport", content.applyImport),
  getImport = callable("getImport", content.getImport),
  listImports = callable("listImports", content.listImports),
  beginContentUpload = callable(
    "beginContentUpload",
    content.beginContentUpload,
  ),
  finalizeContentUpload = callable(
    "finalizeContentUpload",
    content.finalizeContentUpload,
  ),
  getImageAsset = callable("getImageAsset", content.getImageAsset);
export const getSpeech = callable("getSpeech", content.getSpeech),
  saveSpeech = callable("saveSpeech", content.saveSpeech),
  listTopics = callable("listTopics", content.listTopics),
  getTopic = callable("getTopic", content.getTopic),
  saveTopic = callable("saveTopic", content.saveTopic),
  getLimit = callable("getLimit", content.getLimit),
  saveLimit = callable("saveLimit", content.saveLimit);
export const submitReport = callable("submitReport", reports.submitReport),
  getReportContext = callable("getReportContext", reports.getReportContext),
  getMyReports = callable("getMyReports", reports.getMyReports),
  getMyReport = callable("getMyReport", reports.getMyReport),
  listReports = callable("listReports", reports.listReports),
  getReport = callable("getReport", reports.getReport),
  updateReportStatus = callable(
    "updateReportStatus",
    reports.updateReportStatus,
  ),
  closeReport = callable("closeReport", reports.closeReport);
export const getChatWords = callable("getChatWords", chat.getChatWords),
  getTopics = callable("getTopics", chat.getTopics),
  startChat = callable("startChat", chat.startChat),
  sendMessage = callable("sendMessage", chat.sendMessage, {
    secrets: [geminiKey],
  }),
  acknowledgeTurn = callable("acknowledgeTurn", chat.acknowledgeTurn),
  endChat = callable("endChat", chat.endChat, { secrets: [geminiKey] }),
  getChatHistory = callable("getChatHistory", chat.getChatHistory),
  getChatSummary = callable("getChatSummary", chat.getChatSummary);
export const getCommandStatus = callable("getCommandStatus", commandStatus);
export {
  backgroundWorker,
  dispatchDeletion,
  dispatchGame,
  dispatchImport,
  dispatchPublication,
  avatarGarbageCollection,
} from "./handlers/jobs.js";
