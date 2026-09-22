import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * The schema diagram at /private/erd is public and generated from the Drizzle
 * schema, so the expected tables and foreign keys come from the same source
 * rather than a hard-coded list that would rot.
 */
const tableConfigs = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => getTableConfig(t));
const tableNames = tableConfigs.map((t) => t.name).sort();
const foreignKeyColumns = tableConfigs.reduce(
  (n, t) => n + t.foreignKeys.reduce((m, fk) => m + fk.reference().columns.length, 0),
  0,
);

async function viewportTransform(page: Page) {
  return page.locator(".react-flow__viewport").evaluate((el) => getComputedStyle(el).transform);
}

test("anonymous visitors see every table and foreign key, with no errors and no indexing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const response = await page.goto("/private/erd");
  assert.equal(response?.status(), 200, "no sign-in redirect");
  await expect(page).toHaveURL(/\/private\/erd$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(tableNames.length);
  const rendered = (await nodes.evaluateAll((els) => els.map((el) => el.getAttribute("data-id") ?? ""))).sort();
  assert.deepEqual(rendered, tableNames);
  await expect(page.locator(".react-flow__edge")).toHaveCount(foreignKeyColumns);

  // Column-level detail: keys are labelled and nullable types carry a "?".
  const applications = page.locator('.react-flow__node[data-id="applications"]');
  await expect(applications.getByText("PK").locator("..")).toContainText("id");
  await expect(applications.locator("div", { hasText: /^FKcandidate_iduuid$/ })).toBeVisible();
  await expect(applications.locator("div", { hasText: /^FKcurrent_stage_iduuid\?$/ })).toBeVisible();

  assert.deepEqual(errors, []);
});

test("the canvas zooms, pans and lets tables be dragged", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/private/erd");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  // Full-screen: the canvas fills the viewport and the page itself never scrolls.
  const box = await page.locator(".react-flow").boundingBox();
  assert.deepEqual([box?.width, box?.height], [1400, 900]);

  // Drag a table by its header (at the fitted zoom, so it is on screen);
  // its position moves with the pointer.
  const node = page.locator('.react-flow__node[data-id="applications"]');
  const before = await node.boundingBox();
  assert.ok(before);
  await page.mouse.move(before.x + before.width / 2, before.y + 4);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 100, before.y + 84, { steps: 8 });
  await page.mouse.up();
  const after = await node.boundingBox();
  assert.ok(after);
  // React Flow spends the first pointer step deciding a drag has started, so
  // the node trails the pointer slightly; it must still move with it.
  const [dx, dy] = [after.x - before.x, after.y - before.y];
  assert.ok(dx >= 75 && dx <= 100 && dy >= 60 && dy <= 80, `node followed the drag (moved ${dx}, ${dy})`);

  const start = await viewportTransform(page);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => viewportTransform(page)).not.toBe(start);
  const zoomed = await viewportTransform(page);
  const scale = (t: string) => Number(/matrix\(([^,]+)/.exec(t)?.[1]);
  assert.ok(scale(zoomed) > scale(start), `zoomed in: ${start} → ${zoomed}`);

  // Pan by dragging empty canvas.
  const pane = page.locator(".react-flow__pane");
  await pane.dragTo(pane, { sourcePosition: { x: 20, y: 20 }, targetPosition: { x: 220, y: 120 } });
  await expect.poll(() => viewportTransform(page)).not.toBe(zoomed);
});
