import type { ImportPreview, ImportRow } from "../../models";
import { Notice } from "../../components/ui";
import { rowLabels } from "./import-labels";
export function ImportPreviewTable({
  preview,
  selected,
  duplicates,
  locked,
  onSelect,
  onDuplicate,
  onResolve,
  onApply,
  onDownload,
  onEditSource,
  onDraft,
}: {
  preview: ImportPreview;
  selected: Set<string>;
  duplicates: Record<string, "ADD" | "UPDATE" | "SKIP">;
  locked: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onDuplicate: (id: string, choice: "UPDATE" | "SKIP") => void;
  onResolve: (row: ImportRow) => void;
  onApply: () => void;
  onDownload: () => void;
  onEditSource: () => void;
  onDraft: () => void;
}) {
  return (
    <>
      <small>
        Lô {preview.importId} · Danh mục {preview.releaseId} · Nháp{" "}
        {preview.draftVersion}
      </small>
      <div className="import-counts">
        {Object.entries(preview.counts).map(([key, count]) => (
          <span key={key}>
            {count} {rowLabels[key] || key}
          </span>
        ))}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Chọn</th>
              <th>Dòng</th>
              <th>Từ</th>
              <th>Trạng thái</th>
              <th>Nội dung cần kiểm tra</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Áp dụng dòng ${row.rowNumber}`}
                    checked={selected.has(row.id)}
                    disabled={
                      locked ||
                      !["READY", "MATCHED", "DUPLICATE"].includes(row.status)
                    }
                    onChange={(e) => onSelect(row.id, e.target.checked)}
                  />
                </td>
                <td>{row.rowNumber}</td>
                <td>{row.rawWord}</td>
                <td>
                  <span className={`status status-${row.status.toLowerCase()}`}>
                    {rowLabels[row.status] || row.status}
                  </span>
                </td>
                <td>
                  {row.errors?.join("; ") || row.focusMeaningId || "—"}
                  {row.status === "DUPLICATE" && (
                    <select
                      aria-label={`Xử lý dòng trùng ${row.rowNumber}`}
                      value={duplicates[row.id] || "SKIP"}
                      onChange={(e) =>
                        onDuplicate(
                          row.id,
                          e.target.value === "UPDATE" ? "UPDATE" : "SKIP",
                        )
                      }
                    >
                      <option value="SKIP">Giữ nội dung đã có</option>
                      <option value="UPDATE">
                        Cập nhật học liệu của dòng này
                      </option>
                    </select>
                  )}
                </td>
                <td>
                  {(row.status === "NEEDS_REVIEW" ||
                    (row.status === "DUPLICATE" && !row.focusMeaningId)) && (
                    <button
                      className="link"
                      onClick={() => onResolve(row)}
                      disabled={locked}
                    >
                      Chọn nghĩa
                    </button>
                  )}
                  {["NOT_FOUND", "INVALID"].includes(row.status) && (
                    <small>Sửa nguồn và xem trước lại, hoặc bỏ qua.</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice>
        Chỉ áp dụng các dòng đã chọn vào bản nháp. Công khai là thao tác riêng.
      </Notice>
      <div className="actions">
        <button
          className="primary"
          disabled={locked || !selected.size || preview.status === "APPLIED"}
          onClick={() => onApply()}
        >
          Áp dụng {selected.size} dòng đã chọn
        </button>
        <button onClick={onDownload}>Tải báo cáo lỗi</button>
        <button onClick={onEditSource} disabled={locked}>
          Sửa danh sách
        </button>
        <button onClick={() => onDraft()}>Về bản nháp</button>
      </div>
    </>
  );
}
