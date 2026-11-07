import { useEffect, useRef, useState } from "react";
import { popupHtml } from "@/lib/popupHtml";
import { getFlightPrice } from "@/lib/flights";
import { esc } from "@/lib/helpers";

const DEPARTURE = "SEL";

export function useMapInitialization(
  mapRef: React.RefObject<HTMLDivElement | null>,
  universities: any,
  dark: boolean,
  lang: string,
  bigMacData: any,
) {
  const mapInstanceRef = useRef<any>(null);
  const addMarkersRef = useRef<((rows: any[]) => void) | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<any[]>([]);
  const shownAirportsRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);
  const langRef = useRef(lang);
  const darkRef = useRef(dark);
  const bigMacDataRef = useRef(bigMacData);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  const openDialog = (html: string) => {
    if (typeof document === "undefined") return;
    if (!dialogRef.current) {
      const dialog = document.createElement("dialog");
      dialog.className = "marker-dialog";
      const content = document.createElement("div");
      content.className = "marker-dialog-content";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "marker-dialog-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "\u00d7";
      closeBtn.addEventListener("click", () => dialog.close());
      dialog.appendChild(closeBtn);
      dialog.appendChild(content);
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
      });
      document.body.appendChild(dialog);
      dialogRef.current = dialog;
      dialogContentRef.current = content;
    }
    dialogContentRef.current!.innerHTML = html;
    if (!dialogRef.current!.open) dialogRef.current!.showModal();
  };

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  useEffect(() => {
    bigMacDataRef.current = bigMacData;
  }, [bigMacData]);

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
    if (mapInstanceRef.current || !mapRef.current) return;

    import("leaflet").then(({ default: L }) => {
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
        }).addTo(map);

        const arc = drawArc(map, seoulLat, seoulLon, airport.lat, airport.lon);

        shownAirportsRef.current.set(key, marker);
        shownAirportsRef.current.set(`${key}-date`, dateStr);
        shownAirportsRef.current.set(`${key}-departure`, departure);
        shownAirportsRef.current.set(`${key}-arc`, arc);
        button.textContent = "Hide from map";
        button.style.background = "#d97706";

        marker.on("click", () => {
          if (!code) return;
          const loadPrice = async (origin: string) => {
            const loadingHtml = `<div style="color:#999">${langRef.current === "ko" ? "가격 불러오는 중..." : "Loading prices..."}</div>`;
            openDialog(
              `<b style="font-size:14px">✈ ${esc(airport.name)}</b>` +
                `<div style="margin-top:2px;color:#555">${esc(airport.city)}${code ? " &middot; " + esc(code) : ""}</div>` +
                `<div id="flight-price-${code}" style="margin-top:8px;font-size:12px;color:#666">${loadingHtml}</div>`,
            );
            const priceDiv = document.getElementById(`flight-price-${code}`);
            if (!priceDiv) return;

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

                if (flight.airline) {
                  html += `<div style="margin-top:3px;font-size:12px;font-weight:500;color:#333">${esc(flight.airline)}</div>`;
                }

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
                    html += langRef.current === "ko" ? `직항` : `Direct`;
                  } else if (flight.stops !== null && flight.stops > 0) {
                    html +=
                      langRef.current === "ko"
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

            if (!priceFound) {
              html = `<div style="margin-top:4px;font-size:11px;color:#999">${langRef.current === "ko" ? "가격을 확인할 수 없습니다. 다른 출발 날짜나 공항을 시도해 보세요." : "Price unavailable. Try a different departure date or airport."}</div>`;
            }

            priceDiv.innerHTML = html;
          };
          loadPrice(departure);
        });
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
          }).addTo(map);

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

          marker.on("click", () => {
            openDialog(
              popupHtml(
                row,
                langRef.current,
                bigMacDataRef.current,
              ),
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

      addMarkersRef.current = (rows: any[]) => addMarkers(rows, "#3b82f6");

      mapInstanceRef.current = map;
      setMapReady(true);

      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      addMarkersRef.current = null;
    };
  }, []);

  // Add markers when universities data becomes available.
  useEffect(() => {
    if (!mapReady || !universities || !addMarkersRef.current) return;
    addMarkersRef.current(universities);
  }, [mapReady, universities]);

  return {
    mapInstanceRef,
    markersRef,
    shownAirportsRef,
    tileLayerRef,
  };
}
