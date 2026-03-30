import { test, expect } from "@playwright/test";

test("pdf upload to results flow", async ({ page }) => {
  await page.goto("/analyzer");
  await expect(page.getByText("Upload a legal document for AI-powered analysis")).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "sample-case.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf content for workflow validation"),
  });

  await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
  await page.getByRole("button", { name: "Find Matching Cases" }).click();

  await expect(page.getByRole("heading", { name: "Document Analysis" })).toBeVisible({ timeout: 30000 });
});
