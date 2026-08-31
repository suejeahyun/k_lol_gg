/*
 * K-LOL.GG Kakao bot dual-secret caller switch template.
 *
 * This file contains no credential. Keep both switches false until the server
 * dual-acceptance release and its production verification are complete.
 */
var KLOL_KAKAO_USE_RECRUIT_NEXT_SECRET = false;
var KLOL_KAKAO_USE_SEARCH_NEXT_SECRET = false;

function klolSelectKakaoSecret(activeSecret, loadNextSecret, useNext, keyLabel) {
  if (useNext !== true) return activeSecret;

  var nextSecret = String(loadNextSecret() || "").trim();
  if (!nextSecret || nextSecret === String(activeSecret || "").trim()) {
    throw new Error(keyLabel + " NEXT 구성이 올바르지 않습니다.");
  }
  return nextSecret;
}

function klolRecruitSecretForRequest(activeSecret, loadNextSecret) {
  return klolSelectKakaoSecret(
    activeSecret,
    loadNextSecret,
    KLOL_KAKAO_USE_RECRUIT_NEXT_SECRET,
    "KAKAO_RECRUIT_SECRET",
  );
}

function klolSearchSecretForRequest(activeSecret, loadNextSecret) {
  return klolSelectKakaoSecret(
    activeSecret,
    loadNextSecret,
    KLOL_KAKAO_USE_SEARCH_NEXT_SECRET,
    "KAKAO_SEARCH_PLAYER_SECRET",
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    klolSelectKakaoSecret: klolSelectKakaoSecret,
    klolRecruitSecretForRequest: klolRecruitSecretForRequest,
    klolSearchSecretForRequest: klolSearchSecretForRequest,
  };
}
