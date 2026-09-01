"use client"

import React, { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import universities from "../universities.json"

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const DEPARTURE = "SEL"

function popupHtml(row, lang) {
  const p = row.properties || {}
  const parts = [`<b style="font-size:15px">${esc(row.title)}</b>`]
  const a = row.nearestAirport
  if (a) {
    const code = a.iata || a.icao || ""
    const today = new Date().toISOString().split("T")[0]
    const suffix = `${code || a.lat}-${a.lon}`
    parts.push(
      `<div style="margin-top:4px;font-size:12px;color:#0f766e">✈ ${esc(a.name)}` +
      (code ? ` (${esc(code)})` : "") +
      ` &middot; ${a.distanceKm} km</div>` +
      `<form id="show-airport-form-${suffix}" style="margin-top:6px;display:flex;gap:6px;align-items:center">` +
      `<input type="date" id="airport-date-${suffix}" value="${today}" style="padding:4px 6px;font-size:12px;border:1px solid #ccc;border-radius:3px">` +
      `<button type="submit" style="padding:4px 8px;background:#0f766e;color:white;border:none;border-radius:3px;cursor:pointer;font-size:12px">${lang === "ko" ? "티켓 검색" : "Search ticket"}</button>` +
      `</form>`
    )
  }
  const add = (k, label) => {
    const v = p[k]
    if (v && String(v).trim()) parts.push(`<div style="margin-top:4px"><b>${label}:</b> ${esc(v)}</div>`)
  }
  if (p.Region) parts.push(`<div style="margin-top:2px;color:#555">${esc(p.Region)}</div>`)
  add("Language(수학언어)", "Language")
  add("Features", "Test scores")
  add("Slots(모집인원)", "Slots")
  add("Slots (모집인원)", "Slots")
  add("Departments", "Departments")
  add("Application Due", "Application due")
  add("Nomination due", "Nomination due")
  add("Semester dates", "Semester dates")
  const links = []
  if (p.Website) links.push(`<a href="${esc(p.Website)}" target="_blank" rel="noreferrer">Website</a>`)
  if (p.Factsheet) links.push(`<a href="${esc(p.Factsheet)}" target="_blank" rel="noreferrer">Factsheet</a>`)
  if (links.length) parts.push(`<div style="margin-top:6px">${links.join(" &middot; ")}</div>`)
  return parts.join("")
}

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const shownAirportsRef = useRef(new Map())
  const tileLayerRef = useRef(null)
  const [searchType, setSearchType] = useState(() => searchParams.get("type") || "name")
  const [searchText, setSearchText] = useState(() => searchParams.get("search") || "")
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = localStorage.getItem("theme")
    if (stored) return stored === "dark"
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  const [lang, setLang] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("lang") || "en" : "en"))
  const langRef = useRef(lang)
  useEffect(() => {
    langRef.current = lang
  }, [lang])

  const t = (ko, en) => (lang === "ko" ? ko : en)
  const searchLabels = {
    name: t("이름으로 검색", "Search by Name"),
    language: t("언어로 검색", "Search by Language"),
    country: t("국가로 검색", "Search by Country"),
    departments: t("학과로 검색", "Search by Departments"),
  }
  const searchPlaceholders = {
    name: t("대학교 이름 검색...", "Search university name..."),
    language: t("언어 검색...", "Search language..."),
    departments: t("학과 검색...", "Search departments..."),
    country: t("국가 검색...", "Search country..."),
  }

  const updateUrl = (newText, newType) => {
    const params = new URLSearchParams()
    if (newText) params.set("search", newText)
    if (newType !== "name") params.set("type", newType)
    router.push(`?${params.toString()}`, { shallow: false })
  }

  const filterMarkers = (text, type) => {
    const searchTerm = text.toLowerCase()
    markersRef.current.forEach((markerData) => {
      let matches = false

      if (type === "name") {
        matches = markerData.name.toLowerCase().includes(searchTerm)
      } else if (type === "language") {
        const languages = markerData.language ? markerData.language.toLowerCase() : ""
        matches = languages.includes(searchTerm)
      } else if (type === "departments") {
        const departments = markerData.departments ? markerData.departments.toLowerCase() : ""
        matches = departments.includes(searchTerm)
      } else if (type === "country") {
        const country = markerData.country ? markerData.country.toLowerCase() : ""
        matches = country.includes(searchTerm)
      }

      if (matches || searchTerm === "") {
        markerData.marker.addTo(mapInstanceRef.current)
      } else {
        mapInstanceRef.current.removeLayer(markerData.marker)
        // Hide associated airport marker when location marker is hidden
        if (markerData.airport) {
          const airportKey = markerData.airport.iata || markerData.airport.icao || `${markerData.airport.lat},${markerData.airport.lon}`
          if (shownAirportsRef.current && shownAirportsRef.current.has(airportKey)) {
            const airportMarker = shownAirportsRef.current.get(airportKey)
            mapInstanceRef.current.removeLayer(airportMarker)
            shownAirportsRef.current.delete(airportKey)

            // Reset button state
            const formId = `show-airport-form-${airportKey}`
            const form = document.getElementById(formId)
            if (form) {
              const btn = form.querySelector("button[type='submit']")
              if (btn) {
                btn.textContent = "Search ticket"
                btn.style.background = "#0f766e"
              }
            }
          }
        }
      }
    })
  }

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
    const tile = tileLayerRef.current
    if (tile) {
      tile.setUrl(
        dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      )
    }
  }, [dark])

  useEffect(() => {
    if (mapInstanceRef.current && markersRef.current.length > 0) {
      filterMarkers(searchText, searchType)
    }
  }, [searchText, searchType])

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    import("leaflet").then(({ default: L }) => {
      import("leaflet/dist/leaflet.css")

      // Choose a default zoom so the world map fills the screen width.
      // World width at zoom z is 256 * 2^z px, so require that >= screen width.
      const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1024
      const defaultZoom = Math.max(2, Math.ceil(Math.log2(screenWidth / 256)))

      const map = L.map(mapRef.current).setView([20, 0], 2)
      // const map = L.map(mapRef.current, {
      //   maxBounds: [[-85, -180], [85, 180]],
      //   maxBoundsViscosity: 1.0,
      //   worldCopyJump: false,
      // }).setView([20, 0], defaultZoom)

      tileLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // noWrap: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const seoulLat = 37.46
      const seoulLon = 126.4

      const drawArc = (map, fromLat, fromLon, toLat, toLon) => {
        return L.polyline([[fromLat, fromLon], [toLat, toLon]], { color: "#f59e0b", weight: 2.5, opacity: 0.8, dashArray: "5, 5" }).addTo(map)
      }

      const toggleAirportMarker = (airport, button, dateStr = null, departure = DEPARTURE) => {
        const code = airport.iata || airport.icao
        const key = code || `${airport.lat},${airport.lon}`

        if (shownAirportsRef.current.has(key)) {
          const marker = shownAirportsRef.current.get(key)
          map.removeLayer(marker)
          shownAirportsRef.current.delete(key)

          const arc = shownAirportsRef.current.get(`${key}-arc`)
          if (arc) {
            map.removeLayer(arc)
            shownAirportsRef.current.delete(`${key}-arc`)
          }

          button.textContent = "Search ticket"
          button.style.background = "#0f766e"
          return
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
            `<div id="flight-price-${code}" style="margin-top:8px;font-size:12px;color:#666"></div>`
          )
          .addTo(map)

        const arc = drawArc(map, seoulLat, seoulLon, airport.lat, airport.lon)

        shownAirportsRef.current.set(key, marker)
        shownAirportsRef.current.set(`${key}-date`, dateStr)
        shownAirportsRef.current.set(`${key}-departure`, departure)
        shownAirportsRef.current.set(`${key}-arc`, arc)
        button.textContent = "Hide from map"
        button.style.background = "#d97706"

        marker.on("popupopen", async () => {
          if (!code) return
          const priceDiv = document.getElementById(`flight-price-${code}`)
          if (!priceDiv) return

          const loadPrice = async (origin) => {
            priceDiv.innerHTML = `<div style="color:#999">${langRef.current === "ko" ? "가격 불러오는 중..." : "Loading prices..."}</div>`
            let finalDateStr = dateStr
            if (!finalDateStr) {
              const today = new Date()
              const futureDate = new Date(today.getTime() + 9 * 24 * 60 * 60 * 1000)
              finalDateStr = futureDate.toISOString().split("T")[0].replace(/-/g, "")
            }

            const flightData = await getFlightPrice(origin, code, finalDateStr)
            console.log("Flight response for", code, ":", flightData)

            let html = ""
            let priceFound = false

            // Try to get price from flights array first
            if (flightData && flightData.flights && flightData.flights.length > 0) {
              const flight = flightData.flights[0]
              if (flight.price) {
                const priceStr = flight.price.toLocaleString()
                html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`
                priceFound = true

                // Show airline if available
                if (flight.airline) {
                  html += `<div style="margin-top:2px;font-size:11px;color:#555">${flight.airline}</div>`
                }

                if (flight.duration || flight.stops !== null || flight.isDirect) {
                  html += `<div style="margin-top:3px;font-size:10px;color:#666">`

                  if (flight.isDirect) {
                    html += `직항`
                  } else if (flight.stops !== null && flight.stops > 0) {
                    html += `${flight.stops}회 경유`
                  }

                  if (flight.duration) {
                    const hasPreviousInfo = flight.isDirect || (flight.stops !== null && flight.stops > 0)
                    html += hasPreviousInfo ? ` · ` : ``
                    html += flight.duration
                  }

                  html += `</div>`
                }
              }
            }

            // Fallback to main price from API if flights extraction failed
            if (!priceFound && flightData && flightData.price) {
              const priceStr = flightData.price.toLocaleString()
              html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`
              priceFound = true
            }

            // Show unavailable if no price found
            if (!priceFound) {
              html = `<div style="margin-top:4px;font-size:11px;color:#999">${t("가격을 확인할 수 없습니다. 다른 출발 날짜나 공항을 시도해 보세요.", "Price unavailable. Try a different departure date or airport.")}</div>`
            }

            priceDiv.innerHTML = html
          }
          loadPrice(departure)
        })

        marker.on("popupclose", () => {
          // Hide airport marker when its popup is closed
          const markerKey = code || `${airport.lat},${airport.lon}`
          if (shownAirportsRef.current.has(markerKey)) {
            const airportMarker = shownAirportsRef.current.get(markerKey)
            map.removeLayer(airportMarker)
            shownAirportsRef.current.delete(markerKey)

            const arc = shownAirportsRef.current.get(`${markerKey}-arc`)
            if (arc) {
              map.removeLayer(arc)
              shownAirportsRef.current.delete(`${markerKey}-arc`)
            }

            // Update button state in location marker popup
            const formId = `show-airport-form-${markerKey}`
            const form = document.getElementById(formId)
            if (form) {
              const btn = form.querySelector("button[type='submit']")
              if (btn) {
                btn.textContent = "Search ticket"
                btn.style.background = "#0f766e"
              }
            }
          }
        })

        marker.openPopup()
      }

      const getFlightPrice = async (origin, destination, date) => {
        try {
          const url = `/api/flight-price?origin=${origin}&destination=${destination}&date=${date}`
          console.log("Fetching flight prices from:", url)
          const response = await fetch(url)
          const data = await response.json()
          console.log("Flight price response:", data)
          return data
        } catch (error) {
          console.error("Error fetching flight price:", error)
          return { error: error.message }
        }
      }

      const addMarkers = (rows, color) => {
        rows.forEach((row) => {
          if (row.lat == null || row.lon == null) return
          const marker = L.circleMarker([row.lat, row.lon], {
            radius: 5,
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          })
            .bindPopup(popupHtml(row, langRef.current))
            .addTo(map)

          // Track marker for filtering
          const properties = row.properties || {}
          markersRef.current.push({
            name: row.title,
            marker: marker,
            airport: row.nearestAirport,
            language: properties["Language(수학언어)"] || properties.Language || "",
            departments: properties.Departments || "",
            country: properties.Region || "",
          })

          marker.on("popupopen", () => {
            if (row.nearestAirport) {
              const code = row.nearestAirport.iata || row.nearestAirport.icao
              const suffix = `${code || row.nearestAirport.lat}-${row.nearestAirport.lon}`
              const formId = `show-airport-form-${suffix}`
              const dateId = `airport-date-${suffix}`
              const form = document.getElementById(formId)
              if (form && !form.dataset.attached) {
                form.dataset.attached = "true"
                form.addEventListener("submit", (e) => {
                  e.preventDefault()
                  const dateInput = document.getElementById(dateId)
                  const selectedDate = dateInput.value.replace(/-/g, "")
                  const submitBtn = form.querySelector("button[type='submit']")
                  toggleAirportMarker(row.nearestAirport, submitBtn, selectedDate)
                })
              }
            }
          })
        })
      }

      addMarkers(universities.exchange.rows, "#3b82f6")
      addMarkers(universities.study.rows, "#10b981")

      mapInstanceRef.current = map

      // Ensure the map fills the container width once it's laid out
      requestAnimationFrame(() => {
        map.invalidateSize()
      })
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
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
            setSearchType(e.target.value)
            filterMarkers(searchText, e.target.value)
            updateUrl(searchText, e.target.value)
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
            setSearchText(e.target.value)
            filterMarkers(e.target.value, searchType)
            updateUrl(e.target.value, searchType)
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
            const next = lang === "ko" ? "en" : "ko"
            setLang(next)
            localStorage.setItem("lang", next)
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
      <div ref={mapRef} style={{ flex: 1, width: "100%", height: "100%", minHeight: 0 }} />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}
