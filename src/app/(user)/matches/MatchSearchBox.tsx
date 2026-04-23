"use client";

type MatchSearchBoxProps = {
  initialQuery: string;
};

export default function MatchSearchBox({ initialQuery }: MatchSearchBoxProps) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <form
        action="/matches"
        method="get"
        style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
      >
        <input
          type="text"
          name="q"
          defaultValue={initialQuery}
          placeholder="내전 제목 / 시즌명 검색"
          autoComplete="off"
          style={{
            width: "320px",
            padding: "10px 12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        />
        <button type="submit" className="app-button">검색</button>
      </form>
    </div>
  );
}