export interface SummaryFeedback {
  strengths: string[];
  tips: string[];
  mentionedWordIds: string[];
  feedbackStatus: "NOT_REQUESTED" | "UNAVAILABLE" | "AVAILABLE";
}
