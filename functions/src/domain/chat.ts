import { z } from "zod";

export const contextSchema = z
  .object({
    pairs: z
      .array(
        z
          .object({
            turnId: z.string().min(1).max(160),
            learner: z.string().min(1).max(2000),
            assistant: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .max(15),
  })
  .strict()
  .refine(
    (value) => JSON.stringify(value).length <= 32_000,
    "Context exceeds deployment bound",
  );
export type ChatContext = z.infer<typeof contextSchema>;
export interface ReferenceWord {
  wordId: string;
  wordVersion: number;
  wordOrder: number;
  spelling: string;
  otherSpellings: string[];
}
export interface ChatPrompt {
  scenario: {
    name: string;
    context: string;
    learnerRole: string;
    aiRole: string;
    goal: string;
    openingLine: string;
    guide: string;
  };
  words: ReferenceWord[];
  context: ChatContext;
  message?: string;
}
export const replySchema = z
  .object({ reply: z.string().trim().min(1).max(4000) })
  .strict();
export const feedbackSchema = z
  .object({
    strengths: z.array(z.string().trim().min(1).max(300)).max(5),
    tips: z.array(z.string().trim().min(1).max(300)).max(3),
  })
  .strict();
export interface ChatApi {
  reply(prompt: ChatPrompt): Promise<z.infer<typeof replySchema>>;
  giveFeedback(prompt: ChatPrompt): Promise<z.infer<typeof feedbackSchema>>;
}
export function mentionedWords(
  words: ReferenceWord[],
  context: ChatContext,
): string[] {
  const text = context.pairs
    .map((pair) => pair.learner)
    .join("\n")
    .normalize("NFKC")
    .toLocaleLowerCase("en");
  return words
    .filter((word) =>
      [word.spelling, ...word.otherSpellings].some((spelling) => {
        const escaped = spelling
          .normalize("NFKC")
          .toLocaleLowerCase("en")
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\s+/g, "\\s+");
        return new RegExp(
          `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
          "u",
        ).test(text);
      }),
    )
    .map((word) => word.wordId);
}
/** The context is untrusted user data. A valid reply never proves language correctness. */
export function validateContextOrder(
  context: ChatContext,
  deliveredTurnIds: string[],
): boolean {
  return (
    context.pairs.length === deliveredTurnIds.length &&
    context.pairs.every(
      (pair, index) => pair.turnId === deliveredTurnIds[index],
    )
  );
}
