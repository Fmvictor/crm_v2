// API y datos sintéticos. Playwright es una dependencia opcional de comprobación.
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  root ? pathToFileURL(join(root, "index.mjs")).href : "playwright"
);
const { expect } = await import(
  root ? pathToFileURL(join(root, "test.mjs")).href : "playwright/test"
);
const base = process.env.PIPELINE_TEST_URL || "http://127.0.0.1:3312";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const out = process.env.PIPELINE_TEST_OUTPUT || "/tmp/crm-pipeline-visual";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_PATH
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const results = [];
  for (const [role, mobile] of [
    ["agent", false],
    ["admin", false],
    ["viewer", false],
    ["agent", true],
  ]) {
    const context = await browser.newContext({
      viewport: { width: mobile ? 390 : 1440, height: 950 },
      locale: "es-ES",
    });
    const page = await context.newPage();
    const errors = [],
      writes = [],
      queries = [];
    let failNext = false;
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log(role, mobile, e.message);
    });
    const record = (id, name, stage) => ({
      id,
      status: "open",
      lifecycleVersion: 1,
      externalContactKey: "34600000001",
      contact: { id, name, courseInterest: "CMB1" },
      pipelineStage: stage,
      aiMode: "human",
      language: "es",
      attentionPending: true,
      attentionVersion: 1,
      attentionReason: "Solicita una persona",
      aiSummary: "Interesado en CMB1. Pregunta por horarios y modalidad.",
      lastInboundAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastDeliveryStatus: "delivered",
      nextFollowUpAt: null,
      messages: [],
      pipelineEvents: [],
    });
    const records = [
      record("a", "Prospecto Alfa", "new"),
      record("b", "Prospecto Beta", "contacted"),
    ];
    await page.route("**/api/v1/**", async (route) => {
      const u = new URL(route.request().url()),
        p = u.pathname,
        method = route.request().method();
      let body = {},
        status = 200;
      if (p.endsWith("/auth/refresh")) body = { accessToken: "synthetic" };
      else if (p.endsWith("/auth/me"))
        body = { id: "test", name: "Operador de prueba", role, isActive: true };
      else if (p.endsWith("/ai-guidance"))
        body = { paused: true, instruction: null };
      else if (
        p.endsWith("/ai-guidance/learnings") ||
        p.endsWith("/whatsapp/templates")
      )
        body = [];
      else if (p.endsWith("/ai-usage"))
        body = {
          period: "2026-10",
          trackingSince: "2026-10-26T00:00:00Z",
          monthlyLimitEur: 100,
          accountedEur: 0,
          remainingEur: 100,
          calls: 0,
          completed: 0,
          inputTokens: 0,
          outputTokens: 0,
          pricing: {
            usdPerEur: 1,
            exchangeDate: "2026-10-26",
            checkedAt: "2026-10-26",
            validUntil: "2026-11-21",
          },
        };
      else if (p.endsWith("/conversations")) {
        queries.push(u.search);
        let filtered = records.filter(
          (r) =>
            (!u.searchParams.get("aiMode") ||
              r.aiMode === u.searchParams.get("aiMode")) &&
            (!u.searchParams.get("followUp") || r.nextFollowUpAt),
        );
        body = { data: filtered, total: filtered.length, page: 1, lastPage: 1 };
      } else if (p.includes("/conversations/")) {
        const id = p.split("/conversations/")[1].split("/")[0],
          r = records.find((r) => r.id === id);
        assert(r);
        if (method === "PATCH" && p.endsWith("/stage")) {
          assert.notEqual(role, "viewer");
          const payload = route.request().postDataJSON();
          writes.push({ id, ...payload });
          if (failNext) {
            failNext = false;
            status = 500;
            body = { message: "Fallo de prueba" };
          } else {
            r.pipelineStage = payload.stage;
            r.pipelineEvents.push({
              id: String(writes.length),
              actor: "agent",
              toStage: payload.stage,
            });
            body = r;
          }
        } else {
          assert.equal(method, "GET");
          body = r;
        }
      } else throw Error("Ruta inesperada " + p);
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto(base + "/pipeline");
    await page.getByRole("heading", { name: "Pipeline WhatsApp" }).waitFor();
    const card = (name) =>
      page
        .getByRole("button")
        .filter({ has: page.getByText(name, { exact: true }) })
        .filter({ visible: true });
    const section = (name) =>
      page.getByRole("region", { name, exact: true }).filter({ visible: true });
    await expect(card("Prospecto Alfa")).toBeVisible();
    const options = await page
      .getByLabel("Etapa del pipeline")
      .locator("option")
      .allTextContents();
    assert.equal(options.length, 5);
    for (const label of [
      "Nuevo",
      "En conversación",
      "Interesado",
      "Matrícula confirmada",
      "Sin continuidad",
    ])
      assert(options.some((t) => t.startsWith(label)));
    await expect(card("Prospecto Alfa")).toContainText("Interesado en CMB1");
    await expect(card("Prospecto Alfa")).toContainText(
      "Ventana de WhatsApp abierta",
    );
    await expect(card("Prospecto Alfa")).toContainText(
      "Último envío: entregado",
    );
    if (!mobile) {
      await page.getByLabel("Filtrar atención").selectOption("auto");
      await expect(card("Prospecto Alfa")).toHaveCount(0);
      assert(queries.some((q) => q.includes("aiMode=auto")));
      await page.getByLabel("Filtrar atención").selectOption("all");
      await expect(card("Prospecto Alfa")).toBeVisible();
    }
    if (role === "viewer") {
      await expect(card("Prospecto Alfa")).toHaveAttribute(
        "draggable",
        "false",
      );
      await card("Prospecto Alfa").click();
      await expect(
        page.getByLabel("Cambiar etapa de la conversación"),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Cerrar panel", exact: true })
        .click();
      assert.equal(writes.length, 0);
    } else if (mobile) {
      await card("Prospecto Alfa").click();
      await page
        .getByLabel("Cambiar etapa de la conversación")
        .selectOption("qualified");
      await expect(
        page.getByLabel("Cambiar etapa de la conversación"),
      ).toHaveValue("qualified");
      await page
        .getByRole("button", { name: "Cerrar panel", exact: true })
        .click();
      await page.getByLabel("Etapa del pipeline").selectOption("qualified");
      await expect(
        section("Interesado").getByText("Prospecto Alfa", { exact: true }),
      ).toBeVisible();
    } else {
      await card("Prospecto Alfa").dragTo(section("En conversación"));
      await expect(
        section("En conversación").getByText("Prospecto Alfa", { exact: true }),
      ).toBeVisible();
      assert.deepEqual(writes, [{ id: "a", stage: "contacted" }]);
      failNext = true;
      await card("Prospecto Beta").dragTo(section("Interesado"));
      await expect(
        page.getByRole("alert").filter({ hasText: "No se pudo guardar" }),
      ).toBeVisible();
      await expect(
        section("En conversación").getByText("Prospecto Beta", { exact: true }),
      ).toBeVisible();
      await card("Prospecto Beta").dragTo(section("Interesado"));
      await expect(
        section("Interesado").getByText("Prospecto Beta", { exact: true }),
      ).toBeVisible();
    }
    assert(records.every((r) => r.aiMode === "human" && r.attentionPending));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${out}/${role}-${mobile ? "movil" : "escritorio"}.png`,
      fullPage: true,
    });
    results.push({ role, mobile, writes: writes.length, errors });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(out + "/resultados.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
