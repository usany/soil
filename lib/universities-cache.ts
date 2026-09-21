import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "db/universities.json");

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

// Read from MongoDB with fallback to cached JSON file
export async function getUniversities(options?: {
  useCache?: boolean;
  mongoUri?: string;
}): Promise<UniversityRow[]> {
  const useCache = options?.useCache !== false; // Default to trying MongoDB first
  const mongoUri = options?.mongoUri || process.env.MONGODB_URI;

  // If MongoDB is disabled or not available, use cache
  if (!mongoUri || useCache) {
    return getUniversitiesFromCache();
  }

  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    try {
      const db = client.db("notion_scrape");
      const collection = db.collection("universities");
      const rows = await collection
        .find({ title: { $exists: true } })
        .toArray();
      return rows as UniversityRow[];
    } finally {
      await client.close();
    }
  } catch (error) {
    console.warn(
      "MongoDB connection failed, falling back to cache:",
      error instanceof Error ? error.message : String(error)
    );
    return getUniversitiesFromCache();
  }
}

// Read from cached JSON file
export function getUniversitiesFromCache(): UniversityRow[] {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.warn(`Cache file not found: ${CACHE_FILE}`);
      return [];
    }
    const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return data.exchange.rows;
  } catch (error) {
    console.error(
      "Failed to read cache file:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

// Get cache metadata (when it was generated)
export function getCacheMetadata(): {
  generatedAt: string | null;
  exists: boolean;
} {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return { exists: false, generatedAt: null };
    }
    const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return { exists: true, generatedAt: data.generatedAt };
  } catch {
    return { exists: false, generatedAt: null };
  }
}
