export default function RandomBackgroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-background-root">
      <div className="app-background-overlay" />
      <div className="app-background-content">{children}</div>
    </div>
  );
}
