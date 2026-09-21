import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";
const SAVE_EVERY = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  _id?: string;
  title: string;
  properties?: Record<string, string>;
  lat?: number | null;
  lon?: number | null;
  geocode?: string | null;
}

interface GeocodeResult {
  lat: number;
  lon: number;
  display: string;
  countryCode: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  address?: { country_code?: string };
}

// Region names used in the Notion list that Nominatim does not understand as-is
const REGION_ALIAS: Record<string, string> = {
  England: "United Kingdom",
  Czech: "Czech Republic",
  Turkiye: "Türkiye",
  "Mainland China": "China",
};
const normalizeRegion = (region: string) => REGION_ALIAS[region] || region;

// ISO 3166-1 alpha-2 code for each Region value. A result whose country does not
// match is treated as a failed search (e.g. "La Rochelle" must not resolve to the US).
const REGION_COUNTRY: Record<string, string> = {
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  Canada: "ca",
  Czech: "cz",
  Denmark: "dk",
  England: "gb",
  Estonia: "ee",
  Finland: "fi",
  France: "fr",
  Germany: "de",
  "Hong Kong": "hk",
  Indonesia: "id",
  Ireland: "ie",
  Italy: "it",
  Japan: "jp",
  Kazakhstan: "kz",
  Lithuania: "lt",
  Macau: "mo",
  "Mainland China": "cn",
  Malaysia: "my",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Poland: "pl",
  Portugal: "pt",
  Romania: "ro",
  Russia: "ru",
  Singapore: "sg",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Taiwan: "tw",
  Thailand: "th",
  Turkiye: "tr",
  "United States": "us",
  Uruguay: "uy",
  Vietnam: "vn",
};
const regionCountryCode = (region: string): string | undefined => {
  const code = REGION_COUNTRY[region.trim()];
  if (!code && region.trim())
    console.log(
      `  WARNING: no country code for region "${region}", result not verified`,
    );
  return code;
};

async function geocode(
  query: string,
  countryCode?: string,
  attempt = 0,
): Promise<GeocodeResult | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&addressdetails=1" +
    (countryCode ? "&countrycodes=" + countryCode : "") +
    "&q=" +
    encodeURIComponent(query);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "khu-university-list-geocoder/1.0 (ahncb@khu.ac.kr)",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (attempt >= 3) throw e;
    console.log(`  network error (${(e as Error).message}), retrying...`);
    await sleep(3000 * (attempt + 1));
    return geocode(query, countryCode, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5)
      throw new Error("geocode " + res.status + " for " + query);
    console.log(`  HTTP ${res.status}, backing off...`);
    await sleep(5000 * (attempt + 1));
    return geocode(query, countryCode, attempt + 1);
  }
  if (!res.ok) throw new Error("geocode " + res.status + " for " + query);
  const j = (await res.json()) as NominatimHit[];
  if (!j || !j.length) return null;
  const hit = j[0];
  const hitCountry = (hit.address && hit.address.country_code) || "";
  if (countryCode && hitCountry !== countryCode) {
    console.log(
      `  country mismatch (${hitCountry || "?"} != ${countryCode}) for "${query}": ${hit.display_name}`,
    );
    return null;
  }
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    display: hit.display_name,
    countryCode: hitCountry,
  };
}

function buildQuery(row: Row): string {
  const p = row.properties || {};
  const campus = (p.Campus || "").trim();
  const isSinglePlace =
    campus &&
    campus !== "All campuses" &&
    !campus.includes(",") &&
    !campus.includes(";") &&
    campus.length < 40;
  const region = normalizeRegion((p.Region || "").trim());
  let q = row.title;
  if (isSinglePlace) q = `${q}, ${campus}`;
  if (region) q = `${q}, ${region}`;
  return q;
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
    .trim();
}

function buildQueries(row: Row): string[] {
  const region = normalizeRegion(
    ((row.properties && row.properties.Region) || "").trim(),
  );
  const primary = buildQuery(row);
  const cleaned = cleanTitle(row.title);
  const queries: string[] = [];
  const push = (q: string) => {
    const s = q.replace(/\s+/g, " ").trim();
    if (s && s.length > 3 && !queries.includes(s)) queries.push(s);
  };
  push(primary);
  push(cleaned + (region ? `, ${region}` : ""));
  push(cleaned.split(",")[0] + (region ? `, ${region}` : ""));
  const kw = cleaned.match(
    /^(.{3,}?)\s+(University|Université|Univeristy|Universitat|Hochschule|Institute|Institut|School|College|Polytechnic|Technical|Academy|University of Applied Sciences|대학|유니버시티)/i,
  );
  if (kw && kw[1]) push(kw[1] + (region ? `, ${region}` : ""));
  // last resort: name only, without region (region in the list is sometimes wrong)
  push(cleaned);
  push(cleaned.split(",")[0]);
  return queries;
}

const MANUAL: Record<string, string> = {
  "University of Applied Sciences BFI Vienna": "BFI Vienna, Austria",
  "Aix-Marseille University (Faculty of Arts & Humanities)":
    "Aix-Marseille Université, France",
  "University of Limoges - Faculty of Arts and Humanities":
    "Université de Limoges, France",
  "Université Paris Dauphine – PSL": "Université Paris-Dauphine, France",
  "University of La Rochelle": "La Rochelle Université",
  "Ritsumeikan Asia Pacific University": "立命館アジア太平洋大学",
  "Yamanashi Gakuin University(iCLA)": "山梨学院大学",
  "HU University of Applied Sciences": "Hogeschool Utrecht, Netherlands",
  "University of Navarra(School of Economics and Business)":
    "Universidad de Navarra, Spain",
  "University of Navarra": "Universidad de Navarra, Spain",
  "OST Eastern Switzerland University of Applied Sciences":
    "Ostschweizer Fachhochschule Campus Rapperswil Jona, Switzerland",
};

const client = new MongoClient(MONGODB_URI);

let ok = 0;
let fail = 0;
let idx = 0;
try {
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  const rows = await collection.find({ title: { $exists: true } }).toArray() as Row[];
  const done = rows.filter((r) => r.lat != null && r.lon != null);
  const todo = rows.filter((r) => r.lat == null || r.lon == null);
  console.log(
    `rows total: ${rows.length}, already geocoded: ${done.length}, to do: ${todo.length}`,
  );

  for (const row of todo) {
    const queries = buildQueries(row);
    if (MANUAL[row.title]) queries.unshift(MANUAL[row.title]);
    const countryCode = regionCountryCode(
      (row.properties && row.properties.Region) || "",
    );
    let result: GeocodeResult | null = null;
    for (const query of queries) {
      result = await geocode(query, countryCode);
      if (result) break;
      await sleep(1100);
    }
    idx++;
    if (result) {
      await collection.updateOne(
        { _id: row._id },
        {
          $set: {
            lat: result.lat,
            lon: result.lon,
            geocode: result.display,
          },
        }
      );
      ok++;
      console.log(`[${idx}/${todo.length}] ${row.title} -> ${result.display}`);
    } else {
      await collection.updateOne(
        { _id: row._id },
        {
          $set: {
            lat: null,
            lon: null,
          },
        }
      );
      fail++;
      console.log(`[${idx}/${todo.length}] NO RESULT: ${row.title}`);
    }
    await sleep(1100);
  }
  console.log(`DONE. ok=${ok} fail=${fail}`);
} finally {
  await client.close();
}
