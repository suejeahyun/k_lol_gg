"use client";

import Link from "next/link";

type PaginationProps =
  | {
      currentPage: number;
      totalPages: number;
      onPageChange: (page: number) => void;
      basePath?: never;
      query?: never;
    }
  | {
      currentPage: number;
      totalPages: number;
      basePath: string;
      query?: Record<string, string | undefined>;
      onPageChange?: never;
    };

const VISIBLE_PAGE_COUNT = 10;

function buildHref(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>
) {
  const params = new URLSearchParams();

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === "string" && value.trim()) {
        params.set(key, value);
      }
    });
  }

  params.set("page", String(page));

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= VISIBLE_PAGE_COUNT) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(VISIBLE_PAGE_COUNT / 2);

  let startPage = currentPage - half;
  let endPage = startPage + VISIBLE_PAGE_COUNT - 1;

  if (startPage < 1) {
    startPage = 1;
    endPage = VISIBLE_PAGE_COUNT;
  }

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = totalPages - VISIBLE_PAGE_COUNT + 1;
  }

  return Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index
  );
}

export default function Pagination(props: PaginationProps) {
  const { currentPage, totalPages } = props;

  if (totalPages <= 1) {
    return null;
  }

  const pages = getVisiblePages(currentPage, totalPages);
  const firstVisiblePage = pages[0];
  const lastVisiblePage = pages[pages.length - 1];

  const isCallbackMode = "onPageChange" in props && !!props.onPageChange;

  const handlePageChange = (page: number) => {
    if (isCallbackMode) {
      props.onPageChange(page);
    }
  };

  const renderPageButton = (page: number, label?: string) => {
    const text = label ?? String(page);

    if (isCallbackMode) {
      return (
        <button
          key={`${text}-${page}`}
          type="button"
          onClick={() => handlePageChange(page)}
          className="chip-button"
          style={{
            fontWeight: page === currentPage ? 700 : 400,
            textDecoration: page === currentPage ? "underline" : "none",
          }}
        >
          {text}
        </button>
      );
    }

    return (
      <Link
        key={`${text}-${page}`}
        href={buildHref(props.basePath, page, props.query)}
        className="chip-button"
        style={{
          fontWeight: page === currentPage ? 700 : 400,
          textDecoration: page === currentPage ? "underline" : "none",
        }}
      >
        {text}
      </Link>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        marginTop: "24px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {currentPage > 1 ? (
        renderPageButton(currentPage - 1, "이전")
      ) : (
        <button type="button" disabled className="chip-button">
          이전
        </button>
      )}

      {firstVisiblePage > 1 && <span>...</span>}

      {pages.map((page) => renderPageButton(page))}

      {lastVisiblePage < totalPages && <span>...</span>}

      {currentPage < totalPages ? (
        renderPageButton(currentPage + 1, "다음")
      ) : (
        <button type="button" disabled className="chip-button">
          다음
        </button>
      )}
    </div>
  );
}