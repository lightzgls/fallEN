import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  hash,
  serialize,
} from "../../functions/src/shared/core.js";
import { Timestamp } from "firebase-admin/firestore";

describe("business calendar and stable command identity", () => {
  it("starts the next UTC+7 day at 17:00Z, independently of host timezone", () => {
    expect(dayKey(new Date("2026-10-17T16:59:59.999Z"))).toBe("2026-10-17");
    expect(dayKey(new Date("2026-10-17T17:00:00.000Z"))).toBe("2026-10-18");
    expect(addDays(dayKey(new Date("2026-10-17T16:30:00Z")), 1)).toBe(
      "2026-10-18",
    );
  });

  it("adds calendar days across month, leap-day and year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 3)).toBe("2028-03-03");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-17", 30)).toBe("2026-11-16");
  });

  it("ignores object property order while binding array order and changed payloads", () => {
    expect(hash({ wordId: "book", source: "DICTIONARY" })).toBe(
      hash({ source: "DICTIONARY", wordId: "book" }),
    );
    expect(hash({ ids: ["book", "journey"] })).not.toBe(
      hash({ ids: ["journey", "book"] }),
    );
    expect(hash({ wordId: "book" })).not.toBe(hash({ wordId: "journey" }));
  });

  it("serializes nested Firestore timestamps for Callable DTOs", () => {
    const timestamp = Timestamp.fromDate(new Date("2026-11-04T10:00:00Z"));
    expect(
      serialize({
        savedAt: timestamp,
        rows: [{ createdAt: timestamp }],
        absent: undefined,
      }),
    ).toEqual({
      savedAt: "2026-11-04T10:00:00.000Z",
      rows: [{ createdAt: "2026-11-04T10:00:00.000Z" }],
    });
  });
});
