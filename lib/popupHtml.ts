import { esc } from "@/lib/helpers";
import { getBigMacComparison } from "@/lib/bigMac";

import listUrls from "@/scripts/list-urls.json";

// Every semester we have a Notion list for, e.g. "23spring", "23fall", ...
const ALL_SEMESTERS = Object.keys(listUrls);

// "26fall" -> "2026 Fall"
function formatSemester(s: string): string {
  const m = /^(\d{2})(spring|fall)$/i.exec(s);
  if (!m) return s;
  return `20${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}`;
}

// Timeline of all semesters, grouped by year, with offered ones filled in.
function semesterTimeline(semesters: string[], isDark: boolean): string {
  const offered = new Set(semesters);
  const c = isDark
    ? { bg: "#1f2937", border: "#374151", text: "#f3f4f6", label: "#d1d5db", empty: "#374151" }
    : { bg: "#f9fafb", border: "#e5e7eb", text: "#1f2937", label: "#4b5563", empty: "#e5e7eb" };

  const years = new Map<string, string[]>();
  for (const s of ALL_SEMESTERS) {
    const year = s.slice(0, 2);
    years.set(year, [...(years.get(year) || []), s]);
  }

  const cols = [...years].map(([year, list]) => {
    const cells = list
      .map((s) => {
        const on = offered.has(s);
        const term = /spring/i.test(s) ? "S" : "F";
        return `<div title="${esc(formatSemester(s))}${on ? "" : " (not offered)"}" style="width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:${on ? "#0f766e" : c.empty};color:${on ? "#fff" : c.label}">${term}</div>`;
      })
      .join("");
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="display:flex;gap:3px">${cells}</div><div style="font-size:10px;color:${c.label}">20${year}</div></div>`;
  });

  return `<div style="margin-top:8px;padding:10px;background:${c.bg};border-radius:6px;border:1px solid ${c.border}">
    <div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:8px">📅 Semesters <span style="font-weight:400;font-size:11px;color:${c.label}">(${offered.size}/${ALL_SEMESTERS.length})</span></div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${cols.join("")}</div>
  </div>`;
}

export function popupHtml(
  row: any,
  lang: string,
  bigMacData?: any,
  isDark: boolean = false,
): string {
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

    if (bigMacData) {
      const bigMacHtml = getBigMacComparison(row, bigMacData, lang, isDark);
      if (bigMacHtml) airportHtml += bigMacHtml;
    }

    parts.push(airportHtml);
  }

  if (row.semesters?.length)
    parts.push(semesterTimeline(row.semesters, isDark));

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
