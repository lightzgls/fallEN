import { createLearningService } from "../services/learning.js";
import { createFirebaseLearningStore } from "../infrastructure/learning/store.js";
import { createLearningControllers } from "../controllers/learning.js";
import { callable } from "../handlers/callable.js";
export const learningHandlers = createLearningControllers(
  createLearningService(createFirebaseLearningStore()),
);
export const saveWord = callable("saveWord", learningHandlers.saveWord);
export const removeWord = callable("removeWord", learningHandlers.removeWord);
export const getSavedWords = callable(
  "getSavedWords",
  learningHandlers.getSavedWords,
);
export const getSavedWordCount = callable(
  "getSavedWordCount",
  learningHandlers.getSavedWordCount,
);
export const startStudy = callable("startStudy", learningHandlers.startStudy);
export const startReview = callable(
  "startReview",
  learningHandlers.startReview,
);
export const endStudy = callable("endStudy", learningHandlers.endStudy);
export const getStudySource = callable(
  "getStudySource",
  learningHandlers.getStudySource,
);
export const getStudyPlace = callable(
  "getStudyPlace",
  learningHandlers.getStudyPlace,
);
export const getRatingContext = callable(
  "getRatingContext",
  learningHandlers.getRatingContext,
);
export const saveRating = callable("saveRating", learningHandlers.saveRating);
export const getDueWords = callable(
  "getDueWords",
  learningHandlers.getDueWords,
);
export const getStats = callable("getStats", learningHandlers.getStats);
export const getDashboard = callable(
  "getDashboard",
  learningHandlers.getDashboard,
);
export const getLearningDays = callable(
  "getLearningDays",
  learningHandlers.getLearningDays,
);
export const getHeatmap = callable("getHeatmap", learningHandlers.getHeatmap);
export const getDayActivity = callable(
  "getDayActivity",
  learningHandlers.getDayActivity,
);
export const getChart = callable("getChart", learningHandlers.getChart);
export const getRecentSets = callable(
  "getRecentSets",
  learningHandlers.getRecentSets,
);
