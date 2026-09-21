import dotenv from "dotenv";
import { chromium, type Page } from "playwright";
import { MongoClient, Db, Collection } from "mongodb";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIST_URL = JSON.parse(
  readFileSync(join(__dirname, "list-urls.json"), "utf-8"),
);

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";

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

interface UniversityRow extends Omit<Detail, 'title'> {
  _id?: string;
  id: string;
  summary: string;
  semesters: string[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getSelectedSemester(): string {
  const sourceIndex = process.argv.indexOf("--source");
  if (sourceIndex === -1 || sourceIndex === process.argv.length - 1) {
    console.error(
      `Usage: npm run scrape -- --source <semester>\nAvailable: ${Object.keys(LIST_URL).join(", ")}`,
    );
    process.exit(1);
  }
  const semester = process.argv[sourceIndex + 1];
  if (!(semester in LIST_URL)) {
    console.error(
      `Invalid semester: ${semester}\nAvailable: ${Object.keys(LIST_URL).join(", ")}`,
    );
    process.exit(1);
  }
  return semester;
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

const client = new MongoClient(MONGODB_URI);
let db: Db | null = null;
let collection: Collection | null = null;

try {
  const semester = getSelectedSemester();
  console.log(`Scraping: ${semester}`);

  await client.connect();
  console.log("Connected to MongoDB");

  db = client.db(DB_NAME);
  collection = db.collection(COLLECTION_NAME);

  // Create index on properties.url for uniqueness
  await collection.createIndex({ "properties.url": 1 }, { unique: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto(LIST_URL[semester as keyof typeof LIST_URL], {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(4000);
  await expandAllRows(page);

  const links = await collectRowLinks(page);
  console.log(`rows found: ${links.length}`);
  if (links.length === 0) {
    const title = await page.title();
    await browser.close();
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
    if (!detail) continue;
    const uniName = detail.title || link.title;
    universities.push({
      id: uniName,
      summary: link.summary,
      semesters: [semester],
      properties: { ...detail.properties, url: link.url },
      content: detail.content,
    });
    if ((i + 1) % 10 === 0 || i + 1 === links.length)
      console.log(`scraped ${i + 1}/${links.length}`);
    await sleep(800);
  }

  await browser.close();

  // Insert or update universities in MongoDB
  let inserted = 0;
  let updated = 0;

  for (const university of universities) {
    const result = await collection.updateOne(
      { "properties.url": university.properties.url },
      {
        $set: {
          id: university.id,
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

  console.log(`Saved to MongoDB: ${inserted} inserted, ${updated} updated`);
  console.log(`Collection: ${DB_NAME}.${COLLECTION_NAME}`);
} finally {
  await client.close();
  console.log("Disconnected from MongoDB");
}
