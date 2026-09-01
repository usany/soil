import { chromium } from "playwright"
import { NextRequest } from "next/server"

interface Flight {
  price: number | null
  duration: string | null
  stops: number | null
  isDirect: boolean
  airline: string | null
  text?: string
}

interface FlightData {
  prices: number[]
  flights: Flight[]
  pageLength: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = searchParams.get("origin")
  const destination = searchParams.get("destination")
  const date = searchParams.get("date")

  if (!origin || !destination || !date) {
    return Response.json({ error: "Missing origin, destination, or date" }, { status: 400 })
  }

  let browser = null
  try {
    const url = `https://flight.naver.com/flights/international/${origin}:city-${destination}:airport-${date}?adult=1&isDirect=false&fareType=Y`

    browser = await chromium.launch({
      headless: false,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    })

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()

    console.log(`Navigating to: ${url}`)
    await page.goto(url, { waitUntil: "load", timeout: 40000 })

    await page.waitForFunction(
      () => document.body.innerText.includes("최저가"),
      { timeout: 30000 }
    )

    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      bodyLength: document.body.innerText.length,
      html: document.body.innerHTML.substring(0, 2000),
      text: document.body.innerText.substring(0, 2000),
    }))

    console.log("Page info:", {
      title: pageInfo.title,
      bodyLength: pageInfo.bodyLength,
    })

    const flightData: FlightData = await page.evaluate((dest: string) => {
      const flights: Flight[] = []
      const allDivs = Array.from(document.querySelectorAll("div, li"))

      allDivs.forEach((element) => {
        const text = element.textContent || ""
        if (!(text.includes("시간") || text.includes("분"))) return
        if (!(text.includes("직항") || text.includes("경유"))) return
        if (text.length > 2000) return

        if (dest && dest.length > 0) {
          const hasDestination = text.includes(dest.toUpperCase()) || text.includes(dest)
          if (!hasDestination) return
        }

        const hasLowestPrice = text.includes("최저가")
        if (!hasLowestPrice) return

        const priceMatches = text.match(/(\d{1,3}(?:,\d{3})+|\d{5,})/g) || []
        let price: number | null = null

        for (let i = priceMatches.length - 1; i >= 0; i--) {
          const priceStr = priceMatches[i]!.replace(/,/g, "")
          const priceNum = parseInt(priceStr)
          if (priceNum >= 100000 && priceNum <= 9999999) {
            price = priceNum
            break
          }
        }

        if (!price) return

        let airline: string | null = null
        const lines = text.split('\n').map(l => l.trim())

        const airlinePatterns = [
          /아시아나항공/i,
          /대한항공/i,
          /진에어/i,
          /에어부산/i,
          /제주항공/i,
          /에어서울/i,
          /이스타항공/i,
          /델타|Delta/i,
          /아메리칸|American/i,
          /유나이티드|United/i,
          /루프트한자|Lufthansa/i,
          /에미레이트|Emirates/i,
          /카타르|Qatar/i,
          /싱가포르|Singapore/i,
          /KE|Korean Air/i,
          /OZ|Asiana/i,
          /([가-힣]+항공)/,
        ]

        for (const line of lines) {
          for (const pattern of airlinePatterns) {
            const match = line.match(pattern)
            if (match) {
              airline = match[1] || match[0]
              break
            }
          }
          if (airline) break
        }

        const durationMatch = text.match(/(\d+)\s*시간\s*(\d+)\s*분/)
        const duration = durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null

        let stops: number | null = null
        let isDirect = false

        const stopsPatterns = [
          /(\d+)\s*회\s*경유/,
          /(\d+)회경유/,
          /경유\s*(\d+)\s*회/,
          /경유\s*(\d+)/,
          /(\d+)\s*경유/,
        ]

        for (const pattern of stopsPatterns) {
          const match = text.match(pattern)
          if (match) {
            stops = parseInt(match[1]!)
            break
          }
        }

        if (stops === null && text.includes("경유")) {
          stops = 1
        }

        if (text.includes("직항")) {
          isDirect = true
          stops = 0
        }

        if (price) {
          flights.push({
            price,
            duration,
            stops,
            isDirect,
            airline,
            text: text.substring(0, 300),
          })
        }
      })

      flights.sort((a, b) => a.price! - b.price!)
      const bestFlights = flights.slice(0, 10)

      console.log("Flight data extracted:", {
        destination: dest,
        totalFlights: flights.length,
        allFlights: flights.map((f) => ({ price: f.price, airline: f.airline, duration: f.duration, stops: f.stops })),
        bestFlights: bestFlights.map((f) => ({ price: f.price, airline: f.airline, duration: f.duration, stops: f.stops })),
        priceRange: flights.length > 0 ? { min: flights[0].price, max: flights[flights.length - 1].price } : null,
      })

      return {
        prices: bestFlights.map((f) => f.price).filter((p): p is number => p !== null),
        flights: bestFlights,
        pageLength: document.body.innerText.length,
      }
    }, destination)

    await browser.close()

    let mainPrice: number | null = null
    if (flightData.flights && flightData.flights.length > 0) {
      mainPrice = flightData.flights[0].price
    } else if (flightData.prices && flightData.prices.length > 0) {
      mainPrice = flightData.prices[0]!
    }

    return Response.json({
      success: true,
      origin,
      destination,
      date,
      price: mainPrice,
      allPrices: flightData.prices?.slice(0, 10) || [],
      flights: flightData.flights || [],
      url,
    })
  } catch (error) {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error scraping:", message)
    return Response.json(
      {
        success: false,
        error: message,
        message:
          "Naver Flight appears to be blocking automated access. Manual API key signup or alternative flight data source required.",
      },
      { status: 500 }
    )
  }
}