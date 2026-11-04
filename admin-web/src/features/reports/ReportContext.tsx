import type { ContentReport } from "../../models";
import { Notice } from "../../components/ui";
import { dateLabel } from "./report-labels";
export function ReportContext({
  report,
  onOpenSource,
}: {
  report: ContentReport;
  onOpenSource: (report: ContentReport) => Promise<void>;
}) {
  return (
    <section>
      <h2>Nội dung người học đã gửi</h2>
      <p className="preserve-lines">{report.description}</p>
      <h3>Ngữ cảnh học liệu</h3>
      <dl>
        <dt>Mục từ</dt>
        <dd>
          {String(report.targetSnapshot.spelling || report.targetRef.wordId)}
        </dd>
        <dt>Bản từ</dt>
        <dd>
          {report.targetRef.wordVersion ||
            String(report.targetSnapshot.wordVersion || "—")}
        </dd>
        {report.targetRef.revisionId && (
          <>
            <dt>Bộ / revision</dt>
            <dd>
              {report.targetRef.wordSetId} / {report.targetRef.revisionId}
            </dd>
          </>
        )}
        {report.targetRef.speechVersion && (
          <>
            <dt>Speech</dt>
            <dd>{report.targetRef.speechVersion}</dd>
          </>
        )}
        <dt>Ngày gửi</dt>
        <dd>{dateLabel(report.createdAt)}</dd>
      </dl>
      {["SET_WORD", "SPEECH"].includes(report.targetRef.type) ? (
        <button onClick={() => void onOpenSource(report)}>Mở nguồn sửa</button>
      ) : (
        <Notice>
          Nghĩa từ điển gốc chỉ đọc. Chuyển Chờ phát hành để người vận hành xử
          lý danh mục.
        </Notice>
      )}
    </section>
  );
}
