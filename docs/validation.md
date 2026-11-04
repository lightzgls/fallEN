# Nghiệm thu local — 04/11/2026

## Tách trách nhiệm các lớp backend

Backend hiện có `routes/`, `middleware/`, `controllers/`, `services/`, `contracts/`, `domain/` và `infrastructure/`; xem [luồng và trách nhiệm từng lớp](backend-layers.md). Controllers validate request, services nhận input typed và store được inject, domain giữ quy tắc thuần, adapter thực hiện Firebase/Auth/Storage/query/transaction. Quy tắc chọn nguồn từ điển, lease/ACK/ENDING AI, checkpoint xóa tài khoản và điều kiện GC avatar cũng được tách khỏi SDK. Web admin và hợp đồng Callable giữ nguyên.

Kiểm tra cuối trên Node.js 22.23.4:

- Lint, strict typecheck toàn bộ backend/admin/tools/tests, Functions build và Vite build đạt.
- Unit **71/71**, 14 file; có test store được inject, controller/guard/error mapping, receipt collision, nguồn retained và GC lease.
- Emulator **68/68**, 11 file, trong **63,17 giây**. Hai ca mới ghi command SUCCEEDED/IN_PROGRESS của operation khác rồi kiểm tra start/end chat từ chối COMMAND_REUSED trước decode receipt/CAS, giữ quota và trạng thái.
- Browser **3/3** trong **38,2 giây**, dùng Auth/Callable/Tasks emulator thật cho publish/reload/quota, learner denial và import.
- Audit 169 module giữ đủ **84/84** export endpoint/job; không import thiếu/sai case, vòng phụ thuộc hay phụ thuộc infrastructure/Firebase runtime từ service/domain. Mọi file production backend dưới 300 dòng. Alias kiểu `Data` cũ cho rich lexical data vẫn là ngoại lệ type-only đã ghi rõ trong hướng dẫn lớp backend.

Reviewer độc lập đã rà quyết định nghiệp vụ, transaction, worker, public exports và test hồi quy. Agent chính review lại các test controller/middleware do reviewer viết, kiểm tra các service callback, sửa nhận xét, tích hợp và chạy toàn bộ pipeline. Lần emulator đầu phát hiện receipt profile replay trả Timestamp trong khi kết quả đầu dùng Date; đã chuẩn hóa tại adapter và chạy lại đầy đủ, giữ nguyên assertion so sánh receipt. Các tiến trình kiểm thử đã dừng.

Log local bị gitignore: `.local/layering-typecheck.log`, `.local/layering-lint.log`, `.local/layering-build.log`, `.local/layering-unit.log`, `.local/layering-emulator-final.log`, `.local/layering-browser.log`, `.local/layering-audit.log`. Giới hạn kiểm chứng môi trường thật bên dưới vẫn áp dụng.

## Chuẩn hóa tên file

Đổi 70 đường dẫn theo [quy ước đặt tên](code-organization.md#quy-ước-đặt-tên-file), đồng bộ tên component/hook và import; tách hai màn `Topics.tsx` và `Limit.tsx` từ file AI chung. Đối chiếu AST của 194 file TS/TSX với commit trước, sau khi chuẩn hóa import và các identifier được đổi tên, không thấy thay đổi phần thân mã. Tên Callable, payload và schema giữ nguyên.

Kiểm tra sau đổi tên trên Node.js 22.23.4: lint, strict typecheck, Functions/Vite build và 19 unit test đạt; 66 test emulator đạt trong 63,13 giây; 3 test trình duyệt đạt trong 40,6 giây. Functions được build lại sau khi xóa output cũ để các module còn sót không che lỗi import. Log local: `.local/naming-typecheck.log`, `.local/naming-lint.log`, `.local/naming-build.log`, `.local/naming-unit.log`, `.local/naming-body-audit.log`, `.local/naming-emulator.log`, `.local/naming-browser.log`. Các dịch vụ kiểm thử đã dừng.

## Review tổ chức code tiếp theo

Đã refactor các file gom nhiều trách nhiệm thành các operation, component và hook theo feature; xem [bản đồ module](code-organization.md). API, schema, receipt và giao diện giữ nguyên. Toàn bộ `.ts`/`.tsx` trong `functions/src`, `admin-web/src` và `tools` hiện không có file vượt 300 dòng; file dài nhất 290 dòng. Đây là kết quả review trách nhiệm, không phải giới hạn dòng được dùng thay kiểm thử.

Kiểm tra lại trên Node22.23.4: lint/typecheck/build đạt; unit19/19; emulator66/66 trong76,46giây; browser3/3 trong39,1giây. Riêng10test học tập/SRS chạy lại và đạt sau khi hàm tạo lịch chuyển sang nhận `Date` để bỏ phụ thuộc Timestamp của Firebase. Log local: `.local/refactor-build.log`, `.local/refactor-emulator.log`, `.local/refactor-learning.log`, `.local/refactor-browser.log`.

Reviewer độc lập đã rà các phần ghép lại (rating/import/AI/profile/pipeline), thứ tự đọc–kiểm chứng–stage trong cùng transaction, receipt/hash/version, command journal/dirty state và graph phụ thuộc; không phát hiện import vòng hay blocker trong phạm vi refactor đã review. Những giới hạn kiểm chứng production bên dưới vẫn giữ nguyên.

Agent chính tích hợp và kiểm tra mã do các subagent viết; không dùng báo cáo subagent làm kết luận hoàn tất. Reviewer độc lập kiểm tra code backend/admin, bảo mật, Clean Code/SOLID và đối chiếu tài liệu. Agent chính kiểm tra lại Rules, test, diff và các sửa lỗi. Chi tiết tại [review record](../tests/review-record.md).

## Môi trường và kết quả

Node.js **22.23.4**, npm10.9.9, Windows, Android Studio JBR25. Functions target Node22. SDK/dependency được pin và có lockfile workspace cùng lockfile Functions để deploy tái lập; Firebase Web12.19/Rules test5.0.2 và hai peer Firebase được khóa ở bản hỗ trợ Node22.

| Kiểm tra                                            | Kết quả             |
| --------------------------------------------------- | ------------------- |
| ESLint toàn bộ source/tools/tests                   | Đạt                 |
| TypeScript strict backend/admin/tools/tests         | Đạt                 |
| Functions build + Vite production build             | Đạt                 |
| Unit tests                                          | **19/19**, 5 files  |
| Auth/Firestore/Storage emulator integration + Rules | **66/66**, 11 files |
| Chrome với Auth/Callable/Tasks emulator thật        | **3/3**             |
| Diff whitespace và rà file secret/build output      | Đạt trước commit    |

Browser kiểm tra tạo bộ, chọn từ từ release, công khai, đọc lại sau reload; lưu/đọc lại quota; learner bị từ chối vào admin; import chỉ áp dụng hai dòng hợp lệ và bỏ qua mục không tìm thấy. Không mock backend trong các ca này. Đã xem giao diện Bộ từ hệ thống ở1440×1000 và đối chiếu native Figma; không tuyên bố toàn bộ màn đã so khớp pixel tự động.

Integration kiểm tra transaction/retry/hash/CAS, save–remove–resave, SRS theo ngày UTC+7, bookmark/tiến độ/summary, nguồn Game bất biến và kết quả đầu, import/publish bất biến, report/audit/nguồn sửa, quota/lease/ACK AI, avatar/MIME/normalize/GC, purge tài khoản và Auth cuối, Rules ownership/DELETING/create-only upload, pipeline dictionary và ảnh public/retained đúng phiên bản. URL ảnh được tải bytes PNG thật; nháp, sai WordVersion và asset không liên quan bị chặn.

Các lỗi từng tìm thấy đã được sửa và kiểm tra lại: overwrite Storage; canonical alias/release/cursor; quan hệ trùng khác provenance; meaningId trùng trong lượt ghép; ảnh default của revision cũ; report FIXED do chỉ đổi vị trí; giả MIME; turn context/ACK; worker xóa bị lần chạy cũ ghi lùi; import row resolution; ZIP traversal/expansion/CRC; giữ command qua reload.

## Chưa kiểm chứng ở môi trường thật

- Chưa deploy Firebase/GitHub Actions, chưa xác minh IAM, Cloud Tasks retries/Scheduler/App Check production.
- Gemini thật chưa gọi vì không có key triển khai; tests thay **chỉ adapter Gemini** bằng ChatApi xác định, còn quota/lease/ACK/summary dùng Firestore thật trong emulator. Không khẳng định model/free-tier đã sẵn sàng trong project người dùng.
- Google sign-in và Android TTS/device flow chưa chạy trên nhà cung cấp/thiết bị thật. Giao diện Android nằm ngoài phạm vi.
- D03 về nguồn/giấy phép từ điển chưa được quyết định. Seed12từ tự soạn phục vụ local; không thay bằng dữ liệu nhà cung cấp chưa được phép.

## Git và vận hành

Repo local riêng, nhánh `feat/firebase-admin`; Conventional Commits tách foundation, nghiệp vụ backend, admin, integration/security fixes và kiểm thử/cấu hình vận hành. `main` giữ baseline; chưa merge nhánh.

Chưa có remote/PR. GitHub CLI chưa khả dụng và không có phiên đăng nhập thông thường được xác nhận. Automatic approval review đã từ chối liệt kê tài khoản từ credential store; không tiếp tục truy cập bằng cách khác. Sau khi người dùng đăng nhập GitHub CLI thông thường, có thể tạo private remote/push/PR từ nhánh hiện tại.

Các tiến trình kiểm thử được dừng sau khi chạy. Thư mục `.local/` giữ log/screenshot/runtime kiểm tra và bị gitignore. Chạy lại theo [README](../README.md); integration tests cố ý xóa dữ liệu **demo emulator**, không chạy đồng thời phiên demo đang sử dụng.
