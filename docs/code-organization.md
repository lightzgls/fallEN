# Tổ chức module sau review Clean Code

Backend và web admin được chia theo trách nhiệm; tên Callable, payload/receipt, schema lưu trữ và hành vi UI giữ nguyên. [Các lớp và luồng backend](backend-layers.md) giải thích chi tiết hai luồng tạo bộ từ và đánh giá thẻ trên mobile.

## Backend

`functions/src/index.ts` chỉ tái xuất các endpoint/job công khai. `routes/` đăng ký Callable theo feature và ghép store, service, controller. `middleware/` chứa guard xác thực/quyền và ánh xạ lỗi; `controllers/` validate request rồi gọi operation typed. Các file `services/*.ts` là factory thuần nhận store contract; operation nằm trong thư mục feature tương ứng:

| Feature              | Trách nhiệm đã tách                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `services/content/`  | Draft và truy vấn bộ; kiểm tra/công bố revision; preview/đối chiếu import; tiếp nhận/apply lô; áp dụng một dòng; upload; cấu hình TTS/AI |
| `services/learning/` | Membership kho; khởi tạo/kết thúc Study; ngữ cảnh đánh giá; đọc và kiểm chứng trạng thái rating; chốt kết quả; thống kê                  |
| `services/game/`     | Nguồn và PREPARING; chọn câu; khởi tạo lượt; chốt lần trả lời đầu; kết thúc/kết quả                                                      |
| `services/chat/`     | Bắt đầu; điều phối gửi; ACK; điều phối kết thúc; lấy góp ý tổng kết; dữ liệu context và các truy vấn                                     |
| `services/reports/`  | Gửi/đổi trạng thái; xác minh học liệu sửa; truy vấn công khai/admin                                                                      |
| `services/profile/`  | Lệnh hồ sơ; truy vấn; cấp/finalize avatar                                                                                                |

`contracts/` chứa schema request, kiểu record và các port đọc/ghi theo nhu cầu operation. `domain/` chứa quy tắc SRS, chọn/chấm câu, quyền đọc release/revision, giá trị nguồn, so sánh học liệu và chuyển trạng thái. Service/domain không có phụ thuộc runtime vào Firebase hay infrastructure; rich lexical data còn giữ alias kiểu `Data` cũ như ghi trong hướng dẫn lớp backend.

`infrastructure/` thực hiện query, transaction, Auth, Storage, chuẩn hóa ảnh, ký URL và chuyển Timestamp/Date. Quyết định SRS, Game, import/publication, report/FIXED, turn/ENDING, xóa tài khoản và điều kiện GC avatar nằm ở service/domain. Gemini vẫn là một `ChatApi` nhỏ được inject vào điều phối hội thoại; reply/context không được ghi vào metadata bền vững.

Adapter chạy transaction và cấp context đọc/ghi theo nghiệp vụ cho callback service. ACTIVE, receipt/hash, kiểm tra version, nguồn kết quả và tổng hợp giữ cùng ranh giới commit; receipt được đọc trước CAS. Gemini và xử lý bytes ảnh vẫn chạy ngoài callback transaction có thể bị Firestore gọi lại.

Pipeline operator trong `tools/dictionary/` tách manifest/schema, kiểm tra nguồn–alias–quan hệ, staging bất biến và transaction đổi public pointer; `publish.ts` điều phối các bước này.

## Web admin

- `app/` tách session, draft state, mutation/recovery, shell, navigation/dirty prompt và theme. `contexts.ts` tái xuất các provider và hook dùng chung.
- `features/content/` tách metadata form, bảng/một hàng từ, editor học liệu, flashcard preview và publication dialogs. Các hook quản lý state/lệnh của editor và publish.
- `features/imports/` tách nhập nguồn, preview table, confirmation, resolve/resume và các hook nguồn/lựa chọn/command.
- `features/reports/` tách queue/detail, context/audit/status form và logic chuẩn bị tham chiếu nguồn sửa.
- `models/` chia DTO theo dictionary, content, import, configuration, report, command và API; `index.ts` chỉ tái xuất kiểu.

SDK truy cập qua `services/`. JSX tập trung render và phát sự kiện; payload ổn định, version, command journal và xử lý kết quả chưa rõ được giữ ở các hook/service hiện có.

## Quy ước đặt tên file

- Component và context React dùng `PascalCase.tsx`: `DraftEditor.tsx`, `DeckDialogs.tsx`, `SessionContext.tsx`. File màn hình mang tên component chính; `Topics.tsx` và `Limit.tsx` là hai màn hình riêng.
- Hook dùng `useCamelCase.ts`: `useNavigation.ts`, `usePublishDeck.ts`.
- Backend, model và module hỗ trợ dùng `kebab-case.ts`: `import-worker.ts`, `round-store.ts`, `command-journal.ts`. Giữ các tên entry/barrel và hậu tố công cụ thông dụng như `index.ts`, `main.tsx`, `contexts.ts`, `vite.config.ts`, `*.test.ts`, `*.spec.ts`.
- Dùng ngữ cảnh thư mục để tránh lặp: `profile/reader.ts`, `reports/labels.ts`. Tên vẫn cần nêu rõ vai trò khi dễ nhầm: `import-commands.ts` tiếp nhận lệnh, `import-worker.ts` tiếp tục xử lý lô, `apply-row.ts` áp dụng một dòng.
- Chỉ dùng viết tắt quen thuộc như `api`, `config`, `stats`, `refs`; không tự rút gọn thành tên khó đoán. Import phải khớp chính xác chữ hoa/thường để chạy được trên Linux.

## Cách kiểm chứng

Review số dòng đi kèm đánh giá trách nhiệm, chiều phụ thuộc, import vòng và đối chiếu thân hàm trước/sau. Không thêm test đếm dòng hoặc test phản chiếu cấu trúc file. Bộ kiểm thử nghiệp vụ, emulator và browser hiện có bảo vệ hợp đồng và hành vi. Kết quả cuối được ghi trong `tests/review-record.md` và `docs/validation.md`.
