import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI Search Lab" })).toBeVisible();
});

test("all routes render without crash", async ({ page }) => {
  const routes = ["/", "/explorer", "/analyzer", "/insights", "/history"];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText("LexMatch AI")).toBeVisible();
  }
});
