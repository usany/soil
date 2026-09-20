import { esc } from "@/lib/helpers";

export function getBigMacComparison(
  row: any,
  bigMacData: any,
  lang: string,
  isDark: boolean = false,
): string {
  if (!bigMacData || !bigMacData.countries) return "";

  const regionToCountry: { [key: string]: string } = {
    england: "Britain",
    scotland: "Britain",
    wales: "Britain",
    "northern ireland": "Britain",
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

  const maxPrice = Math.max(selectedPrice || 0, koreaPrice || 0);
  const barScale = maxPrice > 0 ? 100 / maxPrice : 100;

  const koreaBarWidth = koreaPrice * barScale;
  const selectedBarWidth = selectedPrice * barScale;

  const percentDiff = koreaPrice
    ? ((selectedPrice - koreaPrice) / koreaPrice) * 100
    : 0;
  const percentSign = percentDiff > 0 ? "+" : "";
  const percentColor = percentDiff > 0 ? "#ef4444" : "#059669";

  const colors = isDark
    ? {
        bg: "#1f2937",
        border: "#374151",
        text: "#f3f4f6",
        textSecondary: "#d1d5db",
        label: "#e5e7eb",
        barBg: "#374151",
      }
    : {
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
