import type { ReactElement } from "react";
import { t, type Locale } from "../i18n";
import type { UserDoc } from "../userdocs";
import { LanguageSwitch } from "./LanguageSwitch";

export function DocsScreen({
  docs,
  locale,
  onBack,
  onLocaleChange,
  onSelectDoc,
  selectedDoc,
}: {
  docs: UserDoc[];
  locale: Locale;
  onBack: () => void;
  onLocaleChange: (locale: Locale) => void;
  onSelectDoc: (docId: string) => void;
  selectedDoc: UserDoc;
}) {
  return (
    <main className="shell docs-shell">
      <section className="docs-frame">
        <header className="docs-header">
          <div>
            <strong>{t(locale, "docs.title")}</strong>
            <span>{t(locale, "docs.subtitle")}</span>
          </div>
          <div className="docs-actions">
            <LanguageSwitch locale={locale} onChange={onLocaleChange} />
            <button className="ghost-button" onClick={onBack} type="button">
              {t(locale, "docs.back")}
            </button>
          </div>
        </header>
        <div className="docs-body">
          <nav className="docs-nav" aria-label={t(locale, "docs.nav")}>
            {docs.map((doc) => (
              <button
                className={doc.id === selectedDoc.id ? "active" : ""}
                key={doc.id}
                onClick={() => onSelectDoc(doc.id)}
                type="button"
              >
                {doc.title[locale]}
              </button>
            ))}
          </nav>
          <article className="docs-article">
            <MarkdownArticle markdown={selectedDoc.markdown[locale]} />
          </article>
        </div>
      </section>
    </main>
  );
}

function MarkdownArticle({ markdown }: { markdown: string }) {
  const elements: ReactElement[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    const key = `list-${elements.length}`;
    elements.push(
      <ul key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{item}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  function flushParagraph() {
    if (paragraph.length === 0) return;
    elements.push(<p key={`p-${elements.length}`}>{paragraph.join(" ")}</p>);
    paragraph = [];
  }

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      flushParagraph();
      elements.push(<h3 key={`h3-${elements.length}`}>{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushParagraph();
      elements.push(<h2 key={`h2-${elements.length}`}>{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushParagraph();
      elements.push(<h1 key={`h1-${elements.length}`}>{line.slice(2)}</h1>);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <>{elements}</>;
}
