import type { Actor } from "../callable.js";
import type { Source } from "../../domain/values.js";
import type { Data } from "../../shared/types.js";
import type {
  Membership,
  ReviewPlan,
  Memory,
  Study,
  StudyItem,
  Place,
  Rating,
  LearningDay,
  Summary,
  RecentSet,
} from "./records.js";
export interface WordSourceRead {
  source: Source;
  words: { wordId: string; wordVersion: number; word: Data; entry?: Data }[];
}
export interface LearningReader {
  membership(wordId: string): Promise<Membership | undefined>;
  plan(wordId: string): Promise<ReviewPlan | undefined>;
  memory(wordId: string): Promise<Memory | undefined>;
  study(sessionId: string): Promise<Study | undefined>;
  item(sessionId: string, wordId: string): Promise<StudyItem | undefined>;
  items(sessionId: string): Promise<StudyItem[]>;
  ratings(sessionId: string): Promise<Rating[]>;
  place(source: Source): Promise<Place | undefined>;
  rating(eventId: string): Promise<Rating | undefined>;
  source(source: Source): Promise<WordSourceRead>;
  releaseId(): Promise<string>;
  entry(
    wordId: string,
    releaseId: string,
  ): Promise<{ active: boolean } | undefined>;
  word(wordId: string, releaseId?: string): Promise<Data>;
  duePlans(day: string): Promise<ReviewPlan[]>;
  day(day: string): Promise<LearningDay | undefined>;
  summary(): Promise<Summary | undefined>;
  days(from: string, to: string): Promise<LearningDay[]>;
  rememberedMemories(): Promise<Memory[]>;
  savedPage(
    cursor: string | undefined,
    pageSize: number,
  ): Promise<{ items: Membership[]; cursor?: string }>;
  savedCount(): Promise<number>;
  recentPage(cursor?: string): Promise<{ items: RecentSet[]; cursor?: string }>;
  recentDashboard(): Promise<RecentSet[]>;
}
export interface LearningContext extends LearningReader {
  saveMembership(value: Membership): void;
  savePlan(value: ReviewPlan): void;
  removePlan(wordId: string): void;
  saveStudy(value: Study): void;
  updateStudy(sessionId: string, changes: Partial<Study>): void;
  saveItems(sessionId: string, items: StudyItem[]): void;
  savePlace(value: Place): void;
  saveMemory(value: Memory): void;
  createRating(value: Rating): void;
  markRated(sessionId: string, wordId: string, eventId: string): void;
  saveDay(value: LearningDay): void;
  saveSummary(value: Summary): void;
  saveRecentSet(value: RecentSet): void;
}
export interface CommandStore<Context> {
  command(
    actor: Actor,
    kind: string,
    input: object,
    execute: (context: Context, now: Date) => Promise<object>,
  ): Promise<unknown>;
}
export interface ReadStore<Reader> {
  read<T>(actor: Actor, execute: (context: Reader) => Promise<T>): Promise<T>;
}
export interface LearningStore
  extends CommandStore<LearningContext>, ReadStore<LearningReader> {
  now(): Date;
}
export type VocabularyReader = Pick<
  LearningReader,
  | "membership"
  | "plan"
  | "study"
  | "item"
  | "releaseId"
  | "entry"
  | "word"
  | "savedPage"
  | "savedCount"
>;
export type VocabularyContext = VocabularyReader &
  Pick<LearningContext, "saveMembership" | "savePlan" | "removePlan">;
export type VocabularyStore = CommandStore<VocabularyContext> &
  ReadStore<VocabularyReader>;
export type DueWordsReader = Pick<
  LearningReader,
  "releaseId" | "duePlans" | "membership" | "entry" | "word"
>;
export type DueWordsStore = ReadStore<DueWordsReader> &
  Pick<LearningStore, "now">;
export type StudyContext = DueWordsReader &
  Pick<
    LearningContext,
    | "source"
    | "place"
    | "study"
    | "ratings"
    | "saveStudy"
    | "saveItems"
    | "savePlace"
    | "updateStudy"
  >;
export type StudyStore = CommandStore<StudyContext>;
export type StudyQueryReader = Pick<
  LearningReader,
  "source" | "place" | "study" | "item" | "memory" | "plan" | "membership"
>;
export type StudyQueryStore = ReadStore<StudyQueryReader>;
export type RatingContext = Pick<
  LearningContext,
  | "study"
  | "item"
  | "memory"
  | "membership"
  | "plan"
  | "rating"
  | "items"
  | "place"
  | "entry"
  | "releaseId"
  | "day"
  | "summary"
  | "saveMembership"
  | "savePlan"
  | "createRating"
  | "saveMemory"
  | "markRated"
  | "savePlace"
  | "updateStudy"
  | "saveDay"
  | "saveSummary"
  | "saveRecentSet"
>;
export type RatingStore = CommandStore<RatingContext>;
export type StatisticsReader = DueWordsReader &
  Pick<
    LearningReader,
    | "summary"
    | "day"
    | "days"
    | "rememberedMemories"
    | "recentPage"
    | "recentDashboard"
  >;
export type StatisticsStore = ReadStore<StatisticsReader> &
  Pick<LearningStore, "now">;
