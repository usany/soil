"""API views.

All endpoints live here in a single app rather than one app per resource.
"""
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .mongo import get_collection


# ---------------------------------------------------------------------------
# Universities
# ---------------------------------------------------------------------------
class UniversitiesView(APIView):
    """Return the list of universities from MongoDB.

    Mirrors the previous Next.js route `/api/universities`.
    """

    def get(self, request):
        try:
            client, collection = get_collection("participations")
        except RuntimeError as exc:
            return Response(
                {"success": False, "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            rows = list(collection.find({}))
            cleaned = []
            for row in rows:
                row.pop("_id", None)
                cleaned.append(row)
        except Exception as exc:  # noqa: BLE001 - surface any Mongo error
            return Response(
                {
                    "success": False,
                    "error": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            client.close()

        return Response(
            {
                "success": True,
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "label": "2026 Fall Exchange Program University List",
                "rows": cleaned,
            }
        )


# ---------------------------------------------------------------------------
# Flights
# ---------------------------------------------------------------------------
DEPARTURE = "ICN"  # Incheon, fixed origin.


def _normalize_airport_code(value: str) -> str | None:
    upper = value.upper()
    if len(upper) == 3:
        return upper
    return None


def _format_date(value: str) -> str:
    # Handle YYYYMMDD (from the frontend form) -> YYYY-MM-DD.
    if len(value) == 8 and "-" not in value:
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value


def _clean_price(value) -> int | None:
    digits = re.sub(r"\D", "", str(value))
    number = int(digits) if digits else 0
    return number if number > 0 else None


def _extract_flight(option: dict) -> dict | None:
    price = _clean_price(option.get("price"))
    if price is None:
        return None

    flights = option.get("flights") or []
    first = flights[0] if flights else {}

    airline = option.get("airline") or first.get("airline") or ""
    duration = ""
    if first.get("duration"):
        minutes = first["duration"]
        hours, mins = divmod(minutes, 60)
        duration = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

    departure_time = (first.get("departure_airport") or {}).get("time", "")
    arrival_time = (first.get("arrival_airport") or {}).get("time", "")

    num_stops = len(flights) - 1 if len(flights) > 1 else 0

    return {
        "price": price,
        "airline": airline,
        "departure_time": departure_time,
        "arrival_time": arrival_time,
        "duration": duration,
        "stops": num_stops,
        "isDirect": num_stops == 0,
    }


class SearchFlightsView(APIView):
    """Look up flight prices via SerpAPI (Google Flights).

    Mirrors the previous Next.js route `/api/search-flights`.
    """

    def post(self, request):
        body = request.data
        destination = _normalize_airport_code(body.get("destination") or "")
        date = body.get("date")

        if not destination or not date:
            return Response(
                {
                    "error": (
                        "Missing destination or date. "
                        "Departure is fixed to ICN (Incheon)"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        api_key = settings.SERPAPI_KEY
        if not api_key:
            return Response(
                {"error": "SERPAPI_KEY environment variable is not set"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = {
            "engine": "google_flights",
            "departure_id": DEPARTURE,
            "arrival_id": destination,
            "outbound_date": _format_date(date),
            "type": 2,
            "currency": "USD",
            "hl": "en",
            "gl": "us",
            "api_key": api_key,
        }
        url = f"https://serpapi.com/search?{urlencode(query)}"

        try:
            response = requests.get(url, timeout=30)
        except requests.RequestException as exc:
            return Response(
                {"success": False, "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not response.ok:
            return Response(
                {
                    "success": False,
                    "error": f"SerpAPI request failed: {response.status_code}",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        data = response.json()

        site_results = []
        if data.get("google_flights_url"):
            site_results.append(
                {"source": "Google Flights", "url": data["google_flights_url"]}
            )

        flights = []
        min_price = None

        # Prefer `best_flights`, fall back to `other_flights`.
        candidates = data.get("best_flights") or data.get("other_flights") or []
        for option in candidates:
            flight = _extract_flight(option)
            if not flight:
                continue
            flights.append(flight)
            if min_price is None or flight["price"] < min_price:
                min_price = flight["price"]

        organic_results = [
            {
                "title": r.get("title"),
                "link": r.get("link"),
                "snippet": r.get("snippet"),
            }
            for r in data.get("organic_results") or []
        ]

        return Response(
            {
                "success": len(flights) > 0,
                "origin": DEPARTURE,
                "destination": destination,
                "date": date,
                "price": min_price,
                "flights": flights,
                "siteResults": site_results,
                "organicResults": organic_results,
                "message": (
                    "No flight prices found in search results"
                    if not flights
                    else None
                ),
            }
        )


# ---------------------------------------------------------------------------
# Big Mac Index
# ---------------------------------------------------------------------------
BIGMAC_DATA_URL = "https://bigmacindex.app/data/countries.json"


class BigMacIndexView(APIView):
    """Big Mac Index with Korea comparison.

    Mirrors the previous Next.js route `/api/bigmac-index`.
    """

    def get(self, request):
        try:
            response = requests.get(BIGMAC_DATA_URL, timeout=30)
        except requests.RequestException as exc:
            return Response(
                {"success": False, "error": f"Failed to fetch Big Mac Index data: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not response.ok:
            return Response(
                {
                    "success": False,
                    "error": f"Big Mac Index request failed: {response.status_code}",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        data = response.json()

        korea = next(
            (
                c
                for c in data
                if c.get("code") == "KOR" or c.get("name") == "South Korea"
            ),
            None,
        )
        korea_price = korea.get("price_usd") if korea else None

        processed = []
        for country in data:
            item = dict(country)
            if korea_price is not None:
                price = country.get("price_usd")
                item["compareToKorea"] = {
                    "price": price,
                    "difference": price - korea_price,
                    "percentDifference": (
                        ((price - korea_price) / korea_price) * 100
                    ),
                    "isExpensive": price > korea_price,
                }
            else:
                item["compareToKorea"] = None
            processed.append(item)

        return Response(
            {
                "success": True,
                "koreaPrice": korea_price,
                "countries": processed,
            }
        )
