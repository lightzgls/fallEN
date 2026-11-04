# Tổ chức module sau review Clean Code

Lần review tiếp theo ngày 04/11/2026 phát hiện các file service và màn quản trị gom nhiều trách nhiệm. Lần refactor này giữ nguyên tên Callable, payload/receipt, schema lưu trữ và hành vi UI; thay đổi ranh giới module và cách điều phối nội bộ.

## Backend

Các file `functions/src/services/*.ts` là điểm ghép các operation và giữ tương thích cho Callable, worker và test. Code thực thi nằm trong thư mục feature tương ứng:

| Feature              | Trách nhiệm đã tách                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `services/content/`  | Draft và truy vấn bộ; kiểm tra/công bố revision; preview/đối chiếu import; tiếp nhận/apply lô; áp dụng một dòng; upload; cấu hình TTS/AI |
| `services/learning/` | Membership kho; khởi tạo/kết thúc Study; ngữ cảnh đánh giá; đọc và kiểm chứng trạng thái rating; chốt kết quả; thống kê                  |
| `services/game/`     | Nguồn và PREPARING; chọn câu; khởi tạo lượt; chốt lần trả lời đầu; kết thúc/kết quả                                                      |
| `services/chat/`     | Bắt đầu; điều phối gửi; ACK; điều phối kết thúc; lấy góp ý tổng kết; dữ liệu context và các truy vấn                                     |
| `services/reports/`  | Gửi/đổi trạng thái; xác minh học liệu sửa; truy vấn công khai/admin                                                                      |
| `services/profile/`  | Lệnh hồ sơ; truy vấn; cấp/finalize avatar                                                                                                |

`domain/` chứa quy tắc SRS, chọn/chấm câu, giá trị nguồn, schema, so sánh học liệu theo loại báo lỗi và DTO. Các module này dùng import hẹp để tránh khởi tạo Firebase khi chỉ cần quy tắc hoặc kiểu dữ liệu.

`infrastructure/` chứa reader từ điển và immutable index/cache; snapshot nguồn report; bộ giải mã/Storage/URL/GC avatar; transaction repository cho turn/ENDING AI; references và adapter của từng feature. Gemini vẫn là một `ChatApi` nhỏ được truyền vào điều phối hội thoại.

Transaction vẫn dùng cùng đối tượng `tx` qua các hàm đọc/kiểm chứng/stage. Receipt, nguồn kết quả và tổng hợp giữ cùng ranh giới commit. Gemini và xử lý bytes ảnh vẫn chạy ngoài callback transaction có thể bị Firestore gọi lại.

Pipeline operator trong `tools/dictionary/` tách manifest/schema, kiểm tra nguồn–alias–quan hệ, staging bất biến và transaction đổi public pointer; `publish.ts` điều phối các bước này.

## Web admin

- `app/` tách session, draft state, mutation/recovery, shell, navigation/dirty prompt và theme. Các import cũ qua `contexts.tsx` được giữ tương thích.
- `features/content/` tách metadata form, bảng/một hàng từ, editor học liệu, flashcard preview và publication dialogs. Các hook quản lý state/lệnh của editor và publish.
- `features/imports/` tách nhập nguồn, preview table, confirmation, resolve/resume và các hook nguồn/lựa chọn/command.
- `features/reports/` tách queue/detail, context/audit/status form và logic chuẩn bị tham chiếu nguồn sửa.
- `models/` chia DTO theo dictionary, content, import, configuration, report, command và API; `index.ts` chỉ tái xuất kiểu.

SDK truy cập qua `services/`. JSX tập trung render và phát sự kiện; payload ổn định, version, command journal và xử lý kết quả chưa rõ được giữ ở các hook/service hiện có.

## Cách kiểm chứng

Review số dòng đi kèm đánh giá trách nhiệm, chiều phụ thuộc, import vòng và đối chiếu thân hàm trước/sau. Không thêm test đếm dòng hoặc test phản chiếu cấu trúc file. Bộ kiểm thử nghiệp vụ, emulator và browser hiện có bảo vệ hợp đồng và hành vi. Kết quả cuối được ghi trong `tests/review-record.md` và `docs/validation.md`.
