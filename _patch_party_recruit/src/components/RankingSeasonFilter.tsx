"use client";

import { useRouter, useSearchParams } from "next/navigation";

type RankingSeasonFilterProps = {
  seasons: Array<{
    id: number;
    name: string;
    isActive: boolean;
  }>;
  selectedSeasonId?: number;
};

export default function RankingSeasonFilter({
  seasons,
  selectedSeasonId,
}: RankingSeasonFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!value) {
      params.delete("seasonId");
    } else {
      params.set("seasonId", value);
    }

    router.push(`/rankings?${params.toString()}`);
  };

  return (
    <div className="section-block">
      <select
        className="app-select"
        value={selectedSeasonId ? String(selectedSeasonId) : ""}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">현재 시즌</option>
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
          </option>
        ))}
      </select>
    </div>
  );
}