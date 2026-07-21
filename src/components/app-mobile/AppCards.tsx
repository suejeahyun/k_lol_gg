import Link from "next/link";

export function AppSection({
  title,
  caption,
  captionHref,
  children,
}: {
  title: string;
  caption?: string;
  captionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="klol-app-section">
      <div className="klol-app-section-head">
        <h2>{title}</h2>
        {caption ? (
          captionHref ? <Link href={captionHref}>{caption}</Link> : <p>{caption}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function AppMenuCard({
  href,
  title,
  description,
  caption,
}: {
  href: string;
  title: string;
  description?: string;
  caption?: string;
}) {
  return (
    <Link className="klol-app-card" href={href}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {caption ? <small>{caption}</small> : null}
    </Link>
  );
}

export function AppEmpty({ children }: { children: React.ReactNode }) {
  return <div className="klol-app-empty">{children}</div>;
}
