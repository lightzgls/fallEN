import type { ReportStatus, ReportCategory } from "../../models";
export const statusLabels: Record<ReportStatus, string> = {
  OPEN: "Đã tiếp nhận",
  IN_REVIEW: "Đang xử lý",
  WAITING_RELEASE: "Chờ phát hành",
  RESOLVED: "Đã xử lý",
  REJECTED: "Từ chối",
};
export const categoryLabels: Record<ReportCategory, string> = {
  MEANING: "Nghĩa từ",
  EXAMPLE_TRANSLATION: "Ví dụ / bản dịch",
  IMAGE: "Ảnh minh họa",
  PRONUNCIATION: "Phát âm",
  OTHER: "Khác",
};
export const transitions: Record<ReportStatus, ReportStatus[]> = {
  OPEN: ["IN_REVIEW"],
  IN_REVIEW: ["WAITING_RELEASE", "RESOLVED", "REJECTED"],
  WAITING_RELEASE: ["IN_REVIEW", "RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};
export function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
