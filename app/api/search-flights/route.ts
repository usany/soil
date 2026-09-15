import { NextRequest } from "next/server";

function normalizeAirportCode(input: string): string | undefined {
  const upper = input.toUpperCase();
  if (upper.length === 3) return upper;
}

function formatDateForAPI(dateStr: string): string {
  // Handle YYYYMMDD format (from frontend form submission)
  if (dateStr.length === 8 && !dateStr.includes("-")) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6)}`;
  }
  // Already in YYYY-MM-DD format
  return dateStr;
}

export async function POST(request: NextRequest) {
  let origin = "ICN";
  let destination: string | undefined;
  let date: string | undefined;

  try {
    const body = await request.json();
    destination = normalizeAirportCode(body.destination || "");
    date = body.date;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!destination || !date) {
    return Response.json(
      {
        error:
          "Missing destination or date. Departure is fixed to ICN (Incheon)",
      },
      { status: 400 },
    );
  }

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "SERPAPI_KEY environment variable is not set" },
        { status: 400 },
      );
    }

    const formattedDate = formatDateForAPI(date);
    const url = `https://serpapi.com/search?engine=google_flights&departure_id=${origin}&arrival_id=${destination}&outbound_date=${formattedDate}&type=2&currency=USD&hl=en&gl=us&api_key=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Brave Search API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    console.log("SerpAPI Response:", JSON.stringify(data, null, 2));
    console.log("Available keys:", Object.keys(data));

    if (data.error) {
      console.log("SerpAPI Error:", data.error);
    }
    if (data.search_information) {
      console.log("Search information:", data.search_information);
    }

    // SerpAPI returns flights directly in best_flights/other_flights
    const siteResults = [];
    if (data.google_flights_url) {
      siteResults.push({
        source: "Google Flights",
        url: data.google_flights_url,
      });
    }

    let minPrice: number | null = null;
    const flights: any[] = [];

    // Extract from google_flights best_flights
    if (data.best_flights && data.best_flights.length > 0) {
      console.log("Extracting flights from google_flights best_flights");
      data.best_flights.forEach((flightOption: any) => {
        if (flightOption.price) {
          const cleanPrice = flightOption.price
            .toString()
            .replace(/[^\d]/g, "");
          const priceNum = parseInt(cleanPrice);
          if (priceNum > 0) {
            // Get airline and duration from the nested flights array
            const firstFlight = flightOption.flights && flightOption.flights[0];
            let airline = flightOption.airline || "";
            let duration = "";
            let departure_time = "";
            let arrival_time = "";

            if (firstFlight) {
              airline = firstFlight.airline || airline;
              if (firstFlight.duration) {
                const minutes = firstFlight.duration;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
              }
              if (firstFlight.departure_airport) {
                departure_time = firstFlight.departure_airport.time || "";
              }
              if (firstFlight.arrival_airport) {
                arrival_time = firstFlight.arrival_airport.time || "";
              }
            }

            // Calculate stops from total_duration vs sum of flight durations
            let numStops = 0;
            if (flightOption.flights && flightOption.flights.length > 1) {
              numStops = flightOption.flights.length - 1;
            }

            flights.push({
              price: priceNum,
              airline: airline,
              departure_time: departure_time,
              arrival_time: arrival_time,
              duration: duration,
              stops: numStops,
              isDirect: numStops === 0,
            });
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum;
            }
          }
        }
      });
    }

    // Fallback to other_flights
    if (
      flights.length === 0 &&
      data.other_flights &&
      data.other_flights.length > 0
    ) {
      console.log("Extracting flights from google_flights other_flights");
      data.other_flights.forEach((flightOption: any) => {
        if (flightOption.price) {
          const cleanPrice = flightOption.price
            .toString()
            .replace(/[^\d]/g, "");
          const priceNum = parseInt(cleanPrice);
          if (priceNum > 0) {
            // Get airline and duration from the nested flights array
            const firstFlight = flightOption.flights && flightOption.flights[0];
            let airline = flightOption.airline || "";
            let duration = "";
            let departure_time = "";
            let arrival_time = "";

            if (firstFlight) {
              airline = firstFlight.airline || airline;
              if (firstFlight.duration) {
                const minutes = firstFlight.duration;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
              }
              if (firstFlight.departure_airport) {
                departure_time = firstFlight.departure_airport.time || "";
              }
              if (firstFlight.arrival_airport) {
                arrival_time = firstFlight.arrival_airport.time || "";
              }
            }

            // Calculate stops from total_duration vs sum of flight durations
            let numStops = 0;
            if (flightOption.flights && flightOption.flights.length > 1) {
              numStops = flightOption.flights.length - 1;
            }

            flights.push({
              price: priceNum,
              airline: airline,
              departure_time: departure_time,
              arrival_time: arrival_time,
              duration: duration,
              stops: numStops,
              isDirect: numStops === 0,
            });
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum;
            }
          }
        }
      });
    }

    console.log("Final extracted flights:", flights);
    console.log("Minimum price:", minPrice);

    return Response.json({
      success: flights.length > 0,
      origin,
      destination,
      date,
      price: minPrice,
      flights: flights,
      siteResults,
      organicResults:
        data.organic_results?.map((r: any) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        })) || [],
      message:
        flights.length === 0
          ? "No flight prices found in search results"
          : undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        success: false,
        error: errorMessage,
        message: "Failed to fetch flight data from Brave Search API.",
      },
      { status: 500 },
    );
  }
}
