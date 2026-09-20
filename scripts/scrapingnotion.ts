import fs from "node:fs"
import { chromium, type Page } from "playwright"

const LIST_URL = "https://dust-driver-b9b.notion.site/2026-Fall-Exchange-Program-Host-University-List-299195d34d6d81ad8d62f3b191e63222"
const OUT = "scripts/universities.json"

const LABEL = "2026 Fall Exchange Program University List"

interface RowLink {
  url: string
  title: string
  summary: string
}

interface ContentBlock {
  type: string
  text: string
}

interface Detail {
  title: string
  properties: Record<string, string>
  content: ContentBlock[]
}

interface UniversityRow extends Detail {
  id: string
  url: string
  summary: string
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function expandAllRows(page: Page): Promise<void> {
  // Notion only fetches collection rows after "Load more" is clicked; repeat until the button is gone.
  for (let i = 0; i < 30; i++) {
    const btn = page.getByText("Load more", { exact: true }).first()
    if (!(await btn.isVisible().catch(() => false))) break
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    await btn.click().catch(() => {})
    await sleep(2500)
  }
}

function collectRowLinks(page: Page): Promise<RowLink[]> {
  return page.evaluate(() => {
    const seen = new Set<string>()
    const rows: RowLink[] = []
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const text = (a.innerText || "").trim()
      if (!/^\p{Regional_Indicator}{2}/u.test(text)) continue
      const url = a.href.split("?")[0]
      if (seen.has(url)) continue
      seen.add(url)
      const lines = text.split("\n").map((s) => s.trim()).filter(Boolean)
      rows.push({ url, title: lines[1] || "", summary: lines.slice(1).join(" | ") })
    }
    return rows
  })
}

async function scrapeDetail(page: Page, url: string): Promise<Detail> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForSelector("[role='table'] [role='row']", { timeout: 30000 })

  const more = page.getByText(/^\d+ more propert/).first()
  if (await more.isVisible().catch(() => false)) {
    await more.click().catch(() => {})
    await sleep(800)
  }

  await page
    .waitForFunction(() => !document.body.innerText.includes("Loading..."), { timeout: 8000 })
    .catch(() => {})

  return page.evaluate(() => {
    const properties: Record<string, string> = {}
    for (const row of document.querySelectorAll("[role='table'] [role='row']")) {
      const cells = row.querySelectorAll<HTMLElement>("[role='cell']")
      if (cells.length < 2) continue
      const name = cells[0].innerText.trim()
      let value = cells[1].innerText.trim()
      const anchors = [...cells[1].querySelectorAll<HTMLAnchorElement>("a[href]")]
      for (const a of anchors) {
        const shown = a.innerText.trim()
        if (shown && value.includes(shown) && !value.includes(a.href)) value = value.replace(shown, a.href)
      }
      for (const a of anchors) if (!value.includes(a.href)) value += (value ? "\n" : "") + a.href
      value = value.replace(/mailto:/g, "")
      if (value === "Empty") value = ""
      if (name) properties[name] = value
    }

    const body = document.querySelector<HTMLElement>(".notion-page-content")
    const content: ContentBlock[] = body
      ? body.innerText.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => ({ type: "text", text }))
      : []

    return { title: document.querySelector("h1")?.innerText.trim() || "", properties, content }
  })
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 900 })

await page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 120000 })
await sleep(4000)
await expandAllRows(page)

// Every row on the page (Exchange and Study Abroad lists alike) goes into `exchange`.
const links = await collectRowLinks(page)
console.log(`rows found: ${links.length}`)
if (links.length === 0) {
  const title = await page.title()
  await browser.close()
  throw new Error(`no rows found (page title: "${title}") - not overwriting ${OUT}`)
}

const exchange = { label: LABEL, rows: [] as UniversityRow[] }

for (let i = 0; i < links.length; i++) {
  const link = links[i]
  let detail: Detail | null = null
  for (let attempt = 0; attempt < 3 && !detail; attempt++) {
    try {
      detail = await scrapeDetail(page, link.url)
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e)
      if (attempt === 2) console.log(`failed: ${link.title} (${msg})`)
      else await sleep(3000 * (attempt + 1))
    }
  }
  if (!detail) continue
  exchange.rows.push({
    id: link.url.match(/([0-9a-f]{32})$/)?.[1] ?? link.url,
    title: detail.title || link.title,
    url: link.url,
    summary: link.summary,
    properties: detail.properties,
    content: detail.content,
  })
  if ((i + 1) % 10 === 0 || i + 1 === links.length) console.log(`scraped ${i + 1}/${links.length}`)
  await sleep(800)
}

await browser.close()

const out = { generatedAt: new Date().toISOString(), exchange }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log(`saved ${OUT}: exchange=${exchange.rows.length}`)
