import { ReportList } from "./ReportList";
import { ReportDetail } from "./ReportDetail";
export function Reports({
  reportId,
  navigate,
}: {
  reportId?: string;
  navigate: (path: string) => void;
}) {
  return reportId ? (
    <ReportDetail reportId={reportId} navigate={navigate} />
  ) : (
    <ReportList navigate={navigate} />
  );
}
