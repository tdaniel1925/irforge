// Standalone layout for embeddable widgets — no app sidebar/nav, transparent so
// it drops cleanly into any client's IR page via <iframe>.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="embed-root">{children}</div>;
}
