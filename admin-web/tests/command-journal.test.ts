import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUserCommandJournal,
  readPendingCommand,
  recordCommand,
} from "../src/services/command-journal";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

describe("uncertain admin command recovery", () => {
  it("retains the same ID and full expected-version payload after readback", () => {
    const pending = {
      uid: "admin-a",
      name: "saveLimit",
      commandId: "stable-command",
      input: {
        commandId: "stable-command",
        maxSessionsPerDay: 3,
        expectedVersion: 7,
      },
    };
    recordCommand(pending);
    expect(readPendingCommand("admin-a")).toEqual(pending);
    expect(readPendingCommand("admin-b")).toBeUndefined();
  });

  it("clears only the signed-out account's pending command", () => {
    for (const uid of ["admin-a", "admin-b"])
      recordCommand({
        uid,
        name: "saveLimit",
        commandId: uid,
        input: { commandId: uid },
      });
    clearUserCommandJournal("admin-a");
    expect(readPendingCommand("admin-a")).toBeUndefined();
    expect(readPendingCommand("admin-b")?.commandId).toBe("admin-b");
  });

  it("does not restore a forged command ID or an arbitrary callable name", () => {
    sessionStorage.setItem(
      "fallen-admin-command:admin-a",
      JSON.stringify({
        uid: "admin-a",
        name: "saveLimit",
        commandId: "one",
        input: { commandId: "two" },
      }),
    );
    expect(readPendingCommand("admin-a")).toBeUndefined();
    recordCommand({
      uid: "admin-a",
      name: "deleteAccount",
      commandId: "one",
      input: { commandId: "one" },
    });
    expect(readPendingCommand("admin-a")).toBeUndefined();
  });
});
