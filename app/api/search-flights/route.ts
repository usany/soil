import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const { origin, destination, date } = await request.json()

  if (!origin || !destination) {
    return NextResponse.json({ error: "Missing origin or destination" }, { status: 400 })
  }

  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!braveApiKey) {
    console.error("BRAVE_SEARCH_API_KEY not set")
    return NextResponse.json({ error: "Search API not configured" }, { status: 500 })
  }

  try {
    const query = `flights from ${origin} to ${destination} ${date ? `on ${date}` : ""}`

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": braveApiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.statusText}`)
    }

    const data = await response.json()

    console.log("Brave Search API Response:", data)

    return NextResponse.json({
      query,
      results: data.web || [],
      totalResults: (data.query as Record<string, unknown> | undefined)?.count || 0,
      rawData: data
    })
  } catch (error) {
    console.error("Error with Brave Search:", error)
    return NextResponse.json({ error: "Flight search failed" }, { status: 500 })
  }
}
