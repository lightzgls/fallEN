import type { Actor } from "../contracts/callable.js";
import type * as Input from "../contracts/learning/inputs.js";
import type { LearningStore } from "../contracts/learning/store.js";
import {
  saveWord,
  removeWord,
  getSavedWords,
  getSavedWordCount,
} from "./learning/vocabulary.js";
import { startStudy, startReview, endStudy } from "./learning/study.js";
import {
  getStudySource,
  getStudyPlace,
  getRatingContext,
} from "./learning/study-queries.js";
import { saveRating } from "./learning/rating.js";
import { getDueWords } from "./learning/due-words.js";
import {
  getStats,
  getDashboard,
  getLearningDays,
  getHeatmap,
  getDayActivity,
  getChart,
  getRecentSets,
} from "./learning/stats.js";

export function createLearningService(store: LearningStore) {
  return {
    saveWord: (actor: Actor, input: Input.SaveWordInput) =>
      saveWord(store, actor, input),
    removeWord: (actor: Actor, input: Input.RemoveWordInput) =>
      removeWord(store, actor, input),
    getSavedWords: (actor: Actor, input: Input.SavedPageInput) =>
      getSavedWords(store, actor, input),
    getSavedWordCount: (actor: Actor) => getSavedWordCount(store, actor),
    startStudy: (actor: Actor, input: Input.StartStudyInput) =>
      startStudy(store, actor, input),
    startReview: (actor: Actor, input: Input.StartReviewInput) =>
      startReview(store, actor, input),
    endStudy: (actor: Actor, input: Input.EndStudyInput) =>
      endStudy(store, actor, input),
    getStudySource: (actor: Actor, input: Input.SourceInput) =>
      getStudySource(store, actor, input),
    getStudyPlace: (actor: Actor, input: Input.SourceInput) =>
      getStudyPlace(store, actor, input),
    getRatingContext: (actor: Actor, input: Input.RatingContextInput) =>
      getRatingContext(store, actor, input),
    saveRating: (actor: Actor, input: Input.RatingInput) =>
      saveRating(store, actor, input),
    getDueWords: (actor: Actor) => getDueWords(store, actor),
    getStats: (actor: Actor) => getStats(store, actor),
    getDashboard: (actor: Actor) => getDashboard(store, actor),
    getLearningDays: (actor: Actor, input: Input.DateRangeInput) =>
      getLearningDays(store, actor, input),
    getHeatmap: (actor: Actor, input: Input.DateRangeInput) =>
      getHeatmap(store, actor, input),
    getDayActivity: (actor: Actor, input: Input.DayActivityInput) =>
      getDayActivity(store, actor, input),
    getChart: (actor: Actor, input: Input.DateRangeInput) =>
      getChart(store, actor, input),
    getRecentSets: (actor: Actor, input: Input.RecentSetsInput) =>
      getRecentSets(store, actor, input),
  };
}
export type LearningService = ReturnType<typeof createLearningService>;
