import { test, expect } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Case Lab" })).toBeVisible();
});

test("all routes render without crash", async ({ page }) => {
  const routes = [
    "/",
    "/explorer",
    "/analyzer",
    "/judges",
    "/calendar",
    "/insights",
    "/history",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /case explorer/i }),
    ).toBeVisible();
  }
});

test("case explorer filters and results are interactive", async ({ page }) => {
  await page.goto("/explorer");

  await expect(
    page.getByRole("heading", { name: "Case Explorer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Explore Cases|Matched Cases/i }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByText("View By")).toBeVisible();

  await page
    .getByPlaceholder(/Search (matched )?cases\.\.\./i)
    .fill("criminal");
  await expect(page.getByText(/showing|no cases found/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Category" }).click();
  await expect(
    page
      .getByRole("heading", {
        name: /Criminal|Civil|Specialized Cases|Explore Cases|Matched Cases/i,
      })
      .first(),
  ).toBeVisible();
});
