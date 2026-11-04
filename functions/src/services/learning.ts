import { type Actor } from "../shared/types.js";
import { saveRating } from "./learning/rating.js";
import { getDueWords } from "./learning/review-list.js";
import {
  getChart,
  getDashboard,
  getDayActivity,
  getHeatmap,
  getLearningDays,
  getRecentSets,
  getStats,
} from "./learning/statistics.js";
import {
  getRatingContext,
  getStudyPlace,
  getStudySource,
} from "./learning/study-queries.js";
import { endStudy, startReview, startStudy } from "./learning/study.js";
import {
  getSavedWordCount,
  getSavedWords,
  removeWord,
  saveWord,
} from "./learning/vocabulary.js";

/** Public Callable registry; each operation is implemented in its feature module. */
export const learningHandlers: Record<
  string,
  (actor: Actor, input: unknown) => Promise<unknown>
> = {
  saveWord,
  removeWord,
  startStudy,
  startReview,
  saveRating,
  endStudy,
  getSavedWords,
  getSavedWordCount,
  getDueWords,
  getStudySource,
  getStudyPlace,
  getRatingContext,
  getStats,
  getDashboard,
  getLearningDays,
  getHeatmap,
  getDayActivity,
  getChart,
  getRecentSets,
};
