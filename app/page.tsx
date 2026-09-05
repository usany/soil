"use client"

import React, { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Map as LeafletMap, TileLayer, CircleMarker } from "leaflet"
import universities from "../universities.json"

// ── Type definitions ──────────────────────────────────────────────

interface Airport {
  name: string
  city: string
  iata: string
  icao: string
  lat: number
  lon: number
  distanceKm: number
}

interface UniversityProperties {
  [key: string]: string | undefined
}

interface UniversityRow {
  id: string
  title: string
  url: string
  lat: number
  lon: number
  geocode: string
  properties: UniversityProperties
  content: unknown[]
  nearestAirport: Airport
}

interface UniversityCategory {
  label: string
  generatedAt: string
  rows: UniversityRow[]
}

interface UniversitiesData {
  exchange: UniversityCategory
  study: UniversityCategory
}

interface MarkerData {
  name: string
  marker: CircleMarker
  airport: Airport | null
  language: string
  departments: string
  country: string
}

// ── Helpers ───────────────────────────────────────────────────────

const universitiesData = universities as UniversitiesData

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const DEPARTURE = "SEL"

function naverFlightUrl(origin: string, destination: string, date: string): string {
  // date may arrive as YYYY-MM-DD from the input; Naver expects YYYYMMDD.
  const d = (date || "").replace(/-/g, "")
  return `https://flight.naver.com/flights/international/${origin}:city-${destination}:airport-${d}?adult=1&isDirect=false&fareType=Y`
}

function popupHtml(row: UniversityRow, lang: string): string {
  const p = row.properties || {}
  const parts: string[] = [`<b style="font-size:15px">${esc(row.title)}</b>`]
  const a = row.nearestAirport
  if (a) {
    const code = a.iata || a.icao || ""
    const today = new Date().toISOString().split("T")[0]!
    const suffix = `${code || a.lat}-${a.lon}`
    parts.push(
      `<div style="margin-top:4px;font-size:12px;color:#0f766e">✈ ${esc(a.name)}` +
      (code ? ` (${esc(code)})` : "") +
      ` &middot; ${a.distanceKm} km</div>` +
      `<form id="show-airport-form-${suffix}" style="margin-top:6px;display:flex;gap:6px;align-items:center">` +
      `<input type="date" id="airport-date-${suffix}" value="${today}" style="padding:4px 6px;font-size:12px;border:1px solid #ccc;border-radius:3px">` +
      `<button type="submit" style="padding:4px 8px;background:#0f766e;color:white;border:none;border-radius:3px;cursor:pointer;font-size:12px">${lang === "ko" ? "티켓 검색" : "Search ticket"}</button>` +
      `</form>` +
      `<div style="margin-top:3px;font-size:10px;color:#888">↗ ${lang === "ko" ? "네이버 항공권 사이트가 새 탭에서 열립니다" : "Opens Naver Flights in a new tab"}</div>`
    )
  }
  const add = (k: string, label: string) => {
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
  const links: string[] = []
  if (p.Website) links.push(`<a href="${esc(p.Website)}" target="_blank" rel="noreferrer">Website</a>`)
  if (p.Factsheet) links.push(`<a href="${esc(p.Factsheet)}" target="_blank" rel="noreferrer">Factsheet</a>`)
  if (links.length) parts.push(`<div style="margin-top:6px">${links.join(" &middot; ")}</div>`)
  return parts.join("")
}

// ── Home Content Component ────────────────────────────────────────

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<MarkerData[]>([])
  const tileLayerRef = useRef<TileLayer | null>(null)
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

  const t = (ko: string, en: string) => (lang === "ko" ? ko : en)
  const searchLabels: Record<string, string> = {
    name: t("이름으로 검색", "Search by Name"),
    language: t("언어로 검색", "Search by Language"),
    country: t("국가로 검색", "Search by Country"),
    departments: t("학과로 검색", "Search by Departments"),
  }
  const searchPlaceholders: Record<string, string> = {
    name: t("대학교 이름 검색...", "Search university name..."),
    language: t("언어 검색...", "Search language..."),
    departments: t("학과 검색...", "Search departments..."),
    country: t("국가 검색...", "Search country..."),
  }

  const updateUrl = (newText: string, newType: string) => {
    const params = new URLSearchParams()
    if (newText) params.set("search", newText)
    if (newType !== "name") params.set("type", newType)
    router.push(`?${params.toString()}`)
  }

  const filterMarkers = (text: string, type: string) => {
    const searchTerm = text.toLowerCase()
    const map = mapInstanceRef.current
    if (!map) return
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
        markerData.marker.addTo(map)
      } else {
        map.removeLayer(markerData.marker)
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

    let L: typeof import("leaflet")
    let cleanup = false

    import("leaflet").then((leaflet) => {
      if (cleanup) return
      L = leaflet.default
      import("leaflet/dist/leaflet.css")

      const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1024
      const defaultZoom = Math.max(2, Math.ceil(Math.log2(screenWidth / 256)))

      const map = L.map(mapRef.current!).setView([20, 0], 2)

      tileLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const addMarkers = (rows: UniversityRow[], color: string) => {
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

          const properties = row.properties || {}
          markersRef.current.push({
            name: row.title,
            marker,
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
                  const dateInput = document.getElementById(dateId) as HTMLInputElement | null
                  const selectedDate = dateInput ? dateInput.value.replace(/-/g, "") : ""
                  if (code) {
                    window.open(naverFlightUrl(DEPARTURE, code, selectedDate), "_blank", "noopener,noreferrer")
                  }
                })
              }
            }
          })
        })
      }

      addMarkers(universitiesData.exchange.rows, "#3b82f6")
      addMarkers(universitiesData.study.rows, "#10b981")

      mapInstanceRef.current = map

      requestAnimationFrame(() => {
        map.invalidateSize()
      })
    })

    return () => {
      cleanup = true
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