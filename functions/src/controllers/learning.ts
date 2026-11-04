import * as schemas from "../contracts/learning/inputs.js";
import type { LearningService } from "../services/learning.js";
import { controller } from "./controller.js";
import { requireUser } from "../middleware/auth.js";
export function createLearningControllers(service: LearningService) {
  return {
    saveWord: controller(schemas.saveWordSchema, service.saveWord, requireUser),
    removeWord: controller(
      schemas.removeWordSchema,
      service.removeWord,
      requireUser,
    ),
    getSavedWords: controller(
      schemas.savedPageSchema,
      service.getSavedWords,
      requireUser,
    ),
    getSavedWordCount: controller(
      schemas.empty,
      service.getSavedWordCount,
      requireUser,
    ),
    startStudy: controller(
      schemas.startStudySchema,
      service.startStudy,
      requireUser,
    ),
    startReview: controller(
      schemas.startReviewSchema,
      service.startReview,
      requireUser,
    ),
    endStudy: controller(schemas.endStudySchema, service.endStudy, requireUser),
    getStudySource: controller(
      schemas.studySourceSchema,
      service.getStudySource,
      requireUser,
    ),
    getStudyPlace: controller(
      schemas.studySourceSchema,
      service.getStudyPlace,
      requireUser,
    ),
    getRatingContext: controller(
      schemas.ratingContextSchema,
      service.getRatingContext,
      requireUser,
    ),
    saveRating: controller(
      schemas.ratingSchema,
      service.saveRating,
      requireUser,
    ),
    getDueWords: controller(schemas.empty, service.getDueWords, requireUser),
    getStats: controller(schemas.empty, service.getStats, requireUser),
    getDashboard: controller(schemas.empty, service.getDashboard, requireUser),
    getLearningDays: controller(
      schemas.dateRangeSchema,
      service.getLearningDays,
      requireUser,
    ),
    getHeatmap: controller(
      schemas.dateRangeSchema,
      service.getHeatmap,
      requireUser,
    ),
    getDayActivity: controller(
      schemas.dayActivitySchema,
      service.getDayActivity,
      requireUser,
    ),
    getChart: controller(
      schemas.dateRangeSchema,
      service.getChart,
      requireUser,
    ),
    getRecentSets: controller(
      schemas.recentSetsSchema,
      service.getRecentSets,
      requireUser,
    ),
  };
}
