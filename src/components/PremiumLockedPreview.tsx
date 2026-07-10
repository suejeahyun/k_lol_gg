type PremiumLockedPreviewProps = {
  eyebrow?: string;
  title: string;
  description: string;
  items?: Array<{ label: string; value: string }>;
};

export default function PremiumLockedPreview({
  eyebrow = "PREMIUM FEATURE",
  title,
  description,
  items = [
    { label: "상태", value: "잠금" },
    { label: "설정", value: "슈퍼어드민" },
    { label: "적용", value: "방별" },
  ],
}: PremiumLockedPreviewProps) {
  return (
    <main className="page-container">
      <section className="page-header">
        <div>
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
        </div>
      </section>

      <section className="card">
        <div className="site-settings-flow">
          <div>
            <span>기능 안내</span>
            <strong>{description}</strong>
          </div>
        </div>
        <div className="site-settings-grid">
          {items.map((item) => (
            <div className="site-settings-state-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
