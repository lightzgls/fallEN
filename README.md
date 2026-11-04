# fallEN — Firebase backend và Content Admin

Backend phục vụ Android và web admin React/TypeScript/Vite theo ba tab tài liệu hiện hành và native Figma ngày 04/11/2026. Không có giao diện Android trong repo này.

## Phạm vi

- Firebase Auth/claims/AccountState; hồ sơ, avatar chuẩn hóa WebP và xóa tài khoản có checkpoint/lease.
- Release từ điển, canonical wordId/alias, tìm exact/prefix/fuzzy, quan hệ từ và pipeline IAM riêng.
- Một kho cá nhân; flashcard/SRS với CAS độc lập, receipt chống lặp, bookmark, ngày học và thống kê UTC+7.
- Game pin nguồn/WordCopy, PREPARING, chấm lần đầu, skip/cancel và kỷ lục.
- Admin: chọn từ chỉ đọc; draft/học liệu/ảnh; CSV/XLSX và ảnh/ZIP; preview/đối chiếu/apply; publish nguyên tử; TTS; tình huống/quota AI; xử lý báo lỗi.
- AI qua Gemini adapter: quota phiên, turn lease, REPLY_READY/ACK, tối đa 15 cặp, tổng kết. Không lưu transcript/message/context/reply trong Firestore, Tasks hoặc log.

Xem [contract và kiến trúc](docs/architecture.md), [tổ chức module](docs/code-organization.md), [biên bản review độc lập](tests/review-record.md) và [bằng chứng nghiệm thu](docs/validation.md). Source thiết kế ở thư mục `fallen-design/` bên cạnh repo; Google Docs/Figma được liên kết trong contract.

## Chạy local trên Windows

Cần Node.js 22, npm và Java 21 trở lên. Kiểm tra cuối chạy trên Node22.23.4 và Android Studio JBR25; Functions triển khai dùng Node22. Không dùng project production cho seed/test.

```powershell
npm ci
Copy-Item admin-web/.env.example admin-web/.env.local
```

Terminal 1 tại repo:

```powershell
. ./tools/emulator-env.ps1
npm run emulators
```

Terminal 2:

```powershell
. ./tools/emulator-env.ps1
npm run seed
npm run dev
```

Mở [admin local](http://127.0.0.1:5173) và [Emulator UI](http://127.0.0.1:4000). Seed chạy lặp an toàn trong `demo-fallen`, không reset dữ liệu đã sửa. Tài khoản admin: `admin@fallen.local`; learner: `learner@fallen.local`; mật khẩu thử **chỉ trên emulator**: `Local-demo-2026!`. Có thể đặt `SEED_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_LEARNER_EMAIL` trước seed. Không dùng các giá trị này cho môi trường thật.

Java được nhận qua `JAVA_HOME`; script env tự nhận Android Studio JBR nếu chưa cấu hình. Các cổng dùng: Auth9099, Firestore8080, Storage9199, Functions5001, Vite5173, Hosting5000, UI4000. Emulator dừng khi Ctrl+C.

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm run build
npm test
. ./tools/emulator-env.ps1
npm run test:emulator
```

Integration tests xóa dữ liệu emulator trước mỗi ca. Dừng phiên demo/UI trước khi chạy chúng. Không thể chạy tests này trên Firebase thật.

Browser tests dùng Chrome đã cài, thực hiện đăng nhập bằng Auth emulator và gọi Callable thật. Sau khi build Functions, chạy:

```powershell
. ./tools/emulator-env.ps1
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-fallen --only auth,firestore,storage,functions "powershell -NoProfile -File tools/test-browser.ps1"
```

Playwright tự mở Vite. Nếu chưa có Chrome, cài browser tương ứng trước. CI Linux chạy lint/typecheck/build/unit/emulator; browser verification local được ghi riêng.

## Môi trường thật

Chưa deploy Firebase production. Dùng project dev/staging/prod riêng; cấu hình client trong `admin-web/.env.local`, Functions theo `functions/.env.example`. Firebase client IDs và reCAPTCHA site key là cấu hình công khai. Service-account JSON, ADC token, Gemini key và App Check debug token không được đưa vào repo hoặc biến `VITE_*`.

1. Đăng nhập Firebase CLI bằng cơ chế thông thường và chọn project thật rõ ràng (`--project <id>`); cấu hình Auth email/Google và authorized domains.
2. Bật App Check cho Android/web. Các Callable production enforce App Check; emulator bỏ kiểm tra này. App Check không thay quyền Auth/claims/owner.
3. Cấp `contentAdmin` bằng operator IAM/ADC: `GCLOUD_PROJECT=<id> npx tsx tools/grant-admin.ts <uid>` (PowerShell đặt `$env:GCLOUD_PROJECT`). Người dùng refresh ID token sau thay đổi quyền; không có đăng ký tự cấp admin.
4. Thiết lập Secret Manager: `firebase functions:secrets:set GEMINI_API_KEY --project <id>`. Model mặc định theo thiết kế là `gemini-3.8-flash`; xác minh model/free-tier được cấp cho project trước khi sử dụng. Không tự fallback sang model trả phí. Không có khóa thật trong repo.
5. Deploy Rules/indexes/Functions/Hosting sau khi các check đạt. Cấp IAM tối thiểu cho Functions, Cloud Tasks enqueuer/invoker, Secret Manager và Storage; pipeline từ điển dùng danh tính operator riêng. Không cấp pipeline cho Content Admin.
6. Bật TTL cho `accountDeletionJobs.expiresAt`; chỉ COMPLETE được gán expiry. TTL không xóa cây User thay worker. Avatar GC dùng Scheduler hằng ngày; reminder/widget vẫn thuộc Android.

Tác vụ dài có event dispatch + Cloud Tasks retry; dữ liệu trạng thái/receipt là nguồn chính thức, không giả định event chỉ chạy một lần. Emulator không chứng minh IAM/Tasks/Scheduler production hoạt động; cần kiểm tra staging trước phát hành.

## Từ điển và vận hành

D03 chưa chốt nguồn/giấy phép từ điển. Seed là 12 mục từ tự soạn, không phải dữ liệu từ nhà cung cấp hay toàn bộ từ điển tiếng Anh. `tools/dictionary/publish.ts` xuất `publishDictionaryManifest`: operator cấp manifest nguồn/phiên bản/quyền phân phối, WordVersion bất biến, alias, connections và checksum index; pipeline khóa READY rồi đổi pointer bằng CAS. Không có endpoint sửa nghĩa gốc trên admin. Dữ liệu thật chỉ được nạp sau khi D03 được quyết định.

Giới hạn triển khai bảo vệ bộ nhớ/document: file5MiB, avatar16MP→512×512 WebP; lô1000dòng với payload500KiB và receipt750KiB; search index64MiB; ngữ cảnh AI32.000ký tự, tin2000/reply4000, tối đa15cặp. Vượt giới hạn trả lỗi rõ, không cắt dữ liệu âm thầm. Đây là giới hạn tài nguyên của bản triển khai, không thay luật tính kết quả.

Nếu người sở hữu admin job bị xóa giữa chừng bằng luồng của hệ thống, operator chạy `tools/recover-content-jobs.ts --confirm-orphan-recovery` bằng IAM/ADC. Script chỉ mở khóa khi gate DELETING, hoặc Auth đã mất và gate không ACTIVE; trả VALIDATING về DRAFT và APPLYING về FAILED, giữ bản đã công khai và dòng đã áp dụng. Không dùng script này thay cơ chế retry thông thường.

## Git

Repo riêng, `main` là baseline; công việc trên `feat/firebase-admin`. Conventional Commits theo từng thay đổi logic. CI chạy trên PR và main. Chưa có remote GitHub/PR vì chưa có phiên CLI GitHub khả dụng được xác nhận; không suy đoán URL repo. Sau khi đăng nhập GitHub CLI thông thường, có thể tạo private remote từ checkout rồi push nhánh và tạo PR theo GitHub Flow.
