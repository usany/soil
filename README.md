# Flight Maps

An interactive web application that displays universities on a world map and provides real-time flight pricing information from South Korea (Seoul/Incheon) to nearby airports.

## Features

- **Interactive World Map**: Browse exchange programs worldwide using an interactive Leaflet-based map
- **University Markers**: Blue markers for exchange programs
- **Airport Information**: Displays nearest airports to each university with distance details
- **Real-Time Flight Pricing**: Click on airport markers to fetch current flight prices from Naver Flight
- **Flight Details**: View flight duration, number of stops/transfers, and direct flight availability

## Tech Stack

- **Frontend**: Next.js 15, React 19, Leaflet (mapping library)
- **Backend**: Next.js API routes, Playwright (browser automation)
- **Web Scraping**: Playwright with Cheerio
- **Database**: PostgreSQL
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm build

# Start production server
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
├── app/
│   ├── layout.js              # Root layout component
│   ├── page.js                # Main map page with interactive features
│   ├── api/
│   │   └── flight-price/
│   │       └── route.js       # Flight price scraping API endpoint
│   └── universities.json      # University data with coordinates
├── next.config.js             # Next.js configuration
├── package.json               # Project dependencies
└── README.md                  # This file
```

## API Endpoints

### GET `/api/flight-price`

Fetches flight pricing information from Naver Flight.

**Query Parameters:**
- `origin` (string, required): Departure airport code (e.g., "SEL" for Seoul)
- `destination` (string, required): Arrival airport code
- `date` (string, required): Travel date in YYYYMMDD format

**Response:**
```json
{
  "success": true,
  "origin": "SEL",
  "destination": "LAX",
  "date": "20240115",
  "price": 1250000,
  "allPrices": [1250000, 1350000, ...],
  "flights": [
    {
      "price": 1250000,
      "duration": "15시간 30분",
      "stops": 1,
      "isDirect": false,
      "rawText": "..."
    }
  ],
  "url": "https://flight.naver.com/..."
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

## University Data

The application uses a `universities.json` file containing university information including:
- University name and location
- Coordinates (latitude/longitude)
- Nearest airport information (name, IATA code, distance)
- Properties like language, test scores, application deadlines, etc.

## How It Works

1. **Map Initialization**: On page load, Leaflet creates an interactive world map centered at (20°, 0°)
2. **University Markers**: All universities from `universities.json` are plotted on the map
3. **Airport Markers**: Unique airports are automatically extracted and displayed
4. **Flight Price Fetching**: When you click an airport marker:
   - The app calculates a date 9 days from today
   - Sends a request to the flight-price API
   - Scrapes Naver Flight website using Playwright
   - Displays results in the airport popup

## Features Explanation

### Flight Information Extraction
The flight-price API extracts multiple pieces of information:
- **Price**: Flight cost in Korean Won (₩)
- **Duration**: Total flight time
- **Stops**: Number of transfers/layovers
- **Direct Flight**: Indicates non-stop flights

### Web Scraping Process
- Uses Playwright to automate browser navigation
- Waits for dynamic content to load
- Parses flight information from page text
- Deduplicates results and returns top 5 flights

## Limitations

- Flight pricing requires web scraping from Naver Flight, which may fail if:
  - The website structure changes
  - Rate limiting is applied
  - JavaScript rendering is blocked
- Currently supports fixed origin (Seoul/SEL)
- Database integration (PostgreSQL) is initialized but not yet utilized

## Development Notes

- The API uses non-headless Chromium for better compatibility
- Includes a 5-second wait after page navigation to ensure dynamic content loads
- Price range validation: 500,000 ₩ - 5,000,000 ₩
- Flight details are extracted from Korean language text patterns

## Future Enhancements

- Database storage for flight price history
- Price tracking and alerts
- Multiple origin airports
- Caching for repeated queries
- Enhanced error handling and fallback data sources
- User preferences and saved locations

## License

ISC

 Airport data: use the free OurAirports CSV (https://davidmegginson.github.io/ourairports-data/airports.csv) — it has iso_country (ISO alpha-2), lat/lon, name, and type. Filter to large/medium/small_airport (~5,800 worldwide).
2. Country matching: your Region values aren't all ISO names (Czech, England, Mainland China, Turkiye, Hong Kong, Macau), so map them to ISO alpha-2 codes (CZ, GB, CN, TR, HK, MO, …).
3. Compute at build time: a script runs for each marker → filters airports to that country → picks the one with minimum haversine distance → stores {name, iata, city, distanceKm} in each row of universities.json.
4. Display: show "Nearest airport: FCO Rome–Fiumicino (2.1 km)" in each popup.