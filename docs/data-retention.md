# Retention operations

Recipe-media disposal now runs separately through `media_helpers` / `recipe-asset-worker`; see [the applied data-use fixes](legal/data-use-hardening-2026-10-15.ko.txt). Draft/user recipe images use a private bucket and policy-checked signed URLs. This does not retroactively rewrite image metadata or change vendor-managed retention.

Applied 2026-10-15, policy version `2026-10-15.3`. See [the operator policy](legal/retention-policy.ko.txt) for scope and limitations.

`delete-account` authenticates the request, rejects protected staff accounts, and calls the service-only `prepare_account_deletion`. Preparation creates an account-scoped durable job/file manifest, hides the profile and authored public content, freezes ordinary writes and prevents new inbound messages. It attempts a bounded cleanup batch and returns either confirmed completion or HTTP 202 with a confirmed queued request/reference. Client copy distinguishes these states and signs out after an accepted request.

`retention-worker` uses a dedicated Vault-held request secret, verified through a service-only RPC before doing any work. JWT gateway checking is disabled for this internal worker because authentication is this separate scheduler secret; it is not an unauthenticated admin endpoint. `delete-account` keeps gateway JWT checking and additionally validates the user. Credentials are never returned to the browser or embedded in migrations.

Jobs use expiring leases. The worker processes at most 200 manifest files per batch through Storage API, acknowledges only successful removals, refreshes the manifest before Auth deletion, sanitises retry errors, and confirms Auth removal in the database before marking completion. Failed requests retain a restricted account and continue with backoff; unfinished cleanup is never discarded just because a retention clock elapsed. The administrator sees long failures and can queue a retry of an existing request, not create arbitrary deletions.

On completion, the database encrypts a minimal deletion receipt with a Vault key. It contains no email, recipe/message body or photo copy. The worker uploads it to private `retention-backups`, downloads it to verify SHA-256, then marks verification. Four restrictive Storage policies deny all ordinary user/admin browser access even if another permissive policy exists. Expired upload paths are rejected by a trigger. At 30 days, Storage deletion must succeed before the ledger/ciphertext is removed. This is a minimal processing archive, not full account restoration or independent disaster recovery.

Two named cron jobs run each minute: `pickle-retention-worker` dispatches only when work exists; `pickle-retention-purge` removes expired database records. Detailed closed-case evidence expires after 30 days; minimal history expires after 90 days. Open appeals/cases and active enforcement are protected. Search events, moderation notices, app email queue results and aggregate retention-run logs follow their defined 30-day clocks. Personal search data is not preserved as long-term recommendation history. Recipe-level statistics without account identifiers are separate.

The administration panel is **Moderation → Data deletion, retention & backups**. It exposes counts, job references, states, times and safe error codes; it does not expose user identifiers, file paths, ciphertext, keys or backup download URLs.

## Verification

- `tests/retention-worker.test.mjs`: scoped removal, storage/Auth failures, deferred batches, missing Auth user recovery, wrong-target rejection, final-ack mismatch, verified backup transfer, failed expiry cleanup and queued/completed client responses.
- `tests/retention-protocol.integration.sql`: BEGIN/ROLLBACK fixtures for service/admin access, leases, receipt encryption/minimal fields, expiry, private Storage metadata and acknowledgement ordering.
- `tests/retention-purge.integration.sql`: BEGIN/ROLLBACK fixtures for detailed evidence/search expiry, minimal history removal, open appeals, active enforcement and post-revocation cleanup.
- Existing scheduler responses returned HTTP 200 with aggregate-only results; both scheduled jobs reported successful runs after a query-variable collision was fixed in `retention_consistency`.
- After explicit user approval on 2026-10-15, one synthetic minimal receipt passed the live private-Storage test: encrypted upload, download/SHA-256 verification, forced test expiry, Storage API removal and database acknowledgement/removal. Worker responses were HTTP 200 with verified=1 and then expired=1, failures=0. Final job, file-task and backup-object counts were zero. No real account, recipe or photo was used. The expiry timestamp was advanced for this test; it did not wait 30 calendar days.

Provider-managed database backups, web logs, Resend records and Gmail/forwarding copies are not configured by these jobs. Confirm their actual terms/settings separately. Supabase database backups do not include Storage file bytes. Before reopening a restored database, re-check completed deletion markers and current retention state; this change does not automatically make arbitrary provider restores safe.

Security advisors showed the pre-existing `admin_analytics_overview` SECURITY DEFINER warning and disabled leaked-password protection, plus the intentional default-deny visibility-epoch info. No new advisory finding was introduced by these retention objects. References: [function access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
