# Pickle 이메일 발송 설정

작성자용 앱 제재 알림은 적용되어 있습니다. 2026-10-13에 사용자 동의를 받아 `moderation-email-worker`를 배포했고, 사용자가 서버 비밀 설정을 완료한 후 연결 테스트와 예약 발송 활성화를 완료했습니다. 인증 이메일의 SMTP 설정도 사용자가 직접 완료했다고 확인했습니다. 실제 Resend 발송 성공 및 수신함 도착은 별도의 수신 테스트가 필요합니다.

Supabase Auth 인증 이메일과 제재 안내 이메일은 서로 다른 발송 경로입니다. 두 경로 모두 `admin@getpickleapp.com`을 발신자로 사용할 수 있습니다.

## 1. 공식 도메인 인증

1. [Resend](https://resend.com)에 가입하고 **Domains → Add domain**에서 `getpickleapp.com`을 추가합니다.
2. 도메인의 DNS 관리 사이트에서 Resend가 표시하는 발송용 인증 레코드를 추가합니다. 이름과 값은 해당 Resend 화면의 값을 그대로 사용합니다.
3. Resend에서 **Verify**를 누르고 도메인 상태가 **Verified**인지 확인합니다.
4. **API Keys**에서 해당 도메인 발송 권한이 있는 키를 생성합니다.

기존 `admin@getpickleapp.com` 메일함의 수신용 MX 레코드는 유지합니다. Resend의 발송 인증 레코드를 추가하는 것이며 기존 메일함을 이전하는 절차가 아닙니다. DKIM/SPF/DMARC 설정은 공급자가 안내하는 실제 레코드에 맞춥니다.

[Resend 도메인 안내](https://resend.com/docs/dashboard/domains/introduction), [Supabase 이메일 보안·SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Supabase Auth 인증 이메일

Pickle 프로젝트 → **Authentication → Notifications → Email → SMTP Settings**에서 Custom SMTP를 활성화하고 입력합니다. 대시보드 버전에 따라 Custom SMTP 메뉴 이름으로 표시될 수 있습니다.

| 항목 | 값 |
| --- | --- |
| Sender email | `admin@getpickleapp.com` |
| Sender name | `Pickle` |
| SMTP host | `smtp.resend.com` |
| SMTP port | `465` |
| SMTP username | `resend` |
| SMTP password | Resend API 키 |

SMTP password는 공식 메일함 로그인 비밀번호가 아니라 **Resend API 키**입니다. 저장 후 테스트 계정의 회원가입 인증·비밀번호 재설정 메일을 확인합니다. 발신 주소, 정상 수신, 인증 링크 동작을 확인합니다. 확인 이메일을 끄는 설정은 변경하지 않습니다.

공식 절차: [Resend와 Supabase SMTP 연결](https://resend.com/docs/send-with-supabase-smtp).

## 3. 제재 안내 이메일

수신자 이메일 주소와 제재 안내 내용을 Resend로 전달합니다. 이메일에는 콘텐츠 유형, 레시피 제목, 숨김/삭제 안내와 제재 사유만 포함하며, 신고자 정보와 내부 관리자 메모는 포함하지 않습니다.

`moderation-email-worker` Edge Function은 사용자 동의 후 배포되었습니다. 이 함수는 유저 JWT 대신 서버 간 전용 비밀값을 검증합니다. JWT gateway 검증을 끄는 것은 이 전용 인증 코드와 함께 사용하는 설정입니다. 공개 클라이언트에서 호출하는 함수가 아닙니다.

Supabase **Edge Functions → Secrets**에 다음 값을 입력합니다:

| 서버 설정 이름 | 값 |
| --- | --- |
| `RESEND_API_KEY` | Resend API 키 |
| `MODERATION_EMAIL_FROM` | `admin@getpickleapp.com` |
| `MODERATION_WORKER_SECRET` | 무작위로 생성한 32자 이상의 서버 간 비밀값 |

Supabase **Vault**에도 다음 두 값을 추가합니다:

| Vault 이름 | 값 |
| --- | --- |
| `moderation_worker_url` | `https://ztfwzwyyaaoexqtilpsw.supabase.co/functions/v1/moderation-email-worker` |
| `moderation_worker_secret` | Edge Function의 `MODERATION_WORKER_SECRET`와 동일한 값 |

이름의 대소문자와 두 곳의 비밀값이 정확히 일치해야 합니다. 키와 비밀값은 Supabase 대시보드에 직접 입력하고 채팅·저장소·`VITE_*` 환경변수에 넣지 않습니다. Supabase 기본 서버 키는 Edge Function의 기본 서버 환경에서 사용하며 앱에 복사하지 않습니다.

Cron 작업 `pickle-moderation-email-worker`는 2026-10-13에 활성화했고 1분마다 대기열을 확인합니다. 새 환경에서는 사용 동의·발송 함수 배포·비밀 설정 완료 후 활성화해야 합니다. Vault 설정이 없으면 호출하지 않습니다. Edge Function의 이메일 설정이 없으면 대기열을 소비하지 않습니다.

공식 참고: [Supabase 이메일 발송](https://supabase.com/docs/guides/functions/examples/send-emails), [예약 발송 함수 호출과 Vault](https://supabase.com/docs/guides/functions/schedule-functions).

## 동작과 확인

- 레시피·리뷰의 **숨김**, 댓글의 **숨김/삭제**가 실제로 적용될 때 작성자의 앱 알림과 이메일 대기열을 함께 저장합니다.
- 반려·유저 신고 검토 완료·복원에는 제재 알림을 만들지 않습니다. 복원 후 다시 숨기면 새 제재 알림을 만듭니다.
- 기존 과거 제재는 소급 발송하지 않습니다.
- 대상 콘텐츠를 실제로 삭제해도 제재 알림은 유지됩니다. 계정을 삭제하면 해당 계정의 알림·대기열은 삭제됩니다.
- 확인된 이메일 주소가 없는 계정은 앱 알림을 유지하고 이메일은 `skipped / no_verified_email`로 표시합니다.
- 임시 네트워크 오류·429·서버 오류는 재시도합니다. 고정 이벤트 ID, 고정 발신자·수신자·본문 및 provider idempotency key로 중복 발송을 방지합니다.
- 최대 8회까지 재시도합니다. 모호한 발송은 최초 시도 후 23시간을 넘겨 자동 재전송하지 않습니다. 공급자의 중복 방지 기간을 넘긴 실패 건은 Resend 기록을 확인한 뒤 수동 판단해야 합니다.
- 관리자 **Moderation → Moderation email delivery**에서 대기·재시도·실패 상태를 확인할 수 있습니다. **Provider accepted**는 Resend가 발송 요청을 수락했다는 뜻이며 수신함 도착·열람을 보장하는 상태가 아닙니다.

Resend의 중복 방지 기간: [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

설정 완료 후 관리하는 테스트 계정의 레시피/리뷰/댓글로 검증합니다. 제재 알림, 이메일 수신, 발신 주소를 확인하고 숨긴 콘텐츠는 복원합니다. 실제 유저 콘텐츠를 테스트 목적으로 제재하지 않습니다.

## 현재 검증 범위

2026-10-13에 실제 DB 트랜잭션 테스트로 작성자 전용 알림, 사유, 삭제 후 보존, 중복 방지, 서버 전용 대기열, 재시도와 검증된 이메일 수신자 선택을 확인했고 모든 테스트 데이터를 롤백했습니다. 이메일 worker 단위 테스트는 외부 발송을 모의했습니다. 실제 배포된 함수는 Vault의 인증값으로 호출해 HTTP 200 및 빈 대기열 결과를 확인했습니다. 이 테스트에서는 이메일을 보내지 않았습니다. 실제 Resend 이메일 수신과 Auth Custom SMTP의 수신은 아직 검증하지 않았습니다.
