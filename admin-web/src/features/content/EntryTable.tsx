import type { SetWord } from "../../models/index";
import { EntryRow } from "./EntryRow";
export function EntryTable({
  entries,
  onEdit,
  onMove,
}: {
  entries: SetWord[];
  onEdit: (entry: SetWord) => void;
  onMove: (index: number, direction: number) => void;
}) {
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Vị trí</th>
              <th>Mục từ</th>
              <th>Nghĩa trọng tâm</th>
              <th>Học liệu trong bộ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((item, index) => (
              <EntryRow
                key={item.wordId}
                entry={item}
                onEdit={() => onEdit(item)}
                onMove={(direction) => onMove(index, direction)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!entries.length && (
        <div className="empty">
          Bản nháp chưa có từ. Chọn từ từ danh mục hoặc nhập hàng loạt.
        </div>
      )}
    </>
  );
}
