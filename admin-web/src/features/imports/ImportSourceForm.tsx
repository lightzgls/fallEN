import type { useImportSource } from "./useImportSource";
import type { ImportColumn } from "../../services/import-files";
import { Icon, Notice, TextField } from "../../components/ui";
export function ImportSourceForm({
  input,
  locked,
  hasDraft,
  onPreview,
  onResume,
  onDraft,
}: {
  input: ReturnType<typeof useImportSource>;
  locked: boolean;
  hasDraft: boolean;
  onPreview: () => void;
  onResume: () => void;
  onDraft: () => void;
}) {
  const {
    pasted,
    table,
    mapping,
    setMapping,
    filename,
    images,
    changePasted,
    source,
    imageFiles,
    dropSourceFile,
    downloadTemplate,
  } = input;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onPreview();
      }}
    >
      <fieldset disabled={locked}>
        <div className="columns import-methods">
          <TextField
            label="Danh sách từ"
            multiline
            maxLength={100000}
            value={pasted}
            disabled={!!table}
            onChange={changePasted}
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
            <button type="button" onClick={downloadTemplate}>
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
            <button type="button" className="link" onClick={dropSourceFile}>
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
          Có thể kèm từ loại, nghĩa trọng tâm, ví dụ, bản dịch, vị trí và tên
          tệp ảnh.
        </small>
        <Notice>
          Ảnh được ghép theo tên tệp, không theo thứ tự tải. Từ chưa tìm thấy
          được giữ để sửa hoặc bỏ qua. Không tạo mục từ mới.
        </Notice>
        <div className="actions">
          <button className="primary" disabled={!hasDraft}>
            <Icon name="eye" />
            Xem trước danh sách
          </button>
          <button type="button" onClick={() => onResume()} disabled={!hasDraft}>
            <Icon name="arrow" />
            Tiếp tục lô đang nhập
          </button>
          <button type="button" onClick={() => onDraft()}>
            <Icon name="back" />
            Về bản nháp
          </button>
        </div>
      </fieldset>
    </form>
  );
}
