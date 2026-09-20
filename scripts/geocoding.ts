import fs from "node:fs"

const FILE = "scripts/universities.json"
const SAVE_EVERY = 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Row {
  title: string
  properties?: Record<string, string>
  lat?: number | null
  lon?: number | null
  geocode?: string | null
}

interface Data {
  lists: Record<string, { rows: Row[] }>
}

interface GeocodeResult {
  lat: number
  lon: number
  display: string
}

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
}

const data: Data = JSON.parse(fs.readFileSync(FILE, "utf8"))

// Region names used in the Notion list that Nominatim does not understand as-is
const REGION_ALIAS: Record<string, string> = {
  England: "United Kingdom",
  Czech: "Czech Republic",
  Turkiye: "Türkiye",
  "Mainland China": "China",
}
const normalizeRegion = (region: string) => REGION_ALIAS[region] || region

async function geocode(query: string, attempt = 0): Promise<GeocodeResult | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=" +
    encodeURIComponent(query)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { "user-agent": "khu-university-list-geocoder/1.0 (outbound.mobility@khu.ac.kr)" },
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    if (attempt >= 3) throw e
    console.log(`  network error (${(e as Error).message}), retrying...`)
    await sleep(3000 * (attempt + 1))
    return geocode(query, attempt + 1)
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error("geocode " + res.status + " for " + query)
    console.log(`  HTTP ${res.status}, backing off...`)
    await sleep(5000 * (attempt + 1))
    return geocode(query, attempt + 1)
  }
  if (!res.ok) throw new Error("geocode " + res.status + " for " + query)
  const j = (await res.json()) as NominatimHit[]
  if (!j || !j.length) return null
  return { lat: Number(j[0].lat), lon: Number(j[0].lon), display: j[0].display_name }
}

function buildQuery(row: Row): string {
  const p = row.properties || {}
  const campus = (p.Campus || "").trim()
  const isSinglePlace = campus && campus !== "All campuses" && !campus.includes(",") && !campus.includes(";") && campus.length < 40
  const region = normalizeRegion((p.Region || "").trim())
  let q = row.title
  if (isSinglePlace) q = `${q}, ${campus}`
  if (region) q = `${q}, ${region}`
  return q
}

function cleanTitle(title: string): string {
  return title
    .replace(/[가-힣]/g, " ")
    .replace(/\s*Study Abroad Program\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[|].*$/g, "")
    .replace(/\s*-\s*.*$/g, "")
    .replace(/_.*$/g, "")
    .replace(/\(.*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function buildQueries(row: Row): string[] {
  const region = normalizeRegion(((row.properties && row.properties.Region) || "").trim())
  const primary = buildQuery(row)
  const cleaned = cleanTitle(row.title)
  const queries: string[] = []
  const push = (q: string) => {
    const s = q.replace(/\s+/g, " ").trim()
    if (s && s.length > 3 && !queries.includes(s)) queries.push(s)
  }
  push(primary)
  push(cleaned + (region ? `, ${region}` : ""))
  push(cleaned.split(",")[0] + (region ? `, ${region}` : ""))
  const kw = cleaned.match(/^(.{3,}?)\s+(University|Université|Univeristy|Universitat|Hochschule|Institute|Institut|School|College|Polytechnic|Technical|Academy|University of Applied Sciences|대학|유니버시티)/i)
  if (kw && kw[1]) push(kw[1] + (region ? `, ${region}` : ""))
  // last resort: name only, without region (region in the list is sometimes wrong)
  push(cleaned)
  push(cleaned.split(",")[0])
  return queries
}

const MANUAL: Record<string, string> = {
  "University of Applied Sciences BFI Vienna": "BFI Vienna, Austria",
  "Aix-Marseille University (Faculty of Arts & Humanities)": "Aix-Marseille Université, France",
  "University of Limoges - Faculty of Arts and Humanities": "Université de Limoges, France",
  "Université Paris Dauphine – PSL": "Université Paris-Dauphine, France",
  "Ritsumeikan Asia Pacific University": "立命館アジア太平洋大学",
  "Yamanashi Gakuin University(iCLA)": "山梨学院大学",
  "HU University of Applied Sciences": "Hogeschool Utrecht, Netherlands",
  "University of Navarra(School of Economics and Business)": "Universidad de Navarra, Spain",
  "University of Navarra": "Universidad de Navarra, Spain",
  "OST Eastern Switzerland University of Applied Sciences": "Ostschweizer Fachhochschule Campus Rapperswil Jona, Switzerland",
}

const rows = Object.values(data.lists).flatMap((list) => list.rows)
const done = rows.filter((r) => r.lat != null && r.lon != null)
const todo = rows.filter((r) => r.lat == null || r.lon == null)
console.log(`rows total: ${rows.length}, already geocoded: ${done.length}, to do: ${todo.length}`)

const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2))

let ok = 0
let fail = 0
let idx = 0
try {
  for (const row of todo) {
    const queries = buildQueries(row)
    if (MANUAL[row.title]) queries.unshift(MANUAL[row.title])
    let result: GeocodeResult | null = null
    for (const query of queries) {
      result = await geocode(query)
      if (result) break
      await sleep(1100)
    }
    idx++
    if (result) {
      row.lat = result.lat
      row.lon = result.lon
      row.geocode = result.display
      ok++
      console.log(`[${idx}/${todo.length}] ${row.title} -> ${result.display}`)
    } else {
      row.lat = null
      row.lon = null
      fail++
      console.log(`[${idx}/${todo.length}] NO RESULT: ${row.title}`)
    }
    if (idx % SAVE_EVERY === 0) save()
    await sleep(1100)
  }
} finally {
  save()
  console.log(`DONE. ok=${ok} fail=${fail}`)
  console.log("saved", FILE)
}
