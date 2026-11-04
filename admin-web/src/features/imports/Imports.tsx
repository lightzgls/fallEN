import { useState, type FormEvent } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import { DraftPicker } from "../../components/DraftPicker";
import {
  Dialog,
  Icon,
  Notice,
  QueryState,
  TextField,
} from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api, apiError, completeResult } from "../../services/api";
import {
  defaultMapping,
  mapImportRows,
  readSourceTable,
  uploadImageFiles,
  type ColumnMapping,
  type ImportColumn,
  type SourceTable,
} from "../../services/import-files";
import { downloadText } from "../../utils/content";
import type { ImportPreview, ImportRow } from "../../models";

const rowLabels: Record<string, string> = {
  MATCHED: "Đã khớp",
  READY: "Sẵn sàng",
  NEEDS_REVIEW: "Cần chọn nghĩa",
  NOT_FOUND: "Không tìm thấy",
  DUPLICATE: "Trùng trong bản nháp",
  INVALID: "Dữ liệu lỗi",
  APPLIED: "Đã áp dụng",
  SKIPPED: "Đã bỏ qua",
};
export function Imports({
  navigate,
  onDirty,
}: {
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const draft = useDraft(),
    m = useMutation();
  const [pasted, setPasted] = useState(""),
    [table, setTable] = useState<SourceTable>(),
    [mapping, setMapping] = useState<ColumnMapping>({}),
    [filename, setFilename] = useState(""),
    [images, setImages] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState<ImportPreview>(),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [duplicates, setDuplicates] = useState<
      Record<string, "ADD" | "UPDATE" | "SKIP">
    >({}),
    [resolve, setResolve] = useState<ImportRow>(),
    [confirm, setConfirm] = useState(false),
    [resume, setResume] = useState(false);
  async function source(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const parsed = await readSourceTable(file);
      setTable(parsed);
      setMapping(defaultMapping(parsed.headers));
      setFilename(file.name);
      setPreview(undefined);
      onDirty(true);
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setUploading(false);
    }
  }
  async function imageFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    setUploading(true);
    try {
      const added = await uploadImageFiles(Array.from(files), setMessage);
      setImages({ ...images, ...added });
      setMessage(`Đã kiểm tra ${Object.keys(added).length} ảnh.`);
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setUploading(false);
    }
  }
  function accept(value: ImportPreview) {
    setPreview(value);
    setSelected(
      new Set(
        value.rows
          .filter((row) => ["READY", "MATCHED"].includes(row.status))
          .map((row) => row.id),
      ),
    );
    setDuplicates({});
    onDirty(true);
  }
  function validate(event: FormEvent) {
    event.preventDefault();
    if (!draft.draft) return;
    setError("");
    try {
      const rows = mapImportRows(table, pasted, mapping, images);
      if (!rows.length) {
        setError("Nhập ít nhất một từ.");
        return;
      }
      const payload = {
        wordSetId: draft.draft.wordSet.id,
        revisionId: draft.draft.revision.id,
        pastedRows: rows,
        assetIds: Object.values(images),
        expectedDraftVersion: draft.draft.revision.version,
      };
      void m.execute(
        (id) => api("previewImport", { ...payload, commandId: id }),
        accept,
      );
    } catch (e) {
      setError(apiError(e).message);
    }
  }
  function apply() {
    if (!preview) return;
    const payload = {
      importId: preview.importId,
      selectedRowIds: [...selected],
      skippedRowIds: preview.rows
        .filter((x) => !selected.has(x.id))
        .map((x) => x.id),
      duplicateChoices: duplicates,
      expectedDraftVersion: preview.draftVersion,
      fingerprint: preview.fingerprint,
    };
    void m.execute(
      async (id) =>
        completeResult(
          await api("applyImport", { ...payload, commandId: id }),
          id,
        ),
      (receipt) => {
        setConfirm(false);
        setMessage(
          `Đã áp dụng ${receipt.appliedRowIds.length} dòng vào bản nháp, bỏ qua ${receipt.skippedRowIds.length} dòng.`,
        );
        onDirty(false);
        void draft.refresh();
        void api("getImport", { importId: preview.importId })
          .then(setPreview)
          .catch((e) => setError(apiError(e).message));
      },
    );
  }
  const locked = uploading || m.phase === "saving" || m.phase === "unknown";
  return (
    <>
      <h1>
        {preview
          ? "Xem trước và xử lý từng dòng"
          : "Nhập danh sách vào bản nháp"}
      </h1>
      <p className="muted">
        Dán mỗi dòng một từ/cụm từ hoặc chọn tệp CSV/XLSX.
      </p>
      <DraftPicker />
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {!preview ? (
        <form onSubmit={validate}>
          <fieldset disabled={locked}>
            <div className="columns import-methods">
              <TextField
                label="Danh sách từ"
                multiline
                maxLength={100000}
                value={pasted}
                disabled={!!table}
                onChange={(value) => {
                  setPasted(value);
                  onDirty(!!value);
                }}
              />
              <div className="file-actions">
                <label className="button file-button">
                  Chọn CSV / XLSX
                  <input
                    hidden
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => void source(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      "fallen-import.csv",
                      "word,partOfSpeech,focusMeaningId,example,exampleTranslation,position,imagePath,imageAlt\n",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Tải tệp mẫu
                </button>
                <label className="button file-button">
                  <Icon name="upload" />
                  Chọn ảnh / ZIP
                  <input
                    hidden
                    multiple
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.zip"
                    onChange={(e) => void imageFiles(e.target.files)}
                  />
                </label>
              </div>
            </div>
            {filename && (
              <div className="notice">
                {filename} · {table?.rows.length} dòng
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setTable(undefined);
                    setFilename("");
                  }}
                >
                  Bỏ tệp, dùng danh sách
                </button>
              </div>
            )}
            {table && (
              <div className="columns three">
                {(
                  [
                    "word",
                    "partOfSpeech",
                    "focusMeaningId",
                    "example",
                    "exampleTranslation",
                    "position",
                    "imagePath",
                    "imageAlt",
                  ] as ImportColumn[]
                ).map((key) => (
                  <div className="field" key={key}>
                    <label htmlFor={`map-${key}`}>
                      {key}
                      {key === "word" ? " *" : ""}
                    </label>
                    <select
                      id={`map-${key}`}
                      value={mapping[key] || ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          [key]: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">Không đối chiếu</option>
                      {table.headers.map((header) => (
                        <option key={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(images).length > 0 && (
              <small>Ảnh đã kiểm tra: {Object.keys(images).join(", ")}</small>
            )}
            <p>Cột bắt buộc: word</p>
            <small>
              Có thể kèm từ loại, nghĩa trọng tâm, ví dụ, bản dịch, vị trí và
              tên tệp ảnh.
            </small>
            <Notice>
              Ảnh được ghép theo tên tệp, không theo thứ tự tải. Từ chưa tìm
              thấy được giữ để sửa hoặc bỏ qua. Không tạo mục từ mới.
            </Notice>
            <div className="actions">
              <button className="primary" disabled={!draft.draft}>
                <Icon name="eye" />
                Xem trước danh sách
              </button>
              <button
                type="button"
                onClick={() => setResume(true)}
                disabled={!draft.draft}
              >
                <Icon name="arrow" />
                Tiếp tục lô đang nhập
              </button>
              <button type="button" onClick={() => navigate("/draft")}>
                <Icon name="back" />
                Về bản nháp
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
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
                          !["READY", "MATCHED", "DUPLICATE"].includes(
                            row.status,
                          )
                        }
                        onChange={(e) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>{row.rowNumber}</td>
                    <td>{row.rawWord}</td>
                    <td>
                      <span
                        className={`status status-${row.status.toLowerCase()}`}
                      >
                        {rowLabels[row.status] || row.status}
                      </span>
                    </td>
                    <td>
                      {row.errors?.join("; ") || row.focusMeaningId || "—"}
                      {row.status === "DUPLICATE" && (
                        <select
                          aria-label={`Xử lý dòng trùng ${row.rowNumber}`}
                          value={duplicates[row.id] || "SKIP"}
                          onChange={(e) => {
                            const value = e.target.value as "UPDATE" | "SKIP";
                            setDuplicates({ ...duplicates, [row.id]: value });
                            setSelected((current) => {
                              const next = new Set(current);
                              if (value === "UPDATE") next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
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
                        (row.status === "DUPLICATE" &&
                          !row.focusMeaningId)) && (
                        <button
                          className="link"
                          onClick={() => setResolve(row)}
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
            Chỉ áp dụng các dòng đã chọn vào bản nháp. Công khai là thao tác
            riêng.
          </Notice>
          <div className="actions">
            <button
              className="primary"
              disabled={
                locked || !selected.size || preview.status === "APPLIED"
              }
              onClick={() => setConfirm(true)}
            >
              Áp dụng {selected.size} dòng đã chọn
            </button>
            <button
              onClick={() =>
                downloadText(
                  `import-${preview.importId}.json`,
                  JSON.stringify(preview, null, 2),
                  "application/json",
                )
              }
            >
              Tải báo cáo lỗi
            </button>
            <button
              onClick={() => {
                setPreview(undefined);
                onDirty(!!pasted || !!table);
              }}
              disabled={locked}
            >
              Sửa danh sách
            </button>
            <button onClick={() => navigate("/draft")}>Về bản nháp</button>
          </div>
        </>
      )}
      {confirm && preview && (
        <Dialog
          title="Xác nhận dòng sẽ áp dụng"
          onClose={() => setConfirm(false)}
        >
          <p>
            Áp dụng {selected.size} dòng; bỏ qua{" "}
            {preview.rows.length - selected.size} dòng.
          </p>
          <Notice>
            Máy chủ đối chiếu fingerprint, phiên bản danh mục và bản nháp. Lô
            lỗi có thể tiếp tục bằng cùng mã lệnh.
          </Notice>
          <div className="actions">
            <button className="primary" disabled={locked} onClick={apply}>
              Xác nhận áp dụng
            </button>
            <button onClick={() => setConfirm(false)} disabled={locked}>
              Quay lại
            </button>
          </div>
        </Dialog>
      )}
      {resolve && preview && (
        <ResolveRow
          row={resolve}
          preview={preview}
          onClose={() => setResolve(undefined)}
          onResolved={(value) => {
            accept(value);
            setResolve(undefined);
          }}
        />
      )}
      {resume && draft.draft && (
        <ResumeImport
          wordSetId={draft.draft.wordSet.id}
          onClose={() => setResume(false)}
          onSelect={(value) => {
            accept(value);
            setResume(false);
          }}
        />
      )}
    </>
  );
}
function ResumeImport({
  wordSetId,
  onClose,
  onSelect,
}: {
  wordSetId: string;
  onClose: () => void;
  onSelect: (value: ImportPreview) => void;
}) {
  const query = useQuery(() => api("listImports", { wordSetId }));
  const [error, setError] = useState("");
  async function load(id: string) {
    try {
      onSelect(await api("getImport", { importId: id }));
    } catch (e) {
      setError(apiError(e).message);
    }
  }
  return (
    <Dialog title="Tiếp tục lô nhập" onClose={onClose}>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
        empty={query.data?.items.length === 0}
      >
        {query.data?.items.map((item) => (
          <button
            className="resume-row"
            key={item.importId}
            onClick={() => void load(item.importId)}
          >
            {item.importId} · {item.status || "Xem trước"} · nháp{" "}
            {item.draftVersion}
          </button>
        ))}
      </QueryState>
      {error && <Notice tone="error">{error}</Notice>}
    </Dialog>
  );
}
function ResolveRow({
  row,
  preview,
  onClose,
  onResolved,
}: {
  row: ImportRow;
  preview: ImportPreview;
  onClose: () => void;
  onResolved: (value: ImportPreview) => void;
}) {
  const [meaning, setMeaning] = useState(row.focusMeaningId || "");
  const [error, setError] = useState("");
  const mutation = useMutation();
  function save() {
    if (!row.resolvedWordId || !meaning) return;
    const payload = {
      importId: preview.importId,
      rowId: row.id,
      wordId: row.resolvedWordId,
      focusMeaningId: meaning,
      expectedDraftVersion: preview.draftVersion,
    };
    void mutation.execute(
      (id) => api("resolveImportRow", { ...payload, commandId: id }),
      () => {
        void api("getImport", { importId: preview.importId })
          .then(onResolved)
          .catch((e) => setError(apiError(e).message));
      },
    );
  }
  return (
    <Dialog
      title={`Chọn nghĩa trọng tâm · dòng ${row.rowNumber} · ${row.rawWord}`}
      onClose={onClose}
    >
      <Notice>
        Chọn nghĩa của mục từ đã khớp chính xác trong danh mục đã pin. Không tự
        nhận gợi ý gần đúng.
      </Notice>
      <div className="field">
        <label htmlFor="resolve-meaning">Nghĩa trọng tâm</label>
        <select
          id="resolve-meaning"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
        >
          <option value="">Chọn nghĩa</option>
          {row.meaningCandidates?.map((x) => (
            <option value={x.id} key={x.id}>
              {x.partOfSpeech} · {x.text}
            </option>
          ))}
        </select>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="actions">
        <button
          className="primary"
          onClick={save}
          disabled={!meaning || mutation.phase === "saving"}
        >
          Xác nhận nghĩa
        </button>
        <button onClick={onClose}>Quay lại</button>
      </div>
    </Dialog>
  );
}
