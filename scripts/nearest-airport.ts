import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// OurAirports open data: https://davidmegginson.github.io/ourairports-data/airports.csv
const AIRPORTS_FILE = path.join(__dirname, "..", "db/airports.csv");
const AIRPORT_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
]);
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";

interface Airport {
  name: string;
  city: string;
  iata: string;
  icao: string;
  lat: number;
  lon: number;
}

interface Row {
  _id?: string;
  title: string;
  properties?: Record<string, string>;
  lat?: number | null;
  lon?: number | null;
  nearestAirport?: Airport & { distanceKm: number };
}

// Region label used in universities.json -> ISO 3166-1 alpha-2 (OurAirports iso_country)
const COUNTRY_MAP: Record<string, string> = {
  Italy: "IT",
  Russia: "RU",
  Australia: "AU",
  Austria: "AT",
  Canada: "CA",
  Finland: "FI",
  France: "FR",
  Belgium: "BE",
  Czech: "CZ",
  Denmark: "DK",
  England: "GB",
  Estonia: "EE",
  Germany: "DE",
  "Hong Kong": "HK",
  Indonesia: "ID",
  Ireland: "IE",
  Japan: "JP",
  Kazakhstan: "KZ",
  Lithuania: "LT",
  Macau: "MO",
  "Mainland China": "CN",
  Malaysia: "MY",
  Mexico: "MX",
  Morocco: "MA",
  Netherlands: "NL",
  Poland: "PL",
  "New Zealand": "NZ",
  Portugal: "PT",
  Romania: "RO",
  Singapore: "SG",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Taiwan: "TW",
  Thailand: "TH",
  Turkiye: "TR",
  "United States": "US",
  Uruguay: "UY",
  Vietnam: "VN",
};

function parseCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (inQ) {
      if (ch === '"') {
        if (line[k + 1] === '"') {
          cur += '"';
          k++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadAirports(): Map<string, Airport[]> {
  const raw = fs.readFileSync(AIRPORTS_FILE, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsv(lines[0]);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`airports.csv: missing column ${name}`);
    return i;
  };
  const iType = col("type");
  const iName = col("name");
  const iLat = col("latitude_deg");
  const iLon = col("longitude_deg");
  const iCountry = col("iso_country");
  const iCity = col("municipality");
  const iScheduled = col("scheduled_service");
  const iIcao = col("icao_code");
  const iIata = col("iata_code");

  const index = new Map<string, Airport[]>();
  for (const line of lines.slice(1)) {
    const c = parseCsv(line);
    if (c.length <= iIata) continue;
    if (!AIRPORT_TYPES.has(c[iType])) continue;
    // Flight price lookup needs an IATA code and actual scheduled flights
    if (!c[iIata]) continue;
    if (c[iScheduled] !== "yes") continue;
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const country = c[iCountry];
    const airport: Airport = {
      name: c[iName],
      city: c[iCity],
      iata: c[iIata],
      icao: c[iIcao],
      lat,
      lon,
    };
    if (!index.has(country)) index.set(country, []);
    index.get(country)!.push(airport);
  }
  return index;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestAirport(
  airports: Airport[],
  lat: number,
  lon: number,
): Airport & { distanceKm: number } {
  let best: Airport = airports[0];
  let bestDist = Infinity;
  for (const a of airports) {
    const d = haversine(lat, lon, a.lat, a.lon);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return { ...best, distanceKm: Math.round(bestDist * 10) / 10 };
}

const airportsByCountry = loadAirports();
console.log(
  `loaded ${airportsByCountry.size} countries from airports.csv (OurAirports)`,
);

const client = new MongoClient(MONGODB_URI);

let ok = 0;
let noRegion = 0;
let noAirport = 0;

try {
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  const rows = await collection.find({ title: { $exists: true } }).toArray() as Row[];

  for (const row of rows) {
    if (row.lat == null || row.lon == null) continue;
    const region = ((row.properties && row.properties.Region) || "").trim();
    if (!region) {
      noRegion++;
      continue;
    }
    const ofCountry = COUNTRY_MAP[region];
    if (!ofCountry) {
      console.log("NO MAP:", row.title, "=>", region);
      noAirport++;
      continue;
    }
    const airports = airportsByCountry.get(ofCountry);
    if (!airports || !airports.length) {
      console.log("NO AIRPORTS:", row.title, "=>", ofCountry);
      noAirport++;
      continue;
    }
    const nearestAirportData = nearestAirport(airports, row.lat, row.lon);
    await collection.updateOne(
      { _id: row._id },
      { $set: { nearestAirport: nearestAirportData } }
    );
    ok++;
  }

  console.log(`DONE. ok=${ok} noRegion=${noRegion} noAirport=${noAirport}`);
} finally {
  await client.close();
}
