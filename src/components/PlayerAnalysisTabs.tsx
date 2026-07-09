"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type AnalysisTab = "civil" | "solo";

type PlayerAnalysisTabsProps = {
  civil: ReactNode;
  solo: ReactNode;
  civilMeta?: string;
  soloMeta?: string;
};

const TABS: Array<{
  id: AnalysisTab;
  label: string;
  description: string;
}> = [
  {
    id: "civil",
    label: "내전 분석",
    description: "시즌 내전 기록",
  },
  {
    id: "solo",
    label: "솔랭 분석",
    description: "Riot API 기록",
  },
];

export default function PlayerAnalysisTabs({
  civil,
  solo,
  civilMeta,
  soloMeta,
}: PlayerAnalysisTabsProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("civil");

  return (
    <section className="player-analysis-shell">
      <div className="player-analysis-toolbar">
        <div>
          <p className="player-analysis-eyebrow">ANALYSIS BOARD</p>
          <h2>플레이어 분석</h2>
        </div>

        <div className="player-analysis-tabs" role="tablist" aria-label="플레이어 분석 종류">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const meta = tab.id === "civil" ? civilMeta : soloMeta;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`player-analysis-tab${isActive ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                <small>{meta ?? tab.description}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="player-analysis-panel" role="tabpanel">
        {activeTab === "civil" ? civil : solo}
      </div>
    </section>
  );
}
