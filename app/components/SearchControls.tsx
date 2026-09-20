interface SearchControlsProps {
  searchType: string;
  searchText: string;
  dark: boolean;
  lang: string;
  searchLabels: { [key: string]: string };
  searchPlaceholders: { [key: string]: string };
  onSearchTypeChange: (value: string) => void;
  onSearchTextChange: (value: string) => void;
  onThemeToggle: () => void;
  onLanguageToggle: () => void;
}

export function SearchControls({
  searchType,
  searchText,
  dark,
  lang,
  searchLabels,
  searchPlaceholders,
  onSearchTypeChange,
  onSearchTextChange,
  onThemeToggle,
  onLanguageToggle,
}: SearchControlsProps) {
  const t = (ko: string, en: string) => (lang === "ko" ? ko : en);

  return (
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
        onChange={(e) => onSearchTypeChange(e.target.value)}
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
        onChange={(e) => onSearchTextChange(e.target.value)}
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
        onClick={onThemeToggle}
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
        onClick={onLanguageToggle}
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
  );
}
