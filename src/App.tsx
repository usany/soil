import React, { useEffect, useRef, useState } from "react";
import { useSearch } from "@/hooks/useSearch";
import { useMapInitialization } from "@/hooks/useMapInitialization";
import { SearchControls } from "@/components/SearchControls";
import { API_URL } from "@/lib/api";

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [bigMacData, setBigMacData] = useState(null);
  const [universities, setUniversities] = useState<any>(null);

  const { searchType, setSearchType, searchText, setSearchText, updateUrl, filterMarkers } = useSearch();
  const { mapInstanceRef, markersRef, shownAirportsRef } = useMapInitialization(
    mapRef,
    universities,
    dark,
    lang,
    bigMacData,
  );

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

  useEffect(() => {
    mapInstanceRef.current?.invalidateSize();
  }, [drawerOpen]);

  useEffect(() => {
    if (mapInstanceRef.current && markersRef.current.length > 0) {
      filterMarkers(searchText, searchType, markersRef, mapInstanceRef, shownAirportsRef);
    }
  }, [searchText, searchType]);

  useEffect(() => {
    const fetchUniversities = async () => {
      try {
        const response = await fetch(`${API_URL}/api/universities/`);
        const data = await response.json();
        if (data.success) {
          setUniversities(data.rows);
        }
      } catch (error) {
        console.error("Error fetching universities:", error);
      }
    };
    fetchUniversities();
  }, []);

  useEffect(() => {
    const fetchBigMacData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/bigmac/index/`);
        const data = await response.json();
        if (data.success) {
          setBigMacData(data);
        }
      } catch (error) {
        console.error("Error fetching Big Mac Index:", error);
      }
    };
    fetchBigMacData();
  }, []);

  return (
    <div className="app-container">
      <div id="drawer-content" hidden={!drawerOpen}>
        <h1 className="page-title">
          {t("교환 대학교 지도", "Exchange Universities Map")}
        </h1>
        <SearchControls
          searchType={searchType}
          searchText={searchText}
          dark={dark}
          lang={lang}
          searchLabels={searchLabels}
          searchPlaceholders={searchPlaceholders}
          onSearchTypeChange={(value) => {
            setSearchType(value);
            filterMarkers(searchText, value, markersRef, mapInstanceRef, shownAirportsRef);
            updateUrl(searchText, value);
          }}
          onSearchTextChange={(value) => {
            setSearchText(value);
            filterMarkers(value, searchType, markersRef, mapInstanceRef, shownAirportsRef);
            updateUrl(value, searchType);
          }}
          onThemeToggle={() => setDark((d) => !d)}
          onLanguageToggle={() => {
            const next = lang === "ko" ? "en" : "ko";
            setLang(next);
            localStorage.setItem("lang", next);
          }}
        />
      </div>
      <div className="map-wrapper">
        <button
          type="button"
          className="drawer-toggle"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-expanded={drawerOpen}
          aria-controls="drawer-content"
          aria-label={drawerOpen ? t("패널 닫기", "Hide panel") : t("패널 열기", "Show panel")}
          title={drawerOpen ? t("패널 닫기", "Hide panel") : t("패널 열기", "Show panel")}
        >
          {drawerOpen ? "▴" : "▾"}
        </button>
        <div
          ref={mapRef}
          className="map-container"
        />
      </div>
    </div>
  );
}
