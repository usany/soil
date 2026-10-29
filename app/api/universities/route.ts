import { MongoClient } from "mongodb";

export const dynamic = "force-dynamic";

interface UniversityRow {
  _id?: unknown;
  id?: string;
  url?: string;
  summary?: string;
  properties?: Record<string, string>;
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

const DB_NAME = "notion_scrape";
const COLLECTION_NAME = "universities";

export async function GET() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return Response.json(
      { success: false, error: "MONGODB_URI is not configured" },
      { status: 500 },
    );
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    const rows = (await collection
      .find({})
      .toArray()) as UniversityRow[];

    const cleaned = rows.map(({ _id, ...rest }) => rest);

    return Response.json({
      success: true,
      generatedAt: new Date().toISOString(),
      label: "2026 Fall Exchange Program University List",
      rows: cleaned,
    });
  } catch (error) {
    console.error("Error fetching universities from MongoDB:", error);
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch from DB",
      },
      { status: 500 },
    );
  } finally {
    await client.close();
  }
}
