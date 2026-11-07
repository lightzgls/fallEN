# Chuyển KALA sang định dạng từ điển fallEN

Chạy từ thư mục `fallEN/`, cần Python 3.11+ (thư viện chuẩn), Node và các
dependency đã có của repo. Công cụ chỉ đọc SQLite và xuất file local, không
kết nối Firebase. Database đầu vào là bản **đã giải mã**
`../kala-dictionary/dictionary-full.sqlite` từ công việc trích APK trước đó.

```powershell
npm run dictionary:convert-kala
npm run dictionary:check-local -- .local/kala-converted/manifest.review.json
```

Có thể chạy thử vài từ, đổi đường dẫn hoặc giới hạn số từ gốc:

```powershell
npm run dictionary:convert-kala -- --word apple --word run --output .local/kala-sample
npm run dictionary:convert-kala -- --input ../kala-dictionary/dictionary-full.sqlite --limit 100 --output .local/kala-100
```

Đầu ra phải là thư mục mới. Công cụ từ chối ghi đè kết quả đã có. `--limit`
đếm số từ gốc chuyển thành công; không phải số dòng SQLite. `--word` có thể
lặp lại, và một biến thể như `apples` sẽ được giải về từ gốc `apple`.

## Định dạng đích

Đây là manifest cho pipeline operator ở `tools/dictionary/publish.ts`, theo
schema `tools/dictionary/manifest.ts`. Khác với CSV nhập bộ học ở admin:
CSV admin chỉ chọn các từ đã tồn tại trong release, không tạo nghĩa gốc mới.

| KALA                                | fallEN                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| `av.word`                           | `words[].spelling`                                      |
| Phần trước `#;#` trong `pro`        | `phonetic`, giữ phiên âm nguồn                          |
| `part_*`, nhãn từ loại              | `meanings[].partOfSpeech`                               |
| Các khối HTML `m`, `dm`, `im`       | Các nghĩa riêng trong `meanings[]`                      |
| `e`/`em`, `ei`/`eim`                | Cặp `example`/`exampleTranslation`                      |
| Nghĩa kỹ thuật, nhãn `b`            | Giữ nhãn lĩnh vực trong `text`                          |
| Thành ngữ `id`/`im`                 | Giữ cụm thành ngữ trong `text`, từ loại `idiom`         |
| Dòng không có HTML, nghĩa `@target` | `otherSpellings` của từ gốc sau khi giải chuỗi redirect |
| Tên mục từ chính và redirect        | `dictionaryRefs`, có tiền tố `av:` để truy vết          |

Chỉ chuyển bảng `av` (Anh → Việt). Bảng `va` là chiều Việt → Anh và không
được trộn vào kho mục từ tiếng Anh của fallEN. Các phần Anh–Anh, quan hệ và
word-family không bị đoán thành nghĩa tiếng Việt hoặc kết nối ngữ nghĩa;
chúng vẫn nằm trong SQLite nguồn. `connections` để rỗng.

ID từ là hash ổn định của khóa chuẩn hóa tương ứng `normalizeKey` của
Fallen; ID nghĩa dựa trên từ gốc, từ loại và nội dung. Không bỏ dấu tiếng
Việt. Các dòng trùng khóa NFKC được ghép có giữ provenance. Các redirect
vòng, không tìm được đích hoặc trỏ vào mục không chuyển được nằm trong báo
cáo từ chối. Liên kết HTML thông thường không tự trở thành alias.

## Các tệp kết quả

- `manifest.review.json`: cấu trúc `releaseId`, `sources`, `words`,
  `connections`; word/meaning theo đúng schema của Fallen.
- `supplemental.jsonl`: toàn bộ cặp ví dụ đã tách, ví dụ thiếu một vế,
  giải nghĩa Anh đi kèm, định nghĩa và phiên âm quá dài. Fallen hiện chỉ có chỗ cho một
  cặp ví dụ/nghĩa; manifest chọn cặp đầu tiên khớp giới hạn schema.
- `rejected.jsonl`: các mục cần xem lại, kèm lý do. Không cắt bớt định
  nghĩa để vượt giới hạn 1.000 ký tự. Nghĩa quá dài được giữ nguyên trong
  supplemental, các nghĩa hợp lệ khác của cùng từ vẫn được chuyển. Nếu tất
  cả nghĩa chi tiết quá dài, dùng nghĩa ngắn gốc nếu nó khớp schema; nếu vẫn
  không có nghĩa hợp lệ thì ghi mục vào file từ chối. Mục chỉ có Anh–Anh, không có nghĩa
  Việt có cấu trúc hoặc nghĩa ngắn, không được giả thành định nghĩa Việt.
- `report.json`: SHA-256 nguồn, tổng số dòng, số từ gốc/nghĩa/alias đã
  chuyển và phạm vi chọn. SQLite nguồn giữ nguyên nội dung gốc.

`listenAllowed` mặc định `false`; converter không tạo audio hoặc xác nhận
quyền media. Các trường hình ảnh cũng không được tự sinh.

## Metadata nguồn và phiên bản hiện có

Mặc định `sources[].redistributionAllowed` là **false**, license là
`UNVERIFIED`. Có thể kiểm tra dữ liệu local ngay, nhưng schema publish hiện
có yêu cầu giá trị **true**. Công cụ không suy ra quyền phân phối từ việc có
file APK và không sửa điều kiện của pipeline. `publicationSchemaValid:
false` trong kết quả kiểm tra phản ánh điều kiện metadata này.

Khi đã xác định metadata nguồn, truyền file có đúng các trường
`sourceId`, `name`, `version`, `license`, `redistributionAllowed` bằng
`--source-metadata <file.json>`. Giá trị phải phản ánh quyền thực tế của nguồn;
converter chỉ đọc metadata, không xác minh quyền đó.

Nếu đã có canonical wordId trong một release, dùng `--identity-map
<file.json>` thay vì tự ý tạo ID mới cho cùng khóa tìm kiếm. Ví dụ cấu trúc:

```json
{
  "book": { "wordId": "book", "version": 2 }
}
```

Map dùng spelling chuẩn hóa làm khóa. Chọn version mới khi nội dung thay
đổi; WordVersion đã công bố là bất biến. Các từ không nằm trong map dùng ID
hash mặc định. `--word-version` đặt version mặc định, `--release-id` đặt ID
release. Chuyển đổi này không tự ghi đè word keys hoặc release đang chạy.

## Phát hành cho tra cứu online và offline

Chuẩn bị manifest đầy đủ của bản kế tiếp. Giữ `wordId` của mục hiện có, tăng
`version` khi sửa nội dung, gán ID mới cho mục mới và đánh dấu `active: false`
cho mục cần ẩn. Bản phát hành có `releaseId` mới. CSV của web admin quản lý bộ
học. Người vận hành xuất bản mục từ bằng manifest đã được duyệt:

```powershell
. .\tools\emulator-env.ps1
npx tsx tools/dictionary/publish-file.ts .local/release-next.json demo-fallen 1 publish-release-next
```

Số `1` là `config/dictionary.version` hiện tại trong ví dụ. Dùng nguồn tự soạn
hoặc có quyền phân phối cho manifest phát hành. Gói KALA hiện tại vẫn ở chế
độ đánh giá nếu quyền phân phối chưa xác minh.

Khi con trỏ phát hành chuyển sang bản mới, tra cứu online đọc bản đó. Android
dùng `getOfflineDictionary` để tải các mục thêm, sửa và xóa so với bản đã tải.
Sau khi tải đủ các trang của cùng một bản, app mới chuyển sang bản đó trong
SQLite. Lần tải đầu tiên của một bản phát hành cần mạng và tải toàn bộ mục
đang hoạt động. Android có sẵn 50 từ mẫu để tra trong lúc chưa tải bản này.

## Kiểm tra

```powershell
npm run test:kala
npm test -- tests/unit/kala-manifest.test.ts
```

Các ca kiểm tra bảo vệ việc tách nghĩa/ví dụ, giữ khoảng trắng và Unicode,
alias chuỗi/vòng, nguồn có phiên bản, giới hạn UTF-16 giống Zod, không sửa
SQLite và không tự khẳng định quyền phân phối. `dictionary:check-local`
dùng schema Zod thật, kiểm tra wordId/meaningId, nguồn tham chiếu và xung đột
khóa tra cứu; không import runtime Firebase.
