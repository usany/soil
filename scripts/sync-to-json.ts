import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "db/universities.json");
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";

interface UniversityRow {
  _id?: string;
  id?: string;
  title: string;
  url?: string;
  summary?: string;
  properties?: Record<string, string>;
  content?: unknown[];
  lat?: number | null;
  lon?: number | null;
  geocode?: string | null;
  nearestAirport?: {
    name: string;
    city: string;
    iata: string;
    icao: string;
    lat: number;
    lon: number;
    distanceKm: number;
  };
  scrapedAt?: Date;
}

interface CacheData {
  generatedAt: string;
  exchange: {
    label: string;
    rows: UniversityRow[];
  };
}

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  console.log("Fetching universities from MongoDB...");
  const rows = await collection
    .find({ title: { $exists: true } })
    .toArray() as UniversityRow[];

  console.log(`Found ${rows.length} universities`);

  // Remove MongoDB internal _id field from each row (keep other fields)
  const cleanRows = rows.map((row) => {
    const { _id, ...rest } = row;
    return rest;
  });

  const cacheData: CacheData = {
    generatedAt: new Date().toISOString(),
    exchange: {
      label: "2026 Fall Exchange Program University List",
      rows: cleanRows,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cacheData, null, 2));
  console.log(`✓ Cached ${rows.length} universities to ${OUTPUT_FILE}`);
  console.log(`Generated at: ${cacheData.generatedAt}`);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Error syncing to JSON:", errorMessage);
  process.exit(1);
} finally {
  await client.close();
}
