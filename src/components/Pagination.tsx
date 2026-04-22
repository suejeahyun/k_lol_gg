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
      query?: Record<string, string>;
      onPageChange?: never;
    };

function buildHref(
  basePath: string,
  page: number,
  query?: Record<string, string>
) {
  const params = new URLSearchParams();

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value?.trim()) {
        params.set(key, value);
      }
    });
  }

  params.set("page", String(page));

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export default function Pagination(props: PaginationProps) {
  const { currentPage, totalPages } = props;

  if (totalPages <= 1) {
    return null;
  }

  const pages: number[] = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  for (let page = startPage; page <= endPage; page += 1) {
    pages.push(page);
  }

  const isCallbackMode = "onPageChange" in props;

  const renderPageButton = (page: number, label?: string) => {
    const text = label ?? String(page);

    if (isCallbackMode) {
      return (
        <button
          key={`${text}-${page}`}
          type="button"
          onClick={() => {
          if ("onPageChange" in props && props.onPageChange) {
            props.onPageChange(page);
          }
        }}
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
      {currentPage > 1
        ? renderPageButton(currentPage - 1, "이전")
        : (
          <button type="button" disabled className="chip-button">
            이전
          </button>
        )}

      {startPage > 1 && (
        <>
          {renderPageButton(1)}
          {startPage > 2 && <span>...</span>}
        </>
      )}

      {pages.map((page) => renderPageButton(page))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span>...</span>}
          {renderPageButton(totalPages)}
        </>
      )}

      {currentPage < totalPages
        ? renderPageButton(currentPage + 1, "다음")
        : (
          <button type="button" disabled className="chip-button">
            다음
          </button>
        )}
    </div>
  );
}