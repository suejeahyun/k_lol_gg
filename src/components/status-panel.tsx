export function StatusPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="status-panel" aria-labelledby="status-title">
      <span className="status-panel__mark" aria-hidden="true">
        ✦
      </span>
      <p className="status-panel__eyebrow">{eyebrow}</p>
      <h1 id="status-title">{title}</h1>
      <p className="status-panel__description">{description}</p>
      {children ? <div className="status-panel__actions">{children}</div> : null}
    </section>
  );
}
