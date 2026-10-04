import { expect, test } from "@playwright/test";

import { buildPredictionSlots, currentDateISOInTimeZone, DEFAULT_PREDICTION_FROM_ISO, formatDateEs } from "@/lib/utils/date";

const todayISO = currentDateISOInTimeZone();
const expectedRowCount = buildPredictionSlots(DEFAULT_PREDICTION_FROM_ISO, todayISO).length;

test("loads prediction board with full date range and row count", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "prediction.csv" })).toBeVisible();
  await expect(page.getByText("Generando predicciones...")).toBeVisible();

  await expect(page.locator("tbody tr")).toHaveCount(expectedRowCount, { timeout: 30000 });

  await expect(page.locator("tbody tr").first()).toContainText("19 de febrero 2026");
  await expect(page.locator("tbody tr").last()).toContainText(formatDateEs(todayISO));
  await expect(page.getByRole("heading", { name: "Números más cercanos" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Motor" })).toContainText("Adaptive Monte Carlo digit-channel");
});

test("keeps MEDIODIA/TARDE/NOCHE ordering per date", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(expectedRowCount, { timeout: 30000 });

  const firstDateRows = page.locator("tbody tr", {
    has: page.getByText("19 de febrero 2026", { exact: true }),
  });

  await expect(firstDateRows).toHaveCount(3);
  await expect(firstDateRows.nth(0)).toContainText("MEDIODIA");
  await expect(firstDateRows.nth(1)).toContainText("TARDE");
  await expect(firstDateRows.nth(2)).toContainText("NOCHE");
});

test("shows graceful error state when API fails", async ({ page }) => {
  await page.route("**/api/predictions**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ details: "forced e2e failure" }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("No se pudo cargar la predicción")).toBeVisible();
  await expect(page.getByText("forced e2e failure")).toBeVisible();
});

test("renders on mobile viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "prediction.csv" })).toBeVisible();
  await expect(page.locator("table")).toBeVisible();
});
