import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../functions/src/contracts/callable.js";
import type { ChatSession } from "../../functions/src/contracts/chat/records.js";
import type {
  ChatStore,
  ChatEndTransaction,
} from "../../functions/src/contracts/chat/store.js";
import { startChat } from "../../functions/src/services/chat/start.js";
import { beginChatEnding } from "../../functions/src/services/chat/ending.js";
import { ApplicationError } from "../../functions/src/shared/errors.js";
import { hash } from "../../functions/src/shared/values.js";

const actor: Actor = { uid: "learner-retry", contentAdmin: false, authTime: 0 };
const input = {
  wordSetId: "deck",
  scenarioId: "topic",
  allowSupplement: true,
  commandId: "same-command",
};
const chat: ChatSession = {
  id: "session",
  wordSetId: "deck",
  wordSetRevisionId: "rev",
  scenarioId: "topic",
  scenarioSnapshot: {
    name: "Practice",
    context: "Travel",
    learnerRole: "Traveler",
    aiRole: "Clerk",
    goal: "Buy a ticket",
    openingLine: "Hello",
    guide: "Keep it short",
    active: true,
    version: 1,
  },
  referenceWordIds: [],
  referenceWords: [],
  status: "ACTIVE",
  completedTurns: 0,
  version: 1,
  createdAt: new Date("2026-11-04T00:00:00Z"),
};

describe("chat command replay precedence", () => {
  it.each([
    {
      kind: "saveWord",
      requestHash: "unrelated",
      receipt: { savedWord: { wordId: "book" } },
    },
    { kind: "publishSet", requestHash: "in-progress-without-receipt" },
    {
      kind: "startChat",
      requestHash: "different-payload",
      receipt: { invalid: "chat" },
    },
  ])(
    "rejects reused command IDs before decoding an unrelated receipt: $kind",
    async (previous) => {
      const decode = vi.fn<ChatStore["decodeStartReceipt"]>(() => {
        throw new Error("Wrong receipt codec invoked");
      });
      const active = vi
        .fn<ChatStore["assertActive"]>()
        .mockResolvedValue(undefined);
      const execute = vi.fn<ChatStore["startCommand"]>();
      const store = {
        startReceipt: async () => previous,
        decodeStartReceipt: decode,
        assertActive: active,
        startCommand: execute,
      };
      await expect(startChat(store, actor, input)).rejects.toMatchObject({
        details: { code: "COMMAND_REUSED" },
      });
      expect(active).toHaveBeenCalledWith(actor);
      expect(decode).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );
  it("checks the active account before returning a cached result", async () => {
    const decode = vi.fn<ChatStore["decodeStartReceipt"]>(() => chat);
    const store = {
      startReceipt: async () => ({
        kind: "startChat",
        requestHash: hash({ kind: "startChat", input }),
        receipt: chat,
      }),
      decodeStartReceipt: decode,
      assertActive: async () => {
        throw new ApplicationError("ACCOUNT_DELETING");
      },
      startCommand: vi.fn<ChatStore["startCommand"]>(),
    };
    await expect(startChat(store, actor, input)).rejects.toMatchObject({
      details: { code: "ACCOUNT_DELETING" },
    });
    expect(decode).not.toHaveBeenCalled();
  });
  it("returns an identical start receipt without executing creation again", async () => {
    const execute = vi.fn<ChatStore["startCommand"]>();
    const store = {
      startReceipt: async () => ({
        kind: "startChat",
        requestHash: hash({ kind: "startChat", input }),
        receipt: chat,
      }),
      decodeStartReceipt: () => chat,
      assertActive: async () => {},
      startCommand: execute,
    };
    expect(await startChat(store, actor, input)).toEqual(chat);
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects an end command collision before staging any ending state", async () => {
    const patch = vi.fn<ChatEndTransaction["patchChat"]>();
    const command = vi.fn<ChatEndTransaction["saveCommand"]>();
    const context: ChatEndTransaction = {
      now: new Date(),
      chat: async () => chat,
      summary: async () => undefined,
      command: async () => ({
        kind: "saveWord",
        requestHash: "other",
        status: "SUCCEEDED",
        receipt: { wordId: "book" },
      }),
      patchChat: patch,
      saveCommand: command,
      completeCommand: () => {},
      createSummary: () => {},
    };
    const store: Pick<ChatStore, "endTransaction"> = {
      endTransaction: async (_actor, work) => work(context),
    };
    await expect(
      beginChatEnding(store, actor, {
        sessionId: "session",
        expectedVersion: 0,
        commandId: "same-command",
      }),
    ).rejects.toMatchObject({ details: { code: "COMMAND_REUSED" } });
    expect(patch).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });
});
