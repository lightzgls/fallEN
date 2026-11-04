import type { SetWord } from "../../models";
import { useQuery } from "../../hooks/useQuery";
import { api } from "../../services/api";
export function EntryRow({
  entry,
  onEdit,
  onMove,
}: {
  entry: SetWord;
  onEdit: () => void;
  onMove: (direction: number) => void;
}) {
  const word = useQuery(
    () =>
      api("getWordVersion", {
        wordId: entry.wordId,
        wordVersion: entry.wordVersion,
      }),
    [entry.wordId, entry.wordVersion],
  );
  const meaning = word.data?.meanings.find(
    (x) => x.id === entry.focusMeaningId,
  );
  return (
    <tr>
      <td>{entry.position}</td>
      <td>
        {word.data?.spelling || entry.wordId}
        <small className="block">Bản từ {entry.wordVersion}</small>
      </td>
      <td>
        {meaning
          ? `${meaning.text} · ${meaning.partOfSpeech}`
          : word.error
            ? "Không tải được nghĩa"
            : "Mặc định từ điển"}
      </td>
      <td>
        {entry.example ? "Có ví dụ" : "Chưa có ví dụ"}
        {entry.imageAssetId ? " và ảnh" : ""} ·{" "}
        <button type="button" className="link" onClick={onEdit}>
          Sửa
        </button>
      </td>
      <td>
        <button
          type="button"
          className="icon-button"
          aria-label={`Chuyển ${word.data?.spelling || entry.wordId} lên`}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Chuyển ${word.data?.spelling || entry.wordId} xuống`}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
      </td>
    </tr>
  );
}
