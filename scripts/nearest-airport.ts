import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, "..", "universities.json")
const AIRPORTS_FILE = path.join(__dirname, "airports.dat")

interface Airport {
  name: string
  city: string
  iata: string
  icao: string
  lat: number
  lon: number
}

interface Row {
  title: string
  properties?: Record<string, string>
  lat?: number | null
  lon?: number | null
  nearestAirport?: Airport & { distanceKm: number }
}

interface Data {
  exchange: { rows: Row[] }
  study: { rows: Row[] }
}

const COUNTRY_MAP: Record<string, string> = {
  "Italy": "Italy",
  "Russia": "Russia",
  "Australia": "Australia",
  "Austria": "Austria",
  "Canada": "Canada",
  "Finland": "Finland",
  "France": "France",
  "Belgium": "Belgium",
  "Czech": "Czech Republic",
  "Denmark": "Denmark",
  "England": "United Kingdom",
  "Estonia": "Estonia",
  "Germany": "Germany",
  "Hong Kong": "Hong Kong",
  "Indonesia": "Indonesia",
  "Ireland": "Ireland",
  "Japan": "Japan",
  "Kazakhstan": "Kazakhstan",
  "Lithuania": "Lithuania",
  "Macau": "Macau",
  "Mainland China": "China",
  "Malaysia": "Malaysia",
  "Mexico": "Mexico",
  "Morocco": "Morocco",
  "Netherlands": "Netherlands",
  "Poland": "Poland",
  "New Zealand": "New Zealand",
  "Portugal": "Portugal",
  "Romania": "Romania",
  "Singapore": "Singapore",
  "Spain": "Spain",
  "Sweden": "Sweden",
  "Switzerland": "Switzerland",
  "Taiwan": "Taiwan",
  "Thailand": "Thailand",
  "Turkiye": "Turkey",
  "United States": "United States",
  "Uruguay": "Uruguay",
  "Vietnam": "Vietnam",
}

function parseCsv(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let k = 0; k < line.length; k++) {
    const ch = line[k]
    if (inQ) {
      if (ch === '"') {
        if (line[k + 1] === '"') { cur += '"'; k++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ",") { out.push(cur); cur = "" }
    else cur += ch
  }
  out.push(cur)
  return out
}

function loadAirports(): Map<string, Airport[]> {
  const raw = fs.readFileSync(AIRPORTS_FILE, "utf8")
  const index = new Map<string, Airport[]>()
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const c = parseCsv(line)
    if (c.length < 14) continue
    const type = c[12]
    if (type !== "airport") continue
    if (c[4] === "\\N") continue
    const lat = Number(c[6])
    const lon = Number(c[7])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const country = c[3]
    const airport: Airport = {
      name: c[1],
      city: c[2],
      iata: c[4],
      icao: c[5],
      lat,
      lon,
    }
    if (!index.has(country)) index.set(country, [])
    index.get(country)!.push(airport)
  }
  return index
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function nearestAirport(airports: Airport[], lat: number, lon: number): Airport & { distanceKm: number } {
  let best: Airport = airports[0]
  let bestDist = Infinity
  for (const a of airports) {
    const d = haversine(lat, lon, a.lat, a.lon)
    if (d < bestDist) {
      bestDist = d
      best = a
    }
  }
  return { ...best, distanceKm: Math.round(bestDist * 10) / 10 }
}

const airportsByCountry = loadAirports()
console.log(`loaded ${airportsByCountry.size} countries from airports.dat`)

const data: Data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
const rows: Row[] = [...data.exchange.rows, ...data.study.rows]
let ok = 0
let noRegion = 0
let noAirport = 0

for (const row of rows) {
  delete row.nearestAirport
  if (row.lat == null || row.lon == null) continue
  const region = (row.properties && row.properties.Region || "").trim()
  if (!region) { noRegion++; continue }
  const ofCountry = COUNTRY_MAP[region]
  if (!ofCountry) { console.log("NO MAP:", row.title, "=>", region); noAirport++; continue }
  const airports = airportsByCountry.get(ofCountry)
  if (!airports || !airports.length) { console.log("NO AIRPORTS:", row.title, "=>", ofCountry); noAirport++; continue }
  row.nearestAirport = nearestAirport(airports, row.lat, row.lon)
  ok++
}

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
console.log(`DONE. ok=${ok} noRegion=${noRegion} noAirport=${noAirport}`)
