import type { ReportStatus, ReportCategory } from "../../models";
import { Notice, QueryState } from "../../components/Ui";
import { statusLabels, categoryLabels, dateLabel } from "./labels";
import { useReportList } from "./useReportList";
export function ReportList({ navigate }: { navigate: (path: string) => void }) {
  const {
    status,
    setStatus,
    category,
    setCategory,
    query,
    page,
    loadingMore,
    error,
    more,
  } = useReportList();
  return (
    <>
      <h1>Báo lỗi học liệu</h1>
      <div className="columns three">
        <div className="field">
          <label htmlFor="report-status">Trạng thái</label>
          <select
            id="report-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReportStatus | "")}
          >
            <option value="">Tất cả</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-category">Loại báo lỗi</label>
          <select
            id="report-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory | "")}
          >
            <option value="">Tất cả</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="link" onClick={query.reload}>
          Tải lại báo lỗi
        </button>
      </div>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
        empty={page?.items.length === 0}
      >
        <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Mã báo lỗi</th>
                <th>Mục / ngữ cảnh</th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th>Ngày gửi</th>
              </tr>
            </thead>
            <tbody>
              {page?.items.map((report) => (
                <tr key={report.reportId}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        navigate(
                          `/reports/${encodeURIComponent(report.reportId)}`,
                        )
                      }
                    >
                      {report.reportId}
                    </button>
                  </td>
                  <td>
                    {String(
                      report.targetSnapshot.spelling || report.targetRef.wordId,
                    )}
                    <small className="block">
                      {report.targetRef.type === "SET_WORD"
                        ? report.targetRef.wordSetId
                        : "Mục từ"}
                    </small>
                  </td>
                  <td>{categoryLabels[report.category]}</td>
                  <td>{statusLabels[report.status]}</td>
                  <td>{dateLabel(report.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button
          onClick={() => void more()}
          disabled={!page?.cursor || loadingMore}
        >
          {loadingMore ? "Đang tải…" : "Tải thêm báo lỗi"}
        </button>
      </QueryState>
    </>
  );
}
