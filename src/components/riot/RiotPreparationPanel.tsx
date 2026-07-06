import Link from "next/link";
import styles from "@/styles/riot-prep.module.css";
import { getRiotFeatureStatus } from "@/lib/riot/feature";

type RiotPreparationPanelProps = {
  eyebrow?: string;
  title: string;
  description: string;
  sections?: Array<{
    title: string;
    items: string[];
  }>;
  actions?: Array<{
    href: string;
    label: string;
    variant?: "primary" | "secondary";
  }>;
};

export default function RiotPreparationPanel({
  eyebrow = "RIOT PRODUCTION PREP",
  title,
  description,
  sections = [],
  actions = [],
}: RiotPreparationPanelProps) {
  const status = getRiotFeatureStatus();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>

        <div className={status.enabled ? styles.statusEnabled : styles.statusDisabled}>
          <span>{status.enabled ? "활성" : "비활성"}</span>
          <strong>{status.message}</strong>
        </div>
      </section>

      {sections.length > 0 ? (
        <section className={styles.grid}>
          {sections.map((section) => (
            <article key={section.title} className={styles.card}>
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}

      {actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={action.variant === "primary" ? styles.primaryAction : styles.secondaryAction}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </main>
  );
}
