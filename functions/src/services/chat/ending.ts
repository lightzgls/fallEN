import type { Actor } from "../../contracts/callable.js";
import type { ChatSession, ChatSummary } from "../../contracts/chat/records.js";
import type { ChatStore } from "../../contracts/chat/store.js";
import type { EndChatCommand } from "../../domain/chat-commands.js";
import type { SummaryFeedback } from "../../domain/chat-summary.js";
import { fail } from "../../shared/errors.js";
import { checkVersion } from "../../shared/validation.js";
import { hash } from "../../shared/values.js";

export function beginChatEnding(
  store: Pick<ChatStore, "endTransaction">,
  actor: Actor,
  req: EndChatCommand,
): Promise<{ summary: ChatSummary } | { chat: ChatSession }> {
  const requestHash = hash({
    kind: "endChat",
    input: {
      sessionId: req.sessionId,
      expectedVersion: req.expectedVersion,
      commandId: req.commandId,
      contextHash: req.context ? hash(req.context) : null,
    },
  });
  return store.endTransaction(actor, async (tx) => {
    const chat = await tx.chat(req.sessionId),
      summary = await tx.summary(req.sessionId),
      previous = await tx.command(req.commandId);
    if (previous && previous.requestHash !== requestHash)
      fail("COMMAND_REUSED");
    if (summary) return { summary };
    if (previous?.status !== "IN_PROGRESS") {
      checkVersion(chat.version, req.expectedVersion);
      if (!["ACTIVE", "ENDING", "INTERRUPTED"].includes(chat.status))
        fail("CHAT_ENDED");
    }
    if (chat.endingCommandId && chat.endingCommandId !== req.commandId)
      fail("CONFLICT");
    tx.patchChat(req.sessionId, {
      status: "ENDING",
      endingCommandId: req.commandId,
    });
    tx.saveCommand(req.commandId, {
      kind: "endChat",
      requestHash,
      status: "IN_PROGRESS",
      createdAt: tx.now,
    });
    return { chat };
  });
}
export function commitChatSummary(
  store: Pick<ChatStore, "endTransaction">,
  actor: Actor,
  req: EndChatCommand,
  chat: ChatSession,
  feedback: SummaryFeedback,
) {
  return store.endTransaction(actor, async (tx) => {
    const current = await tx.chat(req.sessionId),
      existing = await tx.summary(req.sessionId);
    if (existing) return existing;
    if (current.endingCommandId !== req.commandId) fail("CONFLICT");
    const summary: ChatSummary = {
      sessionId: req.sessionId,
      wordSetId: chat.wordSetId,
      scenarioId: chat.scenarioId,
      completedTurns: chat.completedTurns,
      ...feedback,
      endedAt: tx.now,
    };
    tx.createSummary(summary);
    tx.patchChat(req.sessionId, {
      status: req.context || !chat.completedTurns ? "FINISHED" : "INTERRUPTED",
      version: current.version + 1,
      pendingTurnId: null,
    });
    tx.completeCommand(req.commandId, summary);
    return summary;
  });
}
