import { LOCALE_LABELS, t, type Locale } from "../i18n";

export function LanguageSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="language-switch" aria-label={t(locale, "header.language")}>
      {(["en", "ru"] as Locale[]).map((candidate) => (
        <button
          className={candidate === locale ? "active" : ""}
          key={candidate}
          onClick={() => onChange(candidate)}
          type="button"
        >
          {LOCALE_LABELS[candidate]}
        </button>
      ))}
    </div>
  );
}
