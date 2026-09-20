import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function useSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchType, setSearchType] = useState(
    () => searchParams.get("type") || "name",
  );
  const [searchText, setSearchText] = useState(
    () => searchParams.get("search") || "",
  );

  const updateUrl = (newText: string, newType: string) => {
    const params = new URLSearchParams();
    if (newText) params.set("search", newText);
    if (newType !== "name") params.set("type", newType);
    router.push(`?${params.toString()}`);
  };

  const filterMarkers = (
    text: string,
    type: string,
    markersRef: React.MutableRefObject<any[]>,
    mapInstanceRef: React.MutableRefObject<any>,
    shownAirportsRef: React.MutableRefObject<Map<string, any>>,
  ) => {
    const searchTerm = text.toLowerCase();
    markersRef.current.forEach((markerData) => {
      let matches = false;

      if (type === "name") {
        matches = markerData.name.toLowerCase().includes(searchTerm);
      } else if (type === "language") {
        const languages = markerData.language
          ? markerData.language.toLowerCase()
          : "";
        matches = languages.includes(searchTerm);
      } else if (type === "departments") {
        const departments = markerData.departments
          ? markerData.departments.toLowerCase()
          : "";
        matches = departments.includes(searchTerm);
      } else if (type === "country") {
        const country = markerData.country
          ? markerData.country.toLowerCase()
          : "";
        matches = country.includes(searchTerm);
      }

      if (matches || searchTerm === "") {
        markerData.marker.addTo(mapInstanceRef.current);
      } else {
        mapInstanceRef.current.removeLayer(markerData.marker);
        if (markerData.airport) {
          const airportKey =
            markerData.airport.iata ||
            markerData.airport.icao ||
            `${markerData.airport.lat},${markerData.airport.lon}`;
          if (
            shownAirportsRef.current &&
            shownAirportsRef.current.has(airportKey)
          ) {
            const airportMarker = shownAirportsRef.current.get(airportKey);
            mapInstanceRef.current.removeLayer(airportMarker);
            shownAirportsRef.current.delete(airportKey);

            const formId = `show-airport-form-${airportKey}`;
            const form = document.getElementById(formId);
            if (form) {
              const btn = form.querySelector(
                "button[type='submit']",
              ) as HTMLElement;
              if (btn) {
                btn.textContent = "Search ticket";
                (btn as HTMLElement).style.background = "#0f766e";
              }
            }
          }
        }
      }
    });
  };

  return {
    searchType,
    setSearchType,
    searchText,
    setSearchText,
    updateUrl,
    filterMarkers,
  };
}
