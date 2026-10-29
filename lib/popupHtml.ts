import { esc } from "@/lib/helpers";
import { getBigMacComparison } from "@/lib/bigMac";

const SEASON_ORDER: Record<string, number> = {
  spring: 0,
  summer: 1,
  fall: 2,
  winter: 3,
};

function formatSemester(key: string): string {
  const m = key.match(/^(\d{2})(spring|summer|fall|winter)$/i);
  if (m) {
    const year = Number(m[1]);
    const season = m[2].toLowerCase();
    const seasonLabel =
      season === "spring"
        ? "Spring"
        : season === "summer"
          ? "Summer"
          : season === "fall"
            ? "Fall"
            : "Winter";
    return `20${year} ${seasonLabel}`;
  }
  return key;
}

function sortSemesters(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = a.match(/^(\d{2})(spring|summer|fall|winter)$/i);
    const pb = b.match(/^(\d{2})(spring|summer|fall|winter)$/i);
    if (pa && pb) {
      const ya = Number(pa[1]);
      const yb = Number(pb[1]);
      if (ya !== yb) return ya - yb;
      return (
        (SEASON_ORDER[pa[2].toLowerCase()] ?? 0) -
        (SEASON_ORDER[pb[2].toLowerCase()] ?? 0)
      );
    }
    return a.localeCompare(b);
  });
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

  const semesters = Array.isArray(row.semesters) ? row.semesters : [];
  if (semesters.length > 0) {
    const chips = sortSemesters(semesters)
      .map(
        (s) =>
          `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;font-size:11px;font-weight:600;line-height:1.5;border-radius:999px;color:#0f766e;background:rgba(15,118,110,0.12);border:1px solid rgba(15,118,110,0.35)">${esc(formatSemester(s))}</span>`,
      )
      .join("");
    parts.push(
      `<div style="margin-top:6px;font-size:12px"><b>${lang === "ko" ? "교환 프로그램 학기" : "Exchange program semesters"}:</b><div style="margin-top:2px">${chips}</div></div>`,
    );
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
