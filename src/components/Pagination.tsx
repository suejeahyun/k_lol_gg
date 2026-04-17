import Link from "next/link";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string | number | undefined>;
  pageParamName?: string;
};

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  query = {},
  pageParamName = "page",
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const createHref = (page: number) => {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    });

    params.set(pageParamName, String(page));

    return `${basePath}?${params.toString()}`;
  };

  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "24px", flexWrap: "wrap" }}>
      {currentPage > 1 && <Link href={createHref(currentPage - 1)}>이전</Link>}

      {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
        <Link
          key={page}
          href={createHref(page)}
          style={{
            fontWeight: page === currentPage ? 700 : 400,
            textDecoration: page === currentPage ? "underline" : "none",
          }}
        >
          {page}
        </Link>
      ))}

      {currentPage < totalPages && <Link href={createHref(currentPage + 1)}>다음</Link>}
    </div>
  );
}