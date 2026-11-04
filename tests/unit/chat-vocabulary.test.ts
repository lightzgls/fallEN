import { describe, expect, it } from "vitest";
import { mentionedWords } from "../../functions/src/domain/chat.js";

describe("AI reference-word mention boundaries", () => {
  const words = [
    {
      wordId: "book",
      wordVersion: 1,
      wordOrder: 0,
      spelling: "book",
      otherSpellings: ["books"],
    },
    {
      wordId: "take-off",
      wordVersion: 1,
      wordOrder: 1,
      spelling: "take off",
      otherSpellings: [],
    },
  ];
  it("matches declared variants and phrases in learner messages only", () => {
    expect(
      mentionedWords(words, {
        pairs: [
          {
            turnId: "one",
            learner: "I have BOOKS; planes take   off.",
            assistant: "book",
          },
        ],
      }),
    ).toEqual(["book", "take-off"]);
  });
  it("rejects substrings and assistant-only mentions", () => {
    expect(
      mentionedWords(words, {
        pairs: [
          {
            turnId: "one",
            learner: "A bookshelf and a take officer.",
            assistant: "book take off",
          },
        ],
      }),
    ).toEqual([]);
  });
});
