import { z } from "zod";

export const scenarioRecord = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    context: z.string(),
    learnerRole: z.string(),
    aiRole: z.string(),
    goal: z.string(),
    openingLine: z.string(),
    guide: z.string(),
    active: z.boolean(),
    version: z.number(),
  })
  .passthrough();
export const referenceRecord = z.object({
  wordId: z.string(),
  wordVersion: z.number(),
  wordOrder: z.number(),
});
export const chatRecord = z
  .object({
    id: z.string(),
    wordSetId: z.string(),
    wordSetRevisionId: z.string(),
    scenarioId: z.string(),
    scenarioSnapshot: scenarioRecord,
    referenceWordIds: z.array(z.string()),
    referenceWords: z.array(referenceRecord),
    status: z.string(),
    completedTurns: z.number(),
    version: z.number(),
    createdAt: z.date(),
    pendingTurnId: z.string().nullable().optional(),
    endingCommandId: z.string().optional(),
  })
  .passthrough();
export const ackReceiptRecord = z.object({
  turnId: z.string(),
  completedTurns: z.number(),
  chatVersion: z.number(),
});
export const turnRecord = z.object({
  turnId: z.string(),
  status: z.string(),
  requestHash: z.string().optional(),
  leaseId: z.string().optional(),
  leaseExpiresAt: z.date().optional(),
  turnOrder: z.number().optional(),
  learnerHash: z.string().optional(),
  replyHash: z.string().optional(),
  readyVersion: z.number().optional(),
  acknowledgedAt: z.date().optional(),
  ackReceipt: ackReceiptRecord.optional(),
  errorCode: z.string().optional(),
});
export const chatSummaryRecord = z
  .object({
    sessionId: z.string(),
    wordSetId: z.string(),
    scenarioId: z.string(),
    completedTurns: z.number(),
    mentionedWordIds: z.array(z.string()),
    strengths: z.array(z.string()),
    tips: z.array(z.string()),
    feedbackStatus: z.enum(["NOT_REQUESTED", "UNAVAILABLE", "AVAILABLE"]),
    endedAt: z.date(),
  })
  .passthrough();
export const endCommandRecord = z.object({
  kind: z.string(),
  requestHash: z.string(),
  status: z.string(),
  createdAt: z.date().optional(),
  receipt: z.unknown().optional(),
});
export type ChatScenario = z.output<typeof scenarioRecord>;
export type ChatSession = z.output<typeof chatRecord>;
export type ChatTurn = z.output<typeof turnRecord>;
export type ChatSummary = z.output<typeof chatSummaryRecord>;
export type EndCommand = z.output<typeof endCommandRecord>;
export type AckReceipt = z.output<typeof ackReceiptRecord>;
export interface TurnReceipt {
  turnId: string;
  chatVersion: number;
  status: string;
  reply?: string;
}
