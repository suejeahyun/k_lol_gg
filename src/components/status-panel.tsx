import { Sparkles } from "@/components/theme/theme-icons";

export function StatusPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="status-panel" aria-labelledby="status-title">
      <span className="status-panel__mark" aria-hidden="true">
        <Sparkles />
      </span>
      {eyebrow ? <p className="status-panel__eyebrow">{eyebrow}</p> : null}
      <h1 id="status-title">{title}</h1>
      {description ? <p className="status-panel__description">{description}</p> : null}
      {children ? <div className="status-panel__actions">{children}</div> : null}
    </section>
  );
}
