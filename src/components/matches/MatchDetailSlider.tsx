"use client";

import { useState } from "react";
import Image from "next/image";

export type MatchDetailSlideParticipant = {
  id: number;
  team: "BLUE" | "RED";
  position: string;
  name: string;
  nicknameTag: string;
  championName: string;
  championImageUrl: string | null;
  kdaText: string;
  resultText: "WIN" | "LOSE";
};

export type MatchDetailSlide = {
  id: number;
  gameNumber: number;
  winnerTeam: "BLUE" | "RED" | "미정";
  winnerLabel: string;
  mvp: {
    name: string;
    nicknameTag: string;
    championName: string;
    kdaText: string;
    score: number;
  } | null;
  participants: MatchDetailSlideParticipant[];
};

type MatchDetailSliderProps = {
  slides: MatchDetailSlide[];
};

export default function MatchDetailSlider({
  slides,
}: MatchDetailSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!slides.length) {
    return <p className="match-slide-empty">세트 정보가 없습니다.</p>;
  }

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  return (
    <section className="match-slide">
      <div className="match-slide__topbar">
        <div className="match-slide__tabs">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={`match-slide__tab ${
                index === currentIndex ? "match-slide__tab--active" : ""
              }`}
              onClick={() => setCurrentIndex(index)}
            >
              {slide.gameNumber}세트
            </button>
          ))}
        </div>

        <div className="match-slide__controls">
          <button
            type="button"
            className="match-slide__control"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            이전
          </button>

          <span className="match-slide__count">
            {currentIndex + 1} / {slides.length}
          </span>

          <button
            type="button"
            className="match-slide__control"
            onClick={handleNext}
            disabled={currentIndex === slides.length - 1}
          >
            다음
          </button>
        </div>
      </div>

      <div className="match-slide__viewport">
        <div
          className="match-slide__track"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {slides.map((slide) => (
            <section key={slide.id} className="match-slide__panel">
              <div className="match-slide__set-head">
                <h2 className="match-slide__set-title">
                  {slide.gameNumber}세트 / 승리 팀: {slide.winnerLabel}
                </h2>

                <span
                  className={`match-slide__winner-badge ${
                    slide.winnerTeam === "BLUE"
                      ? "match-slide__winner-badge--blue"
                      : slide.winnerTeam === "RED"
                        ? "match-slide__winner-badge--red"
                        : "match-slide__winner-badge--pending"
                  }`}
                >
                  {slide.winnerLabel}
                </span>
              </div>

              <div className="match-slide__mvp">
                {slide.mvp ? (
                  <>
                    <strong>MVP:</strong>{" "}
                    {slide.mvp.name} / {slide.mvp.nicknameTag} /{" "}
                    {slide.mvp.championName} / {slide.mvp.kdaText} / 점수{" "}
                    {slide.mvp.score}
                  </>
                ) : (
                  <>MVP 정보 없음</>
                )}
              </div>

              <div className="match-slide__table-head">
                <span>포지션</span>
                <span>이름</span>
                <span>닉네임</span>
                <span>챔피언</span>
                <span>KDA</span>
                <span>결과</span>
              </div>

              <div className="match-slide__rows">
                {slide.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className={`match-slide__row ${
                      participant.team === "BLUE"
                        ? "match-slide__row--blue"
                        : "match-slide__row--red"
                    }`}
                  >
                    <span className="match-slide__position">
                      {participant.position}
                    </span>

                    <span className="match-slide__name">
                      {participant.name}
                    </span>

                    <span className="match-slide__nickname">
                      {participant.nicknameTag}
                    </span>

                    <div className="match-slide__champion">
                      {participant.championImageUrl ? (
                        <Image
                          src={participant.championImageUrl}
                          alt={participant.championName}
                          width={28}
                          height={28}
                          className="match-slide__champion-image"
                        />
                      ) : (
                        <span className="match-slide__champion-fallback" />
                      )}
                      <span>{participant.championName}</span>
                    </div>

                    <span className="match-slide__kda">
                      {participant.kdaText}
                    </span>

                    <span
                      className={`match-slide__result ${
                        participant.resultText === "WIN"
                          ? "match-slide__result--win"
                          : "match-slide__result--lose"
                      }`}
                    >
                      {participant.resultText}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="match-slide__dots">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={`match-slide__dot ${
              index === currentIndex ? "match-slide__dot--active" : ""
            }`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`${slide.gameNumber}세트로 이동`}
          />
        ))}
      </div>
    </section>
  );
}