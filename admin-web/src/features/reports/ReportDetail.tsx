import { Notice, QueryState } from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";
import { categoryLabels, statusLabels } from "./report-labels";
import { ReportContext } from "./ReportContext";
import { ReportStatusForm } from "./ReportStatusForm";
import { ReportAudit } from "./ReportAudit";
import { useReportStatus } from "./useReportStatus";
import { useReportSource } from "./useReportSource";
export function ReportDetail({
  reportId,
  navigate,
}: {
  reportId: string;
  navigate: (path: string) => void;
}) {
  const query = useQuery(() => api("getReport", { reportId }), [reportId]);
  const status = useReportStatus(query.data, query.reload);
  const openSource = useReportSource(navigate, status.setError);
  return (
    <>
      <div className="heading-row">
        <h1>Báo lỗi · {reportId}</h1>
        <button onClick={() => navigate("/reports")}>Về danh sách</button>
      </div>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
      >
        {query.data && (
          <>
            <Notice>
              {statusLabels[query.data.status]} · Phiên bản {query.data.version}{" "}
              · {categoryLabels[query.data.category]}
            </Notice>
            <div className="columns two">
              <ReportContext report={query.data} onOpenSource={openSource} />
              <ReportStatusForm
                report={query.data}
                state={status}
                onReload={query.reload}
              />
            </div>
            {query.data.actions && <ReportAudit actions={query.data.actions} />}
          </>
        )}
      </QueryState>
    </>
  );
}
