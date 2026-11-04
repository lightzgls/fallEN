import type { Actor } from "../callable.js";
import type { Data } from "../../shared/types.js";
import type { Source } from "../../domain/values.js";
import type { WordSourceRead } from "../learning/store.js";
import type { LearningDay, Summary, RecentSet } from "../learning/records.js";
import type {
  Game,
  SourceWord,
  Speech,
  Question,
  Round,
  Command,
} from "./records.js";
export interface GameReader {
  requireActive(): Promise<void>;
  game(sessionId: string): Promise<Game | undefined>;
  command(commandId: string): Promise<Command | undefined>;
  source(source: Source): Promise<WordSourceRead>;
  sourceWords(sessionId: string): Promise<SourceWord[]>;
  rounds(sessionId: string): Promise<Round[]>;
  round(sessionId: string, roundId: string): Promise<Round | undefined>;
  questions(sessionId: string, roundId: string): Promise<Question[]>;
  deckActive(deckId: string): Promise<boolean | undefined>;
  releaseId(): Promise<string>;
  entry(
    wordId: string,
    releaseId: string,
  ): Promise<{ active: boolean } | undefined>;
  wordVersion(wordId: string, wordVersion: number): Promise<Data>;
  speech(wordId: string): Promise<Speech | undefined>;
  day(dayKey: string): Promise<LearningDay | undefined>;
  summary(): Promise<Summary | undefined>;
}
export interface GameContext extends GameReader {
  createGame(game: Game): void;
  saveGame(game: Game): void;
  createCommand(commandId: string, command: Command): void;
  saveCommand(commandId: string, command: Command): void;
  saveSourceWords(sessionId: string, words: SourceWord[]): void;
  createRound(round: Round): void;
  saveRound(round: Round): void;
  createQuestions(
    sessionId: string,
    roundId: string,
    questions: Question[],
  ): void;
  saveQuestions(
    sessionId: string,
    roundId: string,
    questions: Question[],
  ): void;
  saveDay(day: LearningDay): void;
  saveSummary(summary: Summary): void;
  saveRecentSet(value: RecentSet): void;
}
export interface GameStore {
  transaction<T>(
    actor: Actor,
    execute: (ctx: GameContext) => Promise<T>,
  ): Promise<T>;
  command(
    actor: Actor,
    kind: string,
    input: object,
    execute: (ctx: GameContext, now: Date) => Promise<object>,
  ): Promise<unknown>;
  read<T>(actor: Actor, execute: (ctx: GameReader) => Promise<T>): Promise<T>;
  now(): Date;
}

export type QuestionReader = Pick<
  GameReader,
  | "deckActive"
  | "sourceWords"
  | "rounds"
  | "releaseId"
  | "entry"
  | "wordVersion"
  | "speech"
>;
export type PreparationReader = QuestionReader &
  Pick<GameReader, "requireActive" | "game" | "command" | "source">;
export type PreparationContext = PreparationReader &
  Pick<
    GameContext,
    | "createGame"
    | "saveGame"
    | "createCommand"
    | "saveCommand"
    | "saveSourceWords"
    | "createRound"
    | "createQuestions"
  >;
export interface PreparationStore {
  transaction<T>(
    actor: Actor,
    execute: (ctx: PreparationContext) => Promise<T>,
  ): Promise<T>;
  read<T>(
    actor: Actor,
    execute: (ctx: PreparationReader) => Promise<T>,
  ): Promise<T>;
  now(): Date;
}
export interface GameCommandStore<Context> {
  command(
    actor: Actor,
    kind: string,
    input: object,
    execute: (ctx: Context, now: Date) => Promise<object>,
  ): Promise<unknown>;
}
export type RoundStartContext = QuestionReader &
  Pick<
    GameContext,
    "game" | "round" | "createRound" | "createQuestions" | "saveGame"
  >;
export type RoundStartStore = GameCommandStore<RoundStartContext>;
export type RoundCommitContext = Pick<
  GameContext,
  | "game"
  | "round"
  | "questions"
  | "day"
  | "summary"
  | "saveQuestions"
  | "saveRound"
  | "saveGame"
  | "saveDay"
  | "saveSummary"
  | "saveRecentSet"
>;
export type RoundCommitStore = GameCommandStore<RoundCommitContext>;
export type GameResultContext = Pick<
  GameContext,
  "game" | "rounds" | "questions" | "saveRound" | "saveGame"
>;
export type GameResultStore = GameCommandStore<GameResultContext>;
export interface EligibleSourceStore {
  read<T>(
    actor: Actor,
    execute: (
      ctx: Pick<GameReader, "requireActive" | "source" | "speech">,
    ) => Promise<T>,
  ): Promise<T>;
}
