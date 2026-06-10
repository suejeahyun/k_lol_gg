import Link from "next/link";

export function AppSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="klol-app-section">
      <div className="klol-app-section-head">
        <h2>{title}</h2>
        {caption ? <p>{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AppMenuCard({
  href,
  title,
  description,
  caption = "열기",
}: {
  href: string;
  title: string;
  description: string;
  caption?: string;
}) {
  return (
    <Link className="klol-app-card" href={href}>
      <strong>{title}</strong>
      <span>{description}</span>
      <small>{caption}</small>
    </Link>
  );
}

export function AppEmpty({ children }: { children: React.ReactNode }) {
  return <div className="klol-app-empty">{children}</div>;
}
