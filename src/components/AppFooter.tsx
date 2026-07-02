import { formatSessionId } from "../formatting";
import { t, type Locale } from "../i18n";
import { APP_COMMIT, APP_VERSION, SAVE_SCHEMA_VERSION } from "../save";

interface AppFooterProps {
  locale: Locale;
  sessionId: string;
}

export function AppFooter({ locale, sessionId }: AppFooterProps) {
  return (
    <footer className="app-footer" aria-label={t(locale, "footer.label")}>
      <span>{t(locale, "footer.version", { value: APP_VERSION })}</span>
      <span>{t(locale, "footer.commit", { value: APP_COMMIT })}</span>
      <span>{t(locale, "footer.schema", { value: SAVE_SCHEMA_VERSION })}</span>
      <span title={sessionId}>{t(locale, "footer.session", { value: formatSessionId(sessionId) })}</span>
    </footer>
  );
}
