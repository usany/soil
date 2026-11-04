import styles from "./SearchControls.module.css";

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
    <div className={styles.controls}>
      <select
        value={searchType}
        onChange={(e) => onSearchTypeChange(e.target.value)}
        className={styles.select}
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
        className={styles.input}
      />

      <button
        type="button"
        onClick={onThemeToggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
        className={styles.button}
      >
        {dark ? "🌙" : "☀️"}
      </button>

      <button
        type="button"
        onClick={onLanguageToggle}
        aria-label={t("언어 전환 (영어)", "Switch language (Korean)")}
        title={t("언어 전환 (영어)", "Switch language (Korean)")}
        className={styles.langToggle}
      >
        {t("KO", "EN")}
      </button>
    </div>
  );
}
