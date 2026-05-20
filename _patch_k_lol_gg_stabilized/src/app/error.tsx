"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[GLOBAL_APP_ERROR]", error);

  return (
    <main className="page-container">
      <section className="card balance-form-card app-error-card">
        <p className="page-eyebrow">ERROR</p>
        <h1 className="page-title">페이지를 불러오지 못했습니다.</h1>
        <p className="app-error-card__message">
          일시적인 오류일 수 있습니다. 다시 시도해도 반복되면 관리자에게 현재 페이지 주소와 시간을 전달해주세요.
        </p>
        {error.digest ? (
          <p className="app-error-card__digest">오류 코드: {error.digest}</p>
        ) : null}
        <button type="button" className="app-button" onClick={() => reset()}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
