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

interface ContentBlock {
  type: string;
  text: string;
}

interface Detail {
  title: string;
  properties: Record<string, string>;
  content: ContentBlock[];
}

interface UniversityRow extends Omit<Detail, "title"> {
  _id?: string;
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
  // Notion only fetches collection rows after "Load more" is clicked; repeat until the button is gone.
  for (let i = 0; i < 30; i++) {
    const btn = page.getByText("Load more", { exact: true }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click().catch(() => {});
    await sleep(2500);
  }
}

function collectRowLinks(page: Page): Promise<RowLink[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const rows: RowLink[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const text = (a.innerText || "").trim();
      if (!/^\p{Regional_Indicator}{2}/u.test(text)) continue;
      const url = a.href.split("?")[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const lines = text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      rows.push({
        url,
        title: lines[1] || "",
        summary: lines.slice(1).join(" | "),
      });
    }
    return rows;
  });
}

async function scrapeDetail(page: Page, url: string): Promise<Detail> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[role='table'] [role='row']", { timeout: 30000 });

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
    const properties: Record<string, string> = {};
    for (const row of document.querySelectorAll(
      "[role='table'] [role='row']",
    )) {
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

    const body = document.querySelector<HTMLElement>(".notion-page-content");
    const content: ContentBlock[] = body
      ? body.innerText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ type: "text", text }))
      : [];

    return {
      title: document.querySelector("h1")?.innerText.trim() || "",
      properties,
      content,
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
    await sleep(4000);
    await expandAllRows(page);

    const links = await collectRowLinks(page);
    console.log(`[${semester}] rows found: ${links.length}`);
    if (links.length === 0) {
      const title = await page.title();
      throw new Error(`no rows found (page title: "${title}")`);
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
        content: detail.content,
      });
      if ((i + 1) % 10 === 0 || i + 1 === links.length)
        console.log(`[${semester}] scraped ${i + 1}/${links.length}`);
      await sleep(800);
    }

    // Insert or update universities in MongoDB
    let inserted = 0;
    let updated = 0;

    for (const university of universities) {
      const result = await collection.updateOne(
        { id: university.id },
        {
          $set: {
            summary: university.summary,
            properties: university.properties,
            content: university.content,
          },
          $addToSet: { semesters: { $each: university.semesters } },
        },
        { upsert: true },
      );
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

    const browser = await chromium.launch({ headless: false });
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
