"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import universities from "../universities.json";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DEPARTURE = "SEL";

function getBigMacComparison(row: any, bigMacData: any, lang: string, isDark: boolean = false): string {
  if (!bigMacData || !bigMacData.countries) return "";

  // Map regional names to Big Mac Index country names
  const regionToCountry: { [key: string]: string } = {
    england: "Britain",
    scotland: "Britain",
    wales: "Britain",
    "northern ireland": "Britain",
    // Eurozone countries (use Euro area as proxy since individual data not available)
    germany: "Euro area",
    deutschland: "Euro area",
    austria: "Euro area",
    belgium: "Euro area",
    cyprus: "Euro area",
    estonia: "Euro area",
    finland: "Euro area",
    france: "Euro area",
    greece: "Euro area",
    ireland: "Euro area",
    italy: "Euro area",
    latvia: "Euro area",
    lithuania: "Euro area",
    luxembourg: "Euro area",
    malta: "Euro area",
    netherlands: "Euro area",
    portugal: "Euro area",
    slovakia: "Euro area",
    slovenia: "Euro area",
    spain: "Euro area",
    turkiye: "Turkey",
  };

  // Try to find country by coordinates or name
  let regionName = (row.properties?.Region || row.title || "").toLowerCase();
  if (regionToCountry[regionName]) {
    regionName = regionToCountry[regionName].toLowerCase();
  }

  const country = bigMacData.countries.find((c: any) => {
    const bigMacCountryName = c.name.toLowerCase();
    return (
      regionName.includes(bigMacCountryName) ||
      bigMacCountryName.includes(regionName) ||
      regionName === bigMacCountryName ||
      (regionName.includes("korea") && c.iso2 === "KOR")
    );
  });

  if (!country || !country.compareToKorea) return "";

  const { price: selectedPrice } = country.compareToKorea;
  const koreaPrice = bigMacData.koreaPrice;

  // Find max price for scaling bars
  const maxPrice = Math.max(selectedPrice || 0, koreaPrice || 0);
  const barScale = maxPrice > 0 ? 100 / maxPrice : 100;

  const koreaBarWidth = koreaPrice * barScale;
  const selectedBarWidth = selectedPrice * barScale;

  // Calculate percentage difference compared to Korea
  const percentDiff = koreaPrice ? ((selectedPrice - koreaPrice) / koreaPrice) * 100 : 0;
  const percentSign = percentDiff > 0 ? "+" : "";
  const percentColor = percentDiff > 0 ? "#ef4444" : "#059669";

  const colors = isDark ? {
    bg: "#1f2937",
    border: "#374151",
    text: "#f3f4f6",
    textSecondary: "#d1d5db",
    label: "#e5e7eb",
    barBg: "#374151",
  } : {
    bg: "#f9fafb",
    border: "#e5e7eb",
    text: "#1f2937",
    textSecondary: "#4b5563",
    label: "#666",
    barBg: "#e5e7eb",
  };

  return `<div style="margin-top:8px;padding:10px;background:${colors.bg};border-radius:6px;border:1px solid ${colors.border}">
    <div style="font-size:13px;font-weight:700;color:${colors.text};margin-bottom:8px">🍔 Big Mac Index</div>
    <div style="display:flex;gap:16px;font-size:12px;color:${colors.textSecondary};align-items:flex-end;justify-content:center">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="margin-bottom:4px;font-weight:600;color:${colors.label}">Korea</div>
        <div style="width:20px;height:100px;background:${colors.barBg};border-radius:4px;overflow:hidden;margin-bottom:2px;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:100%;height:${Math.min(koreaBarWidth, 100)}%;background:#3b82f6;transition:height 0.3s"></div>
        </div>
        <div style="font-size:11px;color:${colors.textSecondary}">$${koreaPrice?.toFixed(2) || "N/A"}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="margin-bottom:4px;font-weight:600;color:${colors.label}">${esc(country.name)}</div>
        <div style="width:20px;height:100px;background:${colors.barBg};border-radius:4px;overflow:hidden;margin-bottom:2px;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:100%;height:${Math.min(selectedBarWidth, 100)}%;background:#10b981;transition:height 0.3s"></div>
        </div>
        <div style="font-size:11px;color:${colors.textSecondary}">$${selectedPrice?.toFixed(2) || "N/A"}</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:2px">
        <div style="font-size:12px;font-weight:600;color:${percentColor}">${percentSign}${percentDiff.toFixed(1)}%</div>
      </div>
    </div>
  </div>`;
}

function popupHtml(row: any, lang: string, bigMacData?: any, isDark: boolean = false): string {
  const p = row.properties || {};
  const parts = [`<b style="font-size:15px">${esc(row.title)}</b>`];
  const a = row.nearestAirport;
  if (a) {
    const code = a.iata || a.icao || "";
    const today = new Date().toISOString().split("T")[0];
    const suffix = `${code || a.lat}-${a.lon}`;
    let airportHtml =
      `<div style="margin-top:4px;font-size:12px;color:#0f766e">✈ ${esc(a.name)}` +
      (code ? ` (${esc(code)})` : "") +
      ` &middot; ${a.distanceKm} km</div>` +
      `<form id="show-airport-form-${suffix}" style="margin-top:6px;display:flex;gap:6px;align-items:center">` +
      `<input type="date" id="airport-date-${suffix}" value="${today}" style="padding:4px 6px;font-size:12px;border:1px solid #ccc;border-radius:3px">` +
      `<button type="submit" style="padding:4px 8px;background:#0f766e;color:white;border:none;border-radius:3px;cursor:pointer;font-size:12px">${lang === "ko" ? "티켓 검색" : "Search ticket"}</button>` +
      `</form>`;

    // Add Big Mac Index right after search ticket button
    if (bigMacData) {
      const bigMacHtml = getBigMacComparison(row, bigMacData, lang, isDark);
      if (bigMacHtml) airportHtml += bigMacHtml;
    }

    parts.push(airportHtml);
  }
  const add = (k: string, label: string) => {
    const v = p[k];
    if (v && String(v).trim())
      parts.push(
        `<div style="margin-top:4px"><b>${label}:</b> ${esc(v)}</div>`,
      );
  };
  if (p.Region)
    parts.push(`<div style="margin-top:2px;color:#555">${esc(p.Region)}</div>`);
  add("Language(수학언어)", "Language");
  add("Features", "Test scores");
  add("Slots(모집인원)", "Slots");
  add("Slots (모집인원)", "Slots");
  add("Departments", "Departments");
  add("Application Due", "Application due");
  add("Nomination due", "Nomination due");
  add("Semester dates", "Semester dates");

  const links = [];
  if (p.Website)
    links.push(
      `<a href="${esc(p.Website)}" target="_blank" rel="noreferrer">Website</a>`,
    );
  if (p.Factsheet)
    links.push(
      `<a href="${esc(p.Factsheet)}" target="_blank" rel="noreferrer">Factsheet</a>`,
    );
  if (links.length)
    parts.push(`<div style="margin-top:6px">${links.join(" &middot; ")}</div>`);
  return parts.join("");
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const shownAirportsRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);
  const [searchType, setSearchType] = useState(
    () => searchParams.get("type") || "name",
  );
  const [searchText, setSearchText] = useState(
    () => searchParams.get("search") || "",
  );
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });
  const [lang, setLang] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("lang") || "en" : "en",
  );
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const darkRef = useRef(dark);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);
  const [bigMacData, setBigMacData] = useState(null);
  const bigMacDataRef = useRef(null);

  const t = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const searchLabels: { [key: string]: string } = {
    name: t("이름으로 검색", "Search by Name"),
    language: t("언어로 검색", "Search by Language"),
    country: t("국가로 검색", "Search by Country"),
    departments: t("학과로 검색", "Search by Departments"),
  };
  const searchPlaceholders: { [key: string]: string } = {
    name: t("대학교 이름 검색...", "Search university name..."),
    language: t("언어 검색...", "Search language..."),
    departments: t("학과 검색...", "Search departments..."),
    country: t("국가 검색...", "Search country..."),
  };

  const updateUrl = (newText: string, newType: string) => {
    const params = new URLSearchParams();
    if (newText) params.set("search", newText);
    if (newType !== "name") params.set("type", newType);
    router.push(`?${params.toString()}`);
  };

  const filterMarkers = (text: string, type: string) => {
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
        // Hide associated airport marker when location marker is hidden
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

            // Reset button state
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    const tile = tileLayerRef.current;
    if (tile) {
      const element = (tile as any)._container;
      if (element) {
        if (dark) {
          element.style.filter = "invert(0.93) hue-rotate(180deg)";
        } else {
          element.style.filter = "none";
        }
      }
    }
  }, [dark]);

  useEffect(() => {
    if (mapInstanceRef.current && markersRef.current.length > 0) {
      filterMarkers(searchText, searchType);
    }
  }, [searchText, searchType]);

  useEffect(() => {
    const fetchBigMacData = async () => {
      try {
        const response = await fetch("/api/bigmac-index");
        const data = await response.json();
        if (data.success) {
          setBigMacData(data);
          bigMacDataRef.current = data;
        }
      } catch (error) {
        console.error("Error fetching Big Mac Index:", error);
      }
    };
    fetchBigMacData();
  }, []);

  // Update marker popups when Big Mac data becomes available
  useEffect(() => {
    console.log(
      "Big Mac data updated:",
      !!bigMacData,
      "Markers count:",
      markersRef.current.length,
    );
    if (!bigMacData || markersRef.current.length === 0) return;

    console.log("Updating markers with Big Mac data");
    markersRef.current.forEach((markerData) => {
      if (markerData.marker && markerData.row) {
        const html = popupHtml(markerData.row, langRef.current, bigMacData, dark);
        markerData.marker.setPopupContent(html);
      }
    });
  }, [bigMacData, dark]);

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    import("leaflet").then(({ default: L }) => {
      import("leaflet/dist/leaflet.css");

      // Choose a default zoom so the world map fills the screen width.
      // World width at zoom z is 256 * 2^z px, so require that >= screen width.
      const screenWidth =
        typeof window !== "undefined" ? window.innerWidth : 1024;
      const defaultZoom = Math.max(2, Math.ceil(Math.log2(screenWidth / 256)));

      const map = L.map(mapRef.current as HTMLElement, {
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 1.0,
        worldCopyJump: false,
      }).setView([20, 0], defaultZoom);

      tileLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          noWrap: true,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      ).addTo(map);

      const seoulLat = 37.46;
      const seoulLon = 126.4;

      const drawArc = (
        map: any,
        fromLat: number,
        fromLon: number,
        toLat: number,
        toLon: number,
      ) => {
        return L.polyline(
          [
            [fromLat, fromLon],
            [toLat, toLon],
          ],
          { color: "#f59e0b", weight: 2.5, opacity: 0.8, dashArray: "5, 5" },
        ).addTo(map);
      };

      const toggleAirportMarker = (
        airport: any,
        button: HTMLElement,
        dateStr: string | null = null,
        departure: string = DEPARTURE,
      ) => {
        const code = airport.iata || airport.icao;
        const key = code || `${airport.lat},${airport.lon}`;

        if (shownAirportsRef.current.has(key)) {
          const marker = shownAirportsRef.current.get(key);
          map.removeLayer(marker);
          shownAirportsRef.current.delete(key);

          const arc = shownAirportsRef.current.get(`${key}-arc`);
          if (arc) {
            map.removeLayer(arc);
            shownAirportsRef.current.delete(`${key}-arc`);
          }

          button.textContent = "Search ticket";
          button.style.background = "#0f766e";
          return;
        }

        const marker = L.marker([airport.lat, airport.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:10px;height:10px;background:#f59e0b;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 2px rgba(0,0,0,.5)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
          .bindPopup(
            `<b style="font-size:14px">✈ ${esc(airport.name)}</b>` +
              `<div style="margin-top:2px;color:#555">${esc(airport.city)}${code ? " &middot; " + esc(code) : ""}</div>` +
              `<div id="flight-price-${code}" style="margin-top:8px;font-size:12px;color:#666"></div>`,
          )
          .addTo(map);

        const arc = drawArc(map, seoulLat, seoulLon, airport.lat, airport.lon);

        shownAirportsRef.current.set(key, marker);
        shownAirportsRef.current.set(`${key}-date`, dateStr);
        shownAirportsRef.current.set(`${key}-departure`, departure);
        shownAirportsRef.current.set(`${key}-arc`, arc);
        button.textContent = "Hide from map";
        button.style.background = "#d97706";

        marker.on("popupopen", async () => {
          if (!code) return;
          const priceDiv = document.getElementById(`flight-price-${code}`);
          if (!priceDiv) return;

          const loadPrice = async (origin: string) => {
            priceDiv.innerHTML = `<div style="color:#999">${langRef.current === "ko" ? "가격 불러오는 중..." : "Loading prices..."}</div>`;
            let finalDateStr = dateStr;
            if (!finalDateStr) {
              const today = new Date();
              const futureDate = new Date(
                today.getTime() + 9 * 24 * 60 * 60 * 1000,
              );
              finalDateStr = futureDate
                .toISOString()
                .split("T")[0]
                .replace(/-/g, "");
            }

            const flightData = await getFlightPrice(origin, code, finalDateStr);
            console.log("Flight response for", code, ":", flightData);

            let html = "";
            let priceFound = false;

            // Try to get price from flights array first
            if (
              flightData &&
              flightData.flights &&
              Array.isArray(flightData.flights) &&
              flightData.flights.length > 0
            ) {
              const flight = flightData.flights[0];
              if (
                flight &&
                typeof flight.price === "number" &&
                flight.price > 0
              ) {
                const priceStr = flight.price.toLocaleString();
                html = `<div style="margin-top:4px;font-size:13px;color:#059669"><b>₩${priceStr}</b></div>`;
                priceFound = true;

                // Show airline if available (more prominent)
                if (flight.airline) {
                  html += `<div style="margin-top:3px;font-size:12px;font-weight:500;color:#333">${esc(flight.airline)}</div>`;
                }

                // Show departure and arrival times
                if (flight.departure_time && flight.arrival_time) {
                  const depTime =
                    flight.departure_time.split(" ")[1] ||
                    flight.departure_time;
                  const arrTime =
                    flight.arrival_time.split(" ")[1] || flight.arrival_time;
                  html += `<div style="margin-top:2px;font-size:11px;color:#555">${esc(depTime)} → ${esc(arrTime)}</div>`;
                }

                if (
                  flight.duration ||
                  flight.stops !== null ||
                  flight.isDirect
                ) {
                  html += `<div style="margin-top:2px;font-size:11px;color:#666">`;

                  if (flight.isDirect) {
                    html += lang === "ko" ? `직항` : `Direct`;
                  } else if (flight.stops !== null && flight.stops > 0) {
                    html +=
                      lang === "ko"
                        ? `${flight.stops}회 경유`
                        : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
                  }

                  if (flight.duration) {
                    const hasPreviousInfo =
                      flight.isDirect ||
                      (flight.stops !== null && flight.stops > 0);
                    html += hasPreviousInfo ? ` · ` : ``;
                    html += esc(flight.duration);
                  }

                  html += `</div>`;
                }
              }
            }

            // Fallback to main price from API if flights extraction failed
            if (
              !priceFound &&
              flightData &&
              typeof flightData.price === "number" &&
              flightData.price > 0
            ) {
              const priceStr = flightData.price.toLocaleString();
              html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`;
              priceFound = true;
            }

            // Show unavailable if no price found
            if (!priceFound) {
              html = `<div style="margin-top:4px;font-size:11px;color:#999">${t("가격을 확인할 수 없습니다. 다른 출발 날짜나 공항을 시도해 보세요.", "Price unavailable. Try a different departure date or airport.")}</div>`;
            }

            priceDiv.innerHTML = html;
          };
          loadPrice(departure);
        });

        marker.on("popupclose", () => {
          // Hide airport marker when its popup is closed
          const markerKey = code || `${airport.lat},${airport.lon}`;
          if (shownAirportsRef.current.has(markerKey)) {
            const airportMarker = shownAirportsRef.current.get(markerKey);
            map.removeLayer(airportMarker);
            shownAirportsRef.current.delete(markerKey);

            const arc = shownAirportsRef.current.get(`${markerKey}-arc`);
            if (arc) {
              map.removeLayer(arc);
              shownAirportsRef.current.delete(`${markerKey}-arc`);
            }

            // Update button state in location marker popup
            const formId = `show-airport-form-${markerKey}`;
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
        });

        marker.openPopup();
      };

      const getFlightPrice = async (
        origin: string,
        destination: string,
        date: string,
      ) => {
        try {
          const url = `/api/search-flights`;
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
      };

      const addMarkers = (rows: any[], color: string) => {
        rows.forEach((row) => {
          if (row.lat == null || row.lon == null) return;
          const marker = L.circleMarker([row.lat, row.lon], {
            radius: 5,
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          })
            .bindPopup("")
            .addTo(map);

          // Track marker for filtering
          const properties = row.properties || {};
          markersRef.current.push({
            name: row.title,
            marker: marker,
            airport: row.nearestAirport,
            language:
              properties["Language(수학언어)"] || properties.Language || "",
            departments: properties.Departments || "",
            country: properties.Region || "",
            row: row,
          });

          marker.on("popupopen", () => {
            // Update popup content with current Big Mac data when opened
            marker.setPopupContent(
              popupHtml(row, langRef.current, bigMacDataRef.current, darkRef.current),
            );

            if (row.nearestAirport) {
              const code = row.nearestAirport.iata || row.nearestAirport.icao;
              const suffix = `${code || row.nearestAirport.lat}-${row.nearestAirport.lon}`;
              const formId = `show-airport-form-${suffix}`;
              const dateId = `airport-date-${suffix}`;
              const form = document.getElementById(formId);
              if (form && !form.dataset.attached) {
                form.dataset.attached = "true";
                form.addEventListener("submit", (e) => {
                  e.preventDefault();
                  const dateInput = document.getElementById(
                    dateId,
                  ) as HTMLInputElement;
                  const selectedDate = dateInput.value.replace(/-/g, "");
                  const submitBtn = form.querySelector(
                    "button[type='submit']",
                  ) as HTMLElement;
                  toggleAirportMarker(
                    row.nearestAirport,
                    submitBtn,
                    selectedDate,
                  );
                });
              }
            }
          });
        });
      };

      addMarkers(universities.exchange.rows, "#3b82f6");
      addMarkers(universities.study.rows, "#10b981");

      mapInstanceRef.current = map;

      // Ensure the map fills the container width once it's laid out
      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          padding: "10px",
          alignItems: "center",
          boxSizing: "border-box",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <select
          value={searchType}
          onChange={(e) => {
            setSearchType(e.target.value);
            filterMarkers(searchText, e.target.value);
            updateUrl(searchText, e.target.value);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            zIndex: 1000,
          }}
        >
          <option value="name">{searchLabels.name}</option>
          <option value="language">{searchLabels.language}</option>
          <option value="country">{searchLabels.country}</option>
          <option value="departments">{searchLabels.departments}</option>
        </select>
        <input
          type="text"
          placeholder={searchPlaceholders[searchType]}
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            filterMarkers(e.target.value, searchType);
            updateUrl(e.target.value, searchType);
          }}
          style={{
            flex: "1 1 160px",
            minWidth: "0",
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            boxSizing: "border-box",
            zIndex: 1000,
          }}
        />
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "transparent",
            fontSize: "16px",
            cursor: "pointer",
            lineHeight: 1,
            zIndex: 1000,
          }}
        >
          {dark ? "🌙" : "☀️"}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = lang === "ko" ? "en" : "ko";
            setLang(next);
            localStorage.setItem("lang", next);
          }}
          aria-label={t("언어 전환 (영어)", "Switch language (Korean)")}
          title={t("언어 전환 (영어)", "Switch language (Korean)")}
          className="lang-toggle"
          style={{
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "transparent",
            fontSize: "13px",
            fontWeight: "bold",
            cursor: "pointer",
            lineHeight: 1,
            zIndex: 1000,
          }}
        >
          {t("KO", "EN")}
        </button>
      </div>
      <div
        ref={mapRef}
        style={{ flex: 1, width: "100%", height: "100%", minHeight: 0 }}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
