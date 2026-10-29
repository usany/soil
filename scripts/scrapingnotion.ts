import dotenv from "dotenv";
import { chromium, type Page } from "playwright";
import { MongoClient, Db, Collection } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";
const SEMESTERS_COLLECTION = "semesters";

interface RowLink {
  url: string;
  title: string;
  summary: string;
}

interface Detail {
  title: string;
  properties: Record<string, string>;
}

interface UniversityRow extends Omit<Detail, "title"> {
  id: string;
  summary: string;
  semesters: string[];
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SEASON_ORDER: Record<string, number> = {
  spring: 0,
  summer: 1,
  fall: 2,
  winter: 3,
};

async function getSemesterUrl(
  db: Db,
  semester: string,
): Promise<string | null> {
  const doc = await db
    .collection(SEMESTERS_COLLECTION)
    .findOne({ key: semester });
  return doc && typeof doc.url === "string" ? doc.url : null;
}

async function getSemesterKeys(db: Db): Promise<string[]> {
  const docs = await db.collection(SEMESTERS_COLLECTION).find({}).toArray();
  return docs.map((d) => String(d.key)).filter(Boolean);
}

/**
 * Order semester keys chronologically, e.g. "23spring" < "23fall" < "24spring".
 * Expects keys shaped like `YYseason` (year two digits + season name).
 */
function sortSemesterKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = a.match(/^(\d{2})(spring|summer|fall|winter)$/i);
    const pb = b.match(/^(\d{2})(spring|summer|fall|winter)$/i);
    if (pa && pb) {
      const ya = Number(pa[1]);
      const yb = Number(pb[1]);
      if (ya !== yb) return ya - yb;
      return (
        (SEASON_ORDER[pa[2].toLowerCase()] ?? 0) -
        (SEASON_ORDER[pb[2].toLowerCase()] ?? 0)
      );
    }
    // Fall back to lexical ordering for non-standard keys.
    return a.localeCompare(b);
  });
}

/**
 * Parse CLI args. Returns an array of semester keys to scrape.
 *   --all               => every semester (chronological order)
 *   --source <semester> => just that semester
 *   (nothing)           => most recent semester only
 */
function parseArgs(allKeysSorted: string[]): string[] {
  const args = process.argv.slice(2);

  if (args.includes("--all")) return allKeysSorted;

  const sourceIndex = args.indexOf("--source");
  if (sourceIndex !== -1 && sourceIndex + 1 < args.length) {
    return [args[sourceIndex + 1]];
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.error(
      `Usage:\n` +
        `  npm run scrape                    # most recent semester\n` +
        `  npm run scrape -- --all           # every semester\n` +
        `  npm run scrape -- --source <key>  # a specific semester\n` +
        `\nAvailable: ${allKeysSorted.join(", ")}`,
    );
    process.exit(0);
  }

  // Default: most recent semester.
  if (allKeysSorted.length === 0) {
    console.error(
      "No semesters found in the `semesters` collection. " +
        "Run get-notion-links first.",
    );
    process.exit(1);
  }
  return [allKeysSorted[allKeysSorted.length - 1]];
}

async function expandAllRows(page: Page): Promise<void> {
  // Notion renders collection rows in a virtualized scroller: it only mounts a
  // window of rows and lazily loads more as you scroll (or click "Load more").
  // Loop until the item count stops growing so we don't miss universities.
  let lastCount = 0;
  let stable = 0;

  for (let i = 0; i < 80; i++) {
    // 1) Click any visible "Load more" button.
    const btn = page.getByText("Load more", { exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click().catch(() => {});
      await sleep(1500);
    }

    // 2) Scroll every collection scroller to the bottom to force lazy loading.
    await page.evaluate(() => {
      const scrollers = document.querySelectorAll(
        ".notion-scroller.vertical, .notion-collection-view-body",
      );
      for (const s of scrollers) {
        (s as HTMLElement).scrollTop = (s as HTMLElement).scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });

    await sleep(1000);

    // 3) Measure item count; stop once it has been stable for a few rounds.
    const count = await page.evaluate(
      () => document.querySelectorAll(".notion-collection-item").length,
    );
    if (count > 0 && count === lastCount) {
      stable++;
      if (stable >= 3) break;
    } else {
      stable = 0;
    }
    lastCount = count;
  }

  console.log(
    `[expandAllRows] final collection-item count: ${lastCount}`,
  );
}

function collectRowLinks(page: Page): Promise<RowLink[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const rows: RowLink[] = [];

    // Each university is a `.notion-collection-item` containing an <a href> to
    // its detail page. Collect only those (not every anchor on the page).
    const items = document.querySelectorAll<HTMLElement>(
      ".notion-collection-item",
    );

    for (const item of items) {
      const a = item.querySelector<HTMLAnchorElement>("a[href]");
      if (!a) continue;

      const text = (a.innerText || "").trim();
      if (!text) continue;

      const lines = text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const title = lines[0] || "";

      // A university detail title starts with an uppercase letter and has at
      // least one extra info line (country, language, scores, slots).
      if (!/^[A-Z]/.test(title)) continue;
      if (lines.length < 2) continue;

      const url = a.href.split("?")[0];
      if (seen.has(url)) continue;
      seen.add(url);

      rows.push({
        url,
        title,
        // Summary lines come from the row text; strip any line that just
        // repeats the title so the summary does not contain the title.
        summary: lines
          .slice(1)
          .filter((line) => line !== title)
          .join(" | "),
      });
    }

    return rows;
  });
}

async function scrapeDetail(page: Page, url: string): Promise<Detail> {
  // Click the university item's row/anchor to open its detail (peek) instead of
  // navigating away via page.goto. The universal-link rows are <a href> with the
  // page URL as the slug. Click the anchor whose href resolves to this url.
  const slug = url.split("/").filter(Boolean).pop() || "";

  let clicked = false;
  if (slug) {
    const anchor = page.locator(`a[href*="${slug}"]`).first();
    if ((await anchor.count()) > 0) {
      await anchor.scrollIntoViewIfNeeded().catch(() => {});
      await anchor.click().catch(() => {});
      clicked = true;
    }
  }

  // Fallback: click by page title text (first line of the link).
  if (!clicked) {
    const title = url
      .split("/")
      .filter(Boolean)
      .pop()
      ?.split("-")
      .filter((w) => w.length > 2)
      .slice(0, 4)
      .join(" ");
    if (title) {
      const anchor = page.locator("a[href]", { hasText: title }).first();
      if ((await anchor.count()) > 0) {
        await anchor.scrollIntoViewIfNeeded().catch(() => {});
        await anchor.click().catch(() => {});
        clicked = true;
      }
    }
  }

  // Last resort: navigate directly.
  if (!clicked) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  await sleep(1500);

  // Wait for the detail (peek overlay) to render properties or content.
  await page
    .waitForFunction(
      () => {
        const peek = document.querySelector(".notion-peek-renderer");
        const root = peek || document.body;
        return (
          root.querySelector("[role='table'] [role='row']") !== null ||
          root.querySelector(".notion-page-content") !== null
        );
      },
      { timeout: 20000 },
    )
    .catch(() => {});

  const more = page.getByText(/^\d+ more propert/).first();
  if (await more.isVisible().catch(() => false)) {
    await more.click().catch(() => {});
    await sleep(800);
  }

  await page
    .waitForFunction(() => !document.body.innerText.includes("Loading..."), {
      timeout: 8000,
    })
    .catch(() => {});

  return page.evaluate(() => {
    const peek = document.querySelector(".notion-peek-renderer");
    const root: HTMLElement | null =
      (peek as HTMLElement | null) || document.body;

    const properties: Record<string, string> = {};
    for (const row of root.querySelectorAll("[role='table'] [role='row']")) {
      const cells = row.querySelectorAll<HTMLElement>("[role='cell']");
      if (cells.length < 2) continue;
      const name = cells[0].innerText.trim();
      let value = cells[1].innerText.trim();
      const anchors = [
        ...cells[1].querySelectorAll<HTMLAnchorElement>("a[href]"),
      ];
      for (const a of anchors) {
        const shown = a.innerText.trim();
        if (shown && value.includes(shown) && !value.includes(a.href))
          value = value.replace(shown, a.href);
      }
      for (const a of anchors)
        if (!value.includes(a.href)) value += (value ? "\n" : "") + a.href;
      value = value.replace(/mailto:/g, "");
      if (value === "Empty") value = "";
      if (name) properties[name] = value;
    }

    const peekTitle =
      peek instanceof Element
        ? (peek.querySelector("h1")?.textContent || "").trim()
        : "";

    return {
      title: peekTitle || document.querySelector("h1")?.innerText.trim() || "",
      properties,
    };
  });
}

/**
 * Scrape a single semester's Notion page into the `universities` collection.
 * Returns { inserted, updated, rows } counts for logging.
 */
async function scrapeSemester(
  db: Db,
  semester: string,
  browser: import("playwright").Browser,
): Promise<{ inserted: number; updated: number; rows: number }> {
  const semesterUrl = await getSemesterUrl(db, semester);
  if (!semesterUrl) {
    throw new Error(`No URL found for semester: ${semester}`);
  }

  const collection = db.collection(COLLECTION_NAME);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  try {
    await page.goto(semesterUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    // Wait for the collection view to actually hydrate. Notion renders the
    // page shell first, then lazily fetches and mounts the collection items.
    await page
      .waitForSelector(".notion-collection-item", {
        timeout: 60000,
      })
      .catch(() => {});

    await expandAllRows(page);

    // Give the last lazy-loaded items a moment to finish mounting.
    await page
      .waitForFunction(
        () => !document.body.innerText.includes("Loading..."),
        { timeout: 15000 },
      )
      .catch(() => {});

    const links = await collectRowLinks(page);
    console.log(`[${semester}] rows found: ${links.length}`);
    if (links.length === 0) {
      const title = await page.title();
      const bodyLen = await page.evaluate(
        () => document.body.innerText.length,
      );
      throw new Error(
        `no rows found (page title: "${title}", body length: ${bodyLen})`,
      );
    }

    const universities: UniversityRow[] = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      let detail: Detail | null = null;
      for (let attempt = 0; attempt < 3 && !detail; attempt++) {
        try {
          detail = await scrapeDetail(page, link.url);
        } catch (e) {
          const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
          if (attempt === 2) console.log(`failed: ${link.title} (${msg})`);
          else await sleep(3000 * (attempt + 1));
        }
      }
      if (!detail) {
        console.log(`skipped: ${link.title} (no detail after retries)`);
        continue;
      }
      const uniName = detail.title || link.title;
      const properties = { ...detail.properties };
      delete properties.url;
      universities.push({
        id: uniName.replace(/\s*\(Study Abroad Program\)\s*/g, "").trim(),
        summary: link.summary,
        semesters: [semester],
        properties,
      });
      if ((i + 1) % 10 === 0 || i + 1 === links.length)
        console.log(`[${semester}] scraped ${i + 1}/${links.length}`);
      await sleep(800);
    }

    // Insert or update universities in MongoDB
    let inserted = 0;
    let updated = 0;

    for (const university of universities) {
      const existing = await collection.findOne({ id: university.id });
      const now = new Date();

      // When a university already has a more recent semester stored, keep its
      // existing properties (the latest data wins). Only overwrite properties
      // when this scrape is itself the most recent semester for the university.
      const existingSemesters = (existing?.semesters ?? []) as string[];
      const isMostRecent =
        existingSemesters.length === 0 ||
        sortSemesterKeys([...existingSemesters, university.semesters[0]]).pop() ===
          university.semesters[0];

      const applyProps = isMostRecent && Object.keys(university.properties).length > 0;

      const setDoc: Record<string, unknown> = {
        id: university.id,
        summary: university.summary,
        timestamp: now,
      };
      if (applyProps) {
        setDoc.properties = university.properties;
      }

      const result = await collection.updateOne(
        { id: university.id },
        {
          $set: setDoc,
          $addToSet: { semesters: { $each: university.semesters } },
        },
        { upsert: true },
      );

      // Record when this semester's data was last stored.
      if (university.semesters.length > 0) {
        await collection.updateOne(
          { id: university.id },
          { $set: { [`timestamps.${university.semesters[0]}`]: now } },
        );
      }

      // For upserts, ensure properties are written (updateOne upsert always
      // writes the full $set doc, so this already happened above).
      if (result.upsertedId) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    return { inserted, updated, rows: universities.length };
  } finally {
    await page.close();
  }
}

const client = new MongoClient(MONGODB_URI);
let db: Db | null = null;

(async () => {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    db = client.db(DB_NAME);

    const allKeys = sortSemesterKeys(await getSemesterKeys(db));
    const semesters = parseArgs(allKeys);

    console.log(
      `Semesters to scrape (${semesters.length}): ${semesters.join(", ")}`,
    );

    const collection = db.collection(COLLECTION_NAME);
    // Drop the url index if it exists
    await collection.dropIndex("url_1").catch(() => {});
    // Create index on id for faster lookups
    await collection.createIndex({ id: 1 });

    const browser = await chromium.launch({
      headless: true,
    });
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRows = 0;

    try {
      for (const semester of semesters) {
        console.log(`\n=== Scraping: ${semester} ===`);
        const { inserted, updated, rows } = await scrapeSemester(
          db,
          semester,
          browser,
        );
        console.log(
          `[${semester}] Saved: ${inserted} inserted, ${updated} updated (${rows} rows)`,
        );
        totalInserted += inserted;
        totalUpdated += updated;
        totalRows += rows;
      }
    } finally {
      await browser.close();
    }

    console.log(
      `\nDone. Totals: ${totalRows} rows, ${totalInserted} inserted, ${totalUpdated} updated`,
    );
    console.log(`Collection: ${DB_NAME}.${COLLECTION_NAME}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    await client.close();
    console.log("Disconnected from MongoDB");
  }
})();
