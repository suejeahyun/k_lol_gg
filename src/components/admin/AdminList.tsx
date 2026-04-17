type AdminListProps = {
  title?: string;
  children: React.ReactNode;
};

export default function AdminList({ title, children }: AdminListProps) {
  return (
    <section className="space-y-4">
      {title ? (
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {children}
      </div>
    </section>
  );
}