export const transitions: Record<string, readonly string[]> = {
  OPEN: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_RELEASE", "RESOLVED", "REJECTED"],
  WAITING_RELEASE: ["IN_REVIEW", "RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};
