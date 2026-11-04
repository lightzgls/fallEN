import type { Actor } from "../callable.js";
import type { Data } from "../../shared/types.js";
import type { SourceRead } from "../../domain/dictionary/source.js";
import type { StartChatInput } from "./requests.js";
import type {
  ChatScenario,
  ChatSession,
  ChatTurn,
  ChatSummary,
  EndCommand,
} from "./records.js";

export interface ChatSourceReader {
  source(wordSetId: string): Promise<SourceRead>;
  memory(wordId: string): Promise<{ lastChoice?: string } | undefined>;
}
export interface ChatStartTransaction extends ChatSourceReader {
  now: Date;
  usage(
    dayKey: string,
  ): Promise<{ successfulSessionCount?: number } | undefined>;
  limit(): Promise<{ maxSessionsPerDay: number }>;
  topic(scenarioId: string): Promise<ChatScenario>;
  deck(
    wordSetId: string,
  ): Promise<{ active?: boolean; publishedRevisionId?: string }>;
  createChat(chat: ChatSession): void;
  saveUsage(dayKey: string, count: number): void;
}
export interface ChatTurnTransaction {
  now: Date;
  chat(sessionId: string): Promise<ChatSession>;
  turn(sessionId: string, turnId: string): Promise<ChatTurn | undefined>;
  saveTurn(sessionId: string, turn: ChatTurn): void;
  patchTurn(sessionId: string, turnId: string, patch: Partial<ChatTurn>): void;
  patchChat(sessionId: string, patch: Partial<ChatSession>): void;
}
export interface ChatEndTransaction {
  now: Date;
  chat(sessionId: string): Promise<ChatSession>;
  summary(sessionId: string): Promise<ChatSummary | undefined>;
  command(commandId: string): Promise<EndCommand | undefined>;
  patchChat(sessionId: string, patch: Partial<ChatSession>): void;
  saveCommand(commandId: string, command: EndCommand): void;
  completeCommand(commandId: string, summary: ChatSummary): void;
  createSummary(summary: ChatSummary): void;
}
export interface ChatStore {
  now(): Date;
  assertActive(actor: Actor): Promise<void>;
  sourceReader(actor: Actor): ChatSourceReader;
  startReceipt(
    actor: Actor,
    commandId: string,
  ): Promise<
    { kind: string; requestHash: string; receipt?: unknown } | undefined
  >;
  decodeStartReceipt(receipt: unknown): ChatSession;
  startCommand(
    actor: Actor,
    input: StartChatInput,
    work: (tx: ChatStartTransaction) => Promise<ChatSession>,
  ): Promise<ChatSession>;
  delivered(
    actor: Actor,
    sessionId: string,
  ): Promise<
    Array<{ turnId: string; learnerHash?: string; replyHash?: string }>
  >;
  wordVersion(wordId: string, version: number): Promise<Data>;
  hasTurn(actor: Actor, sessionId: string, turnId: string): Promise<boolean>;
  turnTransaction<Result>(
    actor: Actor,
    active: boolean,
    work: (tx: ChatTurnTransaction) => Promise<Result>,
  ): Promise<Result>;
  endTransaction<Result>(
    actor: Actor,
    work: (tx: ChatEndTransaction) => Promise<Result>,
  ): Promise<Result>;
  topics(): Promise<Array<ChatScenario & { id: string }>>;
  history(
    actor: Actor,
    after?: { time: Date; id: string },
  ): Promise<{ items: Array<ChatSummary & { id: string }>; hasMore: boolean }>;
  summary(actor: Actor, sessionId: string): Promise<ChatSummary | undefined>;
}
export interface ReplyMemory {
  prune(): void;
  read(actor: Actor, sessionId: string, turnId: string): string | undefined;
  remember(
    actor: Actor,
    sessionId: string,
    turnId: string,
    reply: string,
  ): void;
  remove(actor: Actor, sessionId: string, turnId: string): void;
  clearSession(actor: Actor, sessionId: string): void;
}
