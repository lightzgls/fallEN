import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  dayKey,
  serialize,
  type Data,
} from "../../functions/src/shared/core.js";
import { createChatHandlers } from "../../functions/src/services/chat.js";
import type { ChatApi, ChatContext } from "../../functions/src/domain/chat.js";
import {
  businessCode,
  learner,
  otherLearner,
  read,
  resetData,
  seedData,
} from "./fixtures.js";

function provider() {
  return {
    reply: vi
      .fn<ChatApi["reply"]>()
      .mockResolvedValue({ reply: "A private assistant response." }),
    giveFeedback: vi
      .fn<ChatApi["giveFeedback"]>()
      .mockResolvedValue({
        strengths: ["You kept the conversation going."],
        tips: ["Try adding one detail."],
      }),
  };
}
const userPath = (suffix: string) => `users/${learner.uid}/${suffix}`;
const startInput = (commandId: string, allowSupplement = true) => ({
  commandId,
  wordSetId: "test-deck",
  scenarioId: "test-scenario",
  allowSupplement,
});
beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("AI successful-session quota and reference selection", () => {
  it("does not consume quota on missing consent and consumes exactly once for a duplicated successful start", async () => {
    const api = provider();
    const handlers = createChatHandlers(api);
    expect(
      await businessCode(
        handlers.startChat(learner, startInput("needs-consent", false)),
      ),
    ).toBe("SUPPLEMENT_CONFIRMATION_REQUIRED");
    expect(await read(userPath(`aiDailyUsage/${dayKey()}`))).toBeUndefined();
    const [first, duplicate] = (await Promise.all([
      handlers.startChat(learner, startInput("same-start")),
      handlers.startChat(learner, startInput("same-start")),
    ])) as Data[];
    expect(duplicate.id).toBe(first.id);
    expect(
      (await read(userPath(`aiDailyUsage/${dayKey()}`)))
        ?.successfulSessionCount,
    ).toBe(1);
    await handlers.startChat(learner, startInput("second-start"));
    expect(
      await businessCode(handlers.startChat(learner, startInput("over-quota"))),
    ).toBe("AI_DAILY_LIMIT");
    expect(
      (await read(userPath(`aiDailyUsage/${dayKey()}`)))
        ?.successfulSessionCount,
    ).toBe(2);
    expect(api.reply).not.toHaveBeenCalled();
    expect((await db.collection(userPath("learningDays")).get()).empty).toBe(
      true,
    );
  });

  it("selects latest REMEMBERED choices rather than lifetime everRemembered totals", async () => {
    for (const wordId of [
      "journey",
      "reservation",
      "available",
      "station",
      "ticket",
    ]) {
      await db
        .doc(userPath(`wordProgress/${wordId}`))
        .set({
          wordId,
          lastChoice: "REMEMBERED",
          everRemembered: true,
          version: 1,
        });
    }
    await db
      .doc(userPath("wordProgress/book"))
      .set({
        wordId: "book",
        lastChoice: "NOT_REMEMBERED",
        everRemembered: true,
        version: 2,
      });
    const handlers = createChatHandlers(provider());
    const chat = (await handlers.startChat(
      learner,
      startInput("remembered-only", false),
    )) as Data;
    expect(chat.referenceWordIds).toHaveLength(5);
    expect(chat.referenceWordIds).not.toContain("book");
  });
});

describe("AI turn lease and explicit acknowledgement", () => {
  it("increments only on ACK, replays ACK receipt before stale-version checks, and binds turn hashes", async () => {
    const api = provider();
    const handlers = createChatHandlers(api);
    const chat = (await handlers.startChat(
      learner,
      startInput("start-ack"),
    )) as Data;
    const input = {
      sessionId: chat.id,
      turnId: "turn-one",
      expectedVersion: chat.version,
      message: "I need a book.",
      context: { pairs: [] },
    };
    const ready = (await handlers.sendMessage(learner, input)) as Data;
    expect(ready.status).toBe("REPLY_READY");
    expect(
      (await read(userPath(`aiSessions/${chat.id}`)))?.completedTurns,
    ).toBe(0);
    expect(await handlers.sendMessage(learner, input)).toEqual(ready);
    expect(api.reply).toHaveBeenCalledTimes(1);
    expect(
      await businessCode(
        handlers.sendMessage(learner, {
          ...input,
          message: "Changed private message.",
        }),
      ),
    ).toBe("COMMAND_REUSED");
    const ackInput = {
      sessionId: chat.id,
      turnId: "turn-one",
      expectedVersion: ready.chatVersion,
    };
    const ack = (await handlers.acknowledgeTurn(learner, ackInput)) as Data;
    expect(ack.completedTurns).toBe(1);
    expect(await handlers.acknowledgeTurn(learner, ackInput)).toEqual(ack);
    expect(
      (await read(userPath(`aiSessions/${chat.id}`)))?.completedTurns,
    ).toBe(1);
    expect(((await handlers.sendMessage(learner, input)) as Data).status).toBe(
      "INTERRUPTED",
    );
    expect(
      await businessCode(handlers.acknowledgeTurn(otherLearner, ackInput)),
    ).toBe("NOT_FOUND");
    const stored = await read(
      userPath(`aiSessions/${chat.id}/processedTurns/turn-one`),
    );
    for (const forbidden of ["message", "context", "reply", "messages"])
      expect(stored).not.toHaveProperty(forbidden);
    expect(JSON.stringify(serialize(stored))).not.toContain(input.message);
    expect(JSON.stringify(serialize(stored))).not.toContain(ready.reply);
    expect((await db.collection(userPath("learningDays")).get()).empty).toBe(
      true,
    );
    expect((await db.collection(userPath("wordProgress")).get()).empty).toBe(
      true,
    );
  });

  it("prevents parallel turns while a provider reply is in flight and discards replies after ending", async () => {
    let resolveReply!: (value: { reply: string }) => void;
    const api = provider();
    api.reply.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
    );
    const handlers = createChatHandlers(api);
    const chat = (await handlers.startChat(
      learner,
      startInput("start-late"),
    )) as Data;
    const pending = handlers.sendMessage(learner, {
      sessionId: chat.id,
      turnId: "pending-turn",
      expectedVersion: 1,
      message: "A message.",
      context: { pairs: [] },
    });
    await vi.waitFor(() => expect(api.reply).toHaveBeenCalledTimes(1));
    expect(
      await businessCode(
        handlers.sendMessage(learner, {
          sessionId: chat.id,
          turnId: "other-turn",
          expectedVersion: 1,
          message: "Another message.",
          context: { pairs: [] },
        }),
      ),
    ).toBe("TURN_IN_PROGRESS");
    const summary = (await handlers.endChat(learner, {
      sessionId: chat.id,
      expectedVersion: 1,
      commandId: "end-before-reply",
    })) as Data;
    expect(summary).toMatchObject({
      completedTurns: 0,
      feedbackStatus: "NOT_REQUESTED",
    });
    resolveReply({ reply: "Late reply must never count." });
    expect(((await pending) as Data).status).toBe("INTERRUPTED");
    expect(
      (await read(userPath(`aiSessions/${chat.id}`)))?.completedTurns,
    ).toBe(0);
  });

  it("ends at fifteen acknowledged pairs and never persists the transcript in metadata or receipts", async () => {
    const api = provider();
    const handlers = createChatHandlers(api);
    const chat = (await handlers.startChat(
      learner,
      startInput("start-fifteen"),
    )) as Data;
    let version = chat.version;
    const context: ChatContext = { pairs: [] };
    for (let index = 1; index <= 15; index++) {
      const message = `PRIVATE_LEARNER_91B_${index} book`;
      api.reply.mockResolvedValueOnce({
        reply: `PRIVATE_ASSISTANT_A2F_${index}`,
      });
      const ready = (await handlers.sendMessage(learner, {
        sessionId: chat.id,
        turnId: `turn-${index}`,
        expectedVersion: version,
        message,
        context,
      })) as Data;
      const ack = (await handlers.acknowledgeTurn(learner, {
        sessionId: chat.id,
        turnId: `turn-${index}`,
        expectedVersion: ready.chatVersion,
      })) as Data;
      version = ack.chatVersion;
      context.pairs.push({
        turnId: `turn-${index}`,
        learner: message,
        assistant: ready.reply,
      });
    }
    expect((await read(userPath(`aiSessions/${chat.id}`)))?.status).toBe(
      "ENDING",
    );
    expect(
      await businessCode(
        handlers.sendMessage(learner, {
          sessionId: chat.id,
          turnId: "turn-sixteen",
          expectedVersion: version,
          message: "Extra.",
          context,
        }),
      ),
    ).toBe("CHAT_ENDED");
    const request = {
      sessionId: chat.id,
      expectedVersion: version,
      commandId: "summary-fifteen",
      context,
    };
    const summary = (await handlers.endChat(learner, request)) as Data;
    expect(summary).toMatchObject({
      completedTurns: 15,
      feedbackStatus: "AVAILABLE",
    });
    expect(summary.mentionedWordIds).toContain("book");
    expect(await handlers.endChat(learner, request)).toEqual(summary);
    expect(api.giveFeedback).toHaveBeenCalledTimes(1);
    const turns = await db
      .collection(userPath(`aiSessions/${chat.id}/processedTurns`))
      .get();
    const commands = await db.collection(userPath("commands")).get();
    const durable = JSON.stringify(
      serialize({
        chat: await read(userPath(`aiSessions/${chat.id}`)),
        turns: turns.docs.map((doc) => doc.data()),
        commands: commands.docs.map((doc) => doc.data()),
        summary,
      }),
    );
    expect(durable).not.toContain("PRIVATE_LEARNER_91B");
    expect(durable).not.toContain("PRIVATE_ASSISTANT_A2F");
    expect((await db.collection(userPath("learningDays")).get()).empty).toBe(
      true,
    );
  });

  it("falls back to UNAVAILABLE instead of storing a verbatim short learner message in feedback", async () => {
    const api = provider();
    api.giveFeedback.mockResolvedValueOnce({
      strengths: ["You said I like books"],
      tips: [],
    });
    const handlers = createChatHandlers(api);
    const chat = (await handlers.startChat(
      learner,
      startInput("start-privacy"),
    )) as Data;
    const message = "I like books";
    const ready = (await handlers.sendMessage(learner, {
      sessionId: chat.id,
      turnId: "privacy-turn",
      expectedVersion: 1,
      message,
      context: { pairs: [] },
    })) as Data;
    const ack = (await handlers.acknowledgeTurn(learner, {
      sessionId: chat.id,
      turnId: "privacy-turn",
      expectedVersion: ready.chatVersion,
    })) as Data;
    const summary = (await handlers.endChat(learner, {
      sessionId: chat.id,
      expectedVersion: ack.chatVersion,
      commandId: "end-privacy",
      context: {
        pairs: [
          { turnId: "privacy-turn", learner: message, assistant: ready.reply },
        ],
      },
    })) as Data;
    expect(summary.feedbackStatus).toBe("UNAVAILABLE");
    expect(summary.strengths).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(message);
  });
});
