# 관리자 비밀번호 로그인 1.0.0 후보

사용자의 관리자 2차 인증 삭제 요청에 따라 승인된 ADMIN/SUPER_ADMIN은 비밀번호만으로 별도 ADMIN 세션을 발급받는다. 기존 등록 여부·TOTP 키는 관여하지 않는다. 소스 기준 b2077f2e5cc640eebc13a5bc3900e67ead1b927b, migration head 0047_usage_analytics 유지. DB 변경 없음.

- 전체 검사: 계약 445개, 단위 1030개 통과·1개 skip, lint 오류 0·기존 경고 57, 타입·ERD·빌드 통과.
- 실제 격리 DB/HTTP: 미등록 ADMIN, 복호화 불가능한 과거 TOTP 등록 ADMIN, SUPER_ADMIN 모두 비밀번호만으로 200. 새로운 세션은 TOTP 인증 완료로 기록하지 않음. 잘못된 비밀번호·일반 USER·미승인·임시 비밀번호 계정은 거절.
- 관리자 페이지·CSV·카카오·Riot 미리보기 조회 성공, 일반 ADMIN 사이트 설정 403, SUPER 실제 설정 저장 성공. 설정 저장 시 DB transaction의 세션 권한 검사를 통과함.
- 외부 origin·서명 변조·authVersion 불일치·logout 후 접근 차단. 기존 TOTP 등록 데이터는 유지하며 등록 API는 관리자 인증 후 410.
- 이용 통계 HTTP와 실제 1440/390px 브라우저 수집·제외·접근성 검사 통과.
- 변경 파일 lint 및 소스 비밀값 검사 통과. 운영 계정·비밀번호·TOTP 데이터를 사용하거나 변경하지 않았다.

운영 전 복구 기준 dpl_92RbwvnaMAcxVnNzzeuK9oNQUUwy. 이전 배포를 재승격하면 원래 2차 인증이 다시 적용된다. 신규 비밀번호 전용 세션은 이전 TOTP 권한 조건을 통과하지 못한다.
