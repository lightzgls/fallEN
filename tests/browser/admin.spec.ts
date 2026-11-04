import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email = "admin@fallen.local") {
  await page.goto("/");
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Mật khẩu/).fill("Local-demo-2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}
test("admin creates, selects pinned words, publishes and reads persisted content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Bộ từ hệ thống", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tạo bộ từ", exact: true }).click();
  const name = `Kiểm thử trình duyệt ${Date.now()}`;
  await page
    .getByRole("dialog")
    .getByLabel(/Tên bộ/)
    .fill(name);
  await page
    .getByRole("dialog")
    .getByLabel(/Chủ đề/)
    .fill("Kiểm thử");
  await page.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(name) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tìm và chọn nhiều từ", exact: true })
    .click();
  await page.getByLabel("Tìm từ hoặc cụm từ", { exact: true }).fill("journey");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Chọn journey", exact: true })
    .check();
  await page.getByRole("button", { name: /Thêm 1 từ đã chọn/ }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(name) }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /journey/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Công khai", exact: true }).click();
  await page
    .getByRole("button", { name: "Xác nhận công khai", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu thành công.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Bộ từ hệ thống", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Đang công khai",
  );
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Đang công khai",
  );
  await page
    .getByRole("link", { name: "Hạn mức phiên AI", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hạn mức phiên AI", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/Số phiên tối đa \/ người học \/ ngày/).fill("4");
  await page.getByRole("button", { name: /Lưu hạn mức/ }).click();
  await expect(
    page.getByText("Đã lưu thành công.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel(/Số phiên tối đa \/ người học \/ ngày/),
  ).toHaveValue("4");
  await page
    .getByRole("link", { name: "Báo lỗi học liệu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Báo lỗi học liệu", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("a learner cannot enter the admin", async ({ page }) => {
  await login(page, "learner@fallen.local");
  await expect(
    page.getByRole("heading", { name: "Không có quyền truy cập", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Bộ từ hệ thống", exact: true }),
  ).toHaveCount(0);
});
test("admin previews import and applies only resolved selected rows", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Tạo bộ từ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/Tên bộ/)
    .fill(`Import browser ${Date.now()}`);
  await page
    .getByRole("dialog")
    .getByLabel(/Chủ đề/)
    .fill("Kiểm thử");
  await page.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
  await page
    .getByRole("button", { name: "Nhập hàng loạt", exact: true })
    .click();
  await page
    .getByLabel("Danh sách từ", { exact: true })
    .fill("book\nreservation\nmissing-word-demo");
  await page
    .getByRole("button", { name: "Xem trước danh sách", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "missing-word-demo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Áp dụng dòng 3", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Áp dụng 2 dòng đã chọn", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận áp dụng", exact: true })
    .click();
  await expect(page.getByText(/Đã áp dụng/).first()).toBeVisible();
  await page.getByRole("button", { name: "Về bản nháp", exact: true }).click();
  await expect(page.getByRole("cell", { name: /book/ }).first()).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /reservation/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "missing-word-demo", exact: true }),
  ).toHaveCount(0);
});
