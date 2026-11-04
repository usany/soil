import { NEXT_PUBLIC_API_URL } from "@/lib/api";

export async function getFlightPrice(
  origin: string,
  destination: string,
  date: string,
) {
  try {
    const url = `${NEXT_PUBLIC_API_URL}/api/flights/search/`;
    const body = {
      destination: destination,
      date: date,
    };
    console.log("Fetching flight prices from:", url, body);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    console.log("Flight price response:", data);
    return data;
  } catch (error) {
    console.error("Error fetching flight price:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return { error: errorMessage };
  }
}
