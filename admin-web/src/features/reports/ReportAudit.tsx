import type { ReportAction } from "../../models";
import { statusLabels, dateLabel } from "./labels";
export function ReportAudit({ actions }: { actions: ReportAction[] }) {
  return (
    <section>
      <h2>Lịch sử xử lý</h2>
      <ol className="audit-list">
        {actions.map((action, index) => (
          <li key={action.actionId || index}>
            <strong>
              {statusLabels[action.fromStatus]} →{" "}
              {statusLabels[action.toStatus]}
            </strong>
            <small> · {dateLabel(action.createdAt)}</small>
            {action.note && <p>{action.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
