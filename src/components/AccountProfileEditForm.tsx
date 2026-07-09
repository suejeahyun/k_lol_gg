"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AccountProfileEditFormProps = {
  player: {
    nickname: string;
    tag: string;
  } | null;
};

export default function AccountProfileEditForm({ player }: AccountProfileEditFormProps) {
  const router = useRouter();
  const [nickname, setNickname] = useState(player?.nickname ?? "");
  const [tag, setTag] = useState(player?.tag ?? "");
  const [loading, setLoading] = useState(false);

  const disabled = !player || loading;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!player) {
      alert("연결된 플레이어가 없어 닉네임/태그를 수정할 수 없습니다.");
      return;
    }

    const nextNickname = nickname.trim();
    const nextTag = tag.trim();

    if (!nextNickname || !nextTag) {
      alert("닉네임과 태그를 모두 입력해주세요.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/my-player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nextNickname,
          tag: nextTag,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "닉네임/태그 수정 실패");
        return;
      }

      alert("닉네임과 태그를 저장했습니다.");
      router.refresh();
    } catch (error) {
      console.error("[ACCOUNT_PROFILE_UPDATE_ERROR]", error);
      alert("닉네임/태그 수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="account-profile-form" onSubmit={handleSubmit}>
      <div className="account-form-section__title">
        <span>PROFILE</span>
        <strong>닉네임 / 태그 변경</strong>
        <p>사이트에서 표시되는 닉네임과 Riot 태그를 수정합니다.</p>
      </div>

      <div className="account-profile-form__grid">
        <label className="account-profile-form__field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="예: 우형"
            disabled={disabled}
          />
        </label>

        <label className="account-profile-form__field">
          <span>태그</span>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="예: KR1"
            disabled={disabled}
          />
        </label>
      </div>

      {!player ? (
        <p className="account-profile-form__notice">연결된 플레이어가 없어 수정할 수 없습니다. 관리자에게 플레이어 연결을 요청하세요.</p>
      ) : (
        <p className="account-profile-form__notice">이미 사용 중인 닉네임#태그는 저장할 수 없습니다.</p>
      )}

      <div className="account-profile-form__actions">
        <button className="admin-button" type="submit" disabled={disabled}>
          {loading ? "저장 중..." : "닉네임/태그 저장"}
        </button>
      </div>
    </form>
  );
}
