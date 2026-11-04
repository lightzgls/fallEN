import { beforeEach, describe, expect, it } from "vitest";
import { command, db, checkVersion } from "../../functions/src/shared/core.js";
import {
  businessCode,
  learner,
  otherLearner,
  read,
  resetData,
  seedData,
} from "./fixtures.js";

beforeEach(async () => {
  await resetData();
  await seedData();
});

describe("transaction command receipts", () => {
  const increment = (commandId: string, expectedVersion: number, amount = 1) =>
    command(
      learner,
      "test-increment",
      { commandId, expectedVersion, amount },
      async (tx) => {
        const ref = db.doc(`users/${learner.uid}/dashboard/summary`);
        const prior = (await tx.get(ref)).data() ?? {
          version: 0,
          learnedCount: 0,
        };
        checkVersion(prior.version, expectedVersion);
        const result = {
          version: prior.version + 1,
          learnedCount: prior.learnedCount + amount,
        };
        tx.set(ref, result);
        return result;
      },
    );

  it("returns the saved receipt before checking stale object versions and changes state once", async () => {
    const first = await increment("receipt-one", 0);
    expect(await increment("receipt-one", 0)).toEqual(first);
    expect(await read(`users/${learner.uid}/dashboard/summary`)).toEqual({
      version: 1,
      learnedCount: 1,
    });
    expect(
      (await db.collection(`users/${learner.uid}/commands`).get()).size,
    ).toBe(1);
  });

  it("binds an ID to kind and payload, refusing a changed retry", async () => {
    await increment("bound-one", 0);
    expect(await businessCode(increment("bound-one", 0, 2))).toBe(
      "COMMAND_REUSED",
    );
    expect(
      await businessCode(
        command(
          learner,
          "different-kind",
          { commandId: "bound-one", expectedVersion: 0, amount: 1 },
          async () => ({ ignored: true }),
        ),
      ),
    ).toBe("COMMAND_REUSED");
  });

  it("serializes concurrent duplicate requests and protects new commands with CAS", async () => {
    const replies = await Promise.all([
      increment("concurrent", 0),
      increment("concurrent", 0),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect(await businessCode(increment("stale-new-command", 0))).toBe(
      "CONFLICT",
    );
    expect(
      await read(`users/${learner.uid}/commands/stale-new-command`),
    ).toBeUndefined();
  });

  it("scopes receipts to the actor and blocks DELETING accounts before callback or replay", async () => {
    await increment("shared-key", 0);
    const other = await command(
      otherLearner,
      "test-increment",
      { commandId: "shared-key" },
      async () => ({ owner: otherLearner.uid }),
    );
    expect(other.owner).toBe(otherLearner.uid);
    await db.doc(`accountStates/${learner.uid}`).update({ status: "DELETING" });
    expect(await businessCode(increment("shared-key", 0))).toBe(
      "ACCOUNT_DELETING",
    );
  });
});
