import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { fetchWebsitePredictionHtml, parseWebsitePredictionHtml } from "@/lib/history/website";

const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "website-sample.html");

describe("parseWebsitePredictionHtml", () => {
  it("parses website table fixture into prediction rows", () => {
    const html = readFileSync(fixturePath, "utf-8");
    const rows = parseWebsitePredictionHtml(html);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      dateISO: "2026-02-18",
      period: "MEDIODIA",
      n: 11,
      rev: "R",
      mr: 22,
    });
  });

  it("returns empty rows for anti-bot challenge pages", () => {
    const html = "<html><body>Just a moment... Enable JavaScript and cookies to continue</body></html>";
    expect(parseWebsitePredictionHtml(html)).toEqual([]);
  });

  it("parses fallback text blocks when table rows are unavailable", () => {
    const html = `
      <html>
        <body>
          <div>Jueves, 18 de Febrero</div>
          <div>MEDIODIA</div>
          <div>11 R 22</div>
        </body>
      </html>
    `;

    const rows = parseWebsitePredictionHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dateISO: "2026-02-18", period: "MEDIODIA", n: 11, mr: 22 });
  });
});

describe("fetchWebsitePredictionHtml", () => {
  it("returns null for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("fail", {
          status: 403,
        }),
      ) as typeof fetch,
    );

    const html = await fetchWebsitePredictionHtml("https://example.com");
    expect(html).toBeNull();
    vi.unstubAllGlobals();
  });
});
