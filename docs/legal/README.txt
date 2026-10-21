2026-10-16 update: minimum account age is now 13+, with reviewed guardian consent before activation at age 13. Rule: 13-plus-guardian-v1; policy: 2026-10-16.1. See ../guardian-consent.md and current/ for current text. Any earlier 18+ account launch proposal below is historical, superseded by this update.

Pickle 정책·약관·동의 문구
갱신: 2026-10-16 / UTF-8
운영자 Taelim Auh, 대한민국 거주 개인 운영자 / admin@getpickleapp.com
최초 출시 필리핀 / 계정 만 13세 이상 / 만 13세 보호자 확인 후 활성화

확정된 운영자·공급자·13+ 자기신고 및 만 13세 보호자 동의 검토·탈퇴 레시피/사진 삭제를 앱과 서버에 반영했습니다. 동의 버전은 2026-10-16.1입니다. 기존 사용자를 자동 동의/성인 처리하지 않았습니다.
보관 기준은 확정·적용했습니다: 최소 삭제 처리 기록/암호화 자체 백업 30일, 상세 증거 30일, 최소 제재 이력 90일. 공급자 상세 국외 처리/보관과 공개 URL은 후속 확인이 필요하며 출시/법률 검토 완료를 의미하지 않습니다.

current/: 현재 앱·서버 원문 TXT 및 동의/탈퇴 문구.
current/contact-us.en.txt: 운영자가 확정한 공식 이메일·상시 접수·영업일 3일 답변 목표와 실제 문의 안내.
archive/2026-10-15-before-operator-confirmation/: 운영자 답변 전 원문.
draft/: 상세 검토 초안. 미정 항목은 표시되어 있으며 현재 문구는 current/를 우선합니다.

먼저 읽을 파일
../guardian-consent.md: 만 13세 보호자 이메일 동의, 관리자 승인/반려/철회, 보관과 운영 확인 절차.
../photo-posts.md: 2026-10-16 사진 게시물 업로드·편집·공개/삭제 범위와 실기기 검증 항목. 개인정보 문구에 게시물 사진·캡션과 보관 동작을 추가했습니다.
../comment-notifications.md: 2026-10-16 추가된 레시피 댓글·답글의 앱 내 알림과 보관/삭제·검증.
data-use-hardening-2026-10-15.ko.txt: 보완 적용 결과·검증·외부 설정의 남은 확인 사항. 점검 보고서보다 최신 상태입니다.
play-data-safety-working.ko.txt: 실제 수집/SDK를 바탕으로 한 Play Console 작성 자료(미제출).
data-use-review-2026-10-15.ko.txt: 이메일·이름/아이디·사진·콘텐츠·팔로우·검색/조회·서버 로그·SDK의 최신 읽기 전용 점검과 미해결 항목.
current-summary.ko.txt: 현재 문구·기능 요약.
privacy-disclosure-check.ko.txt: 수집 목적·공개 정보·업체·보관/삭제·문의처의 문구 점검과 보완 내역.
launch-and-age-plan.ko.txt: 국가 확장·연령·스토어 설정.
retention-policy.ko.txt: 확정된 기산점·삭제 범위·재시도·백업과 외부 제공자 한계.
retention-recommendations.ko.txt: 이전 권장안의 보관 위치 안내.
data-processing-audit.ko.txt: 초기 근거와 후속 수정 상태.
operator-questions.ko.txt: 답변과 남은 항목.

다음 순서
자체 파기/재시도/백업 적용 완료 → 공급자 설정/국외 처리 고지 → 공개 정책·외부 탈퇴 요청 페이지 → Data safety/연령/아동 안전/국가 설정 → 실기기 삭제·파일·이메일·신고 검증.
스토어 배포·국가 선택은 실행하지 않았습니다. 웹 국가 차단도 자동 구현한 것이 아닙니다.

검증
account-age-deletion.integration.sql은 BEGIN/ROLLBACK에서 새 fixture 계정만 만들어 연령·권한·탈퇴 CASCADE를 검사합니다. 파일 정리는 테스트 더블로 다중 페이지·하위 폴더·타 계정 격리·실패 재시도를 검사합니다. 실제 계정/사진을 테스트로 삭제하지 않습니다.

공식 참고
https://support.google.com/googleplay/android-developer/answer/10144311
https://support.google.com/googleplay/android-developer/answer/13327111
https://support.google.com/googleplay/android-developer/answer/9867159
https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-%202012/
https://www.law.go.kr/법령/개인정보보호법
