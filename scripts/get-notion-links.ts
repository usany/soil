import axios from "axios";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Board list URL (search for "notion" in the Outgoing Program board)
const LIST_URL =
  "https://oia.khu.ac.kr/oiak_kor/user/bbs/BMSR00040/list.do";
const MENU_NO = "5800012";
const SEARCH_KEYWORD = "notion";

// File where collected Notion links are stored (semester-keyed JSON object)
const URLS_FILE = join(__dirname, "list-urls.json");

// Notion hosts that we consider "Notion links"
const NOTION_HOSTS = ["notion.site", "notion.so", "app.notion.com", "notion.com"];

type ListUrls = Record<string, string>;

function readExisting(): ListUrls {
  if (!existsSync(URLS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(URLS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  return res.data;
}

function isNotionUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NOTION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Extract the full Notion URL from an <a href>. When the board uses a
 * redirect/out-link wrapper we need the actual notion target. Here we keep it
 * simple: the href itself is already the notion URL.
 */
function toCanonicalNotionUrl(href: string): string | null {
  try {
    const u = new URL(href);
    if (!isNotionUrl(u.href)) return null;
    // Strip query + fragment (e.g. "?assetsVersion=...&clientBuildTarget=...")
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

/** Prefer a real host-university list URL over a "will-be-confirmed" placeholder. */
function isPlaceholder(url: string): boolean {
  return /will-be-confirmed/i.test(url);
}

/**
 * Derive the semester key from a Notion URL slug, e.g.:
 *   ".../2027-Spring-Exchange-Program-Host-University-List-..."
 *   -> "27spring"
 * Falls back to null when the year/season cannot be determined.
 */
function semesterKeyFromUrl(url: string): string | null {
  const m = url.match(/\/(20\d{2})-(Spring|Fall|Summer|Winter)/i);
  if (!m) return null;
  const year = m[1].slice(2); // "2027" -> "27"
  const season = m[2].toLowerCase();
  return `${year}${season}`;
}

async function getBoardIds(): Promise<string[]> {
  const ids = new Set<string>();
  let pageIndex = 1;

  while (true) {
    const url =
      `${LIST_URL}?menuNo=${MENU_NO}&boardType=&pageIndex=${pageIndex}` +
      `&searchCondition=2&searchKeyword=${SEARCH_KEYWORD}&userDisplayCount=10`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    $("a[href^='javascript:view(']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/view\('(\d+)'\)/);
      if (m) ids.add(m[1]);
    });

    const pageNumbers = $(".paging_w a")
      .map((_, el) => parseInt($(el).text().trim(), 10))
      .get()
      .filter((n) => !Number.isNaN(n) && n > 0);
    const lastPage = pageNumbers.length ? Math.max(...pageNumbers) : 1;

    if (pageIndex >= lastPage) break;
    pageIndex++;
  }

  return [...ids];
}

async function getNotionLinksFromDetail(boardId: string): Promise<string[]> {
  const url =
    `https://oia.khu.ac.kr/oiak_kor/user/bbs/BMSR00040/view.do` +
    `?boardId=${boardId}&menuNo=${MENU_NO}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const canonical = toCanonicalNotionUrl(href);
    if (canonical) links.add(canonical);
  });
  return [...links];
}

async function main() {
  console.log("Fetching board list ...");
  const boardIds = await getBoardIds();
  console.log(`Found ${boardIds.length} post(s)`);

  // Collect raw notion links across all posts, preferring a canonical host:
  // the original list-urls.json uses "*.notion.site" links, so we prefer
  // those over "www.notion.so" for the same page id.
  const foundByPageId = new Map<string, string>();
  const pending = new Map<string, string>(); // link -> some semester key (later)

  for (let i = 0; i < boardIds.length; i++) {
    const id = boardIds[i];
    try {
      const links = await getNotionLinksFromDetail(id);
      for (const link of links) {
        const pageId = link.match(/([0-9a-f]{32})/i)?.[1] ?? link;
        const prev = foundByPageId.get(pageId);
        const better =
          !prev ||
          (link.includes("notion.site") && !prev.includes("notion.site")) ||
          (!isPlaceholder(link) && isPlaceholder(prev));
        if (better) {
          foundByPageId.set(pageId, link);
        }
      }
      console.log(`  [${i + 1}/${boardIds.length}] boardId=${id} -> ${links.length} link(s)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [${i + 1}/${boardIds.length}] boardId=${id} FAILED: ${msg}`);
    }
  }

  const existing = readExisting();
  const result: ListUrls = { ...existing };
  let added = 0;
  const skippedNoKey: string[] = [];

  for (const link of foundByPageId.values()) {
    // Skip if this URL (or same page id) is already recorded.
    const pageId = link.match(/([0-9a-f]{32})/i)?.[1];
    const alreadyPresent = Object.entries(existing).some(
      ([, existingUrl]) =>
        existingUrl === link ||
        (pageId && existingUrl.includes(pageId)),
    );
    if (alreadyPresent) continue;

    const key = semesterKeyFromUrl(link);
    if (!key) {
      skippedNoKey.push(link);
      continue;
    }

    // Multi-year URLs (older posts) may repeat a season key; first wins.
    if (!(key in result)) {
      result[key] = link;
      added++;
    }
  }

  writeFileSync(URLS_FILE, JSON.stringify(result) + "\n");

  console.log(`\nSaved to ${URLS_FILE} (added ${added} link(s))`);
  for (const [k, v] of Object.entries(result)) {
    if (!(k in existing)) console.log(`  + "${k}": "${v}"`);
  }
  for (const link of skippedNoKey) {
    console.warn(`  ! no semester key, skipped: ${link}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
