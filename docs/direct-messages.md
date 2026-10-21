# Direct messages

2026-10-15 update: Deletion update: delete-account now prepares/freeze-writes, removes paginated avatar/community-recipe/chat photos through Storage API, then deletes Auth. Published recipes cascade. Failures are retryable and do not undo already removed files. New age eligibility is required for ordinary account writes.

Implemented on 2026-10-13.

- Another cook's profile → Message opens a private conversation.
- Your profile → Messages opens a compact inbox. Unread conversations use bold black preview text (white in dark mode), without numeric unread badges. Relative ages such as “3 days ago” appear beside the preview.
- Messages support up to 3,000 characters. New messages and read receipts update
  through Supabase Realtime; visible screens also refresh every 15 seconds.
- Inbox and conversation history load 50 records at a time with more-history controls.
- The inbox search bar finds existing conversations by display name or @username. It uses a 250ms debounce and filters the recipient-scoped inbox on the server before pagination, rather than only searching the first loaded page. Older search responses are ignored, changing/clearing the query resets pagination, and the query is not added to device recent-search storage. Message-body history search is not included.
- Inbox avatars are 44px, names 14px and message/time previews 12px.
- A confirmed server response is required before clearing the composer. Failed or
  uncertain sends keep the text and reuse a client UUID when retrying unchanged text.
- The app bottom navigation is hidden in messages. A single-line input sends on
  Enter; IME composition Enter does not send. There is no Send button in the composer.
- The left circular camera button selects a JPEG/PNG/WebP photo up to 5 MB.
  A preview and remove option appear; Enter sends the photo with optional text.
  Photo-only messages are supported. Failures retain the photo and unchanged
  retries reuse the uploaded path and client UUID.
- The right smiley button opens an emoji picker and inserts at the current
  cursor/selection. Emojis are sent as ordinary message text.
- User blocks restrict contact in both directions. See [user blocking](user-blocking.md).
- Android push notifications and message editing/deletion/reporting are not implemented.

## Data access

The migration creates `public.direct_messages` with row-level security.
Authenticated, non-anonymous participants can read their own conversations.
Only the authenticated sender can insert a message; only the recipient can
update its read timestamp. Message content, participants and creation time cannot
be edited through the client. Anonymous and unrelated accounts cannot read messages.
The inbox and send RPCs use SECURITY INVOKER and respect these policies.
Deleting a profile cascades to its sent and received messages.

Photos use the private `chat_images` bucket. Pending uploads are readable by
their sender; delivered photos are readable by the two conversation participants.
Unrelated, anonymous and blocked accounts cannot request access. URLs are signed
for five minutes and refreshed while mounted; an already issued URL remains usable
until it expires. Photo references bind sender, recipient and client UUID and
cannot be edited or reused for another message.

Unsent uploaded files can be removed through the Storage API; delivered files
are protected. The delete-account function cleans the account's unsent uploads
and delivered photos associated with its conversations before deleting the user.
No real account was deleted during verification.

## Verification

`tests/messages.test.mjs` checks confirmed delivery, retries, duplicate clicks,
stale responses, scoped queries, unread inbox rows, bubbles and composer rendering.
Run `tests/messages.integration.sql` inside BEGIN / ROLLBACK against a database
with at least two profiles. It verifies participant-only access, anonymous
restrictions, immutable content, read permissions, validation and idempotency
without retaining test messages.

`tests/chat-photos.integration.sql` verifies bucket configuration, unsent-upload
isolation, participant access, blocked/anonymous restrictions, immutable paths,
photo-only messages and idempotency inside BEGIN / ROLLBACK. It uses temporary
storage metadata without uploading real bytes; all fixtures were rolled back.
`tests/chat-photos.test.mjs` covers file limits, uncertain uploads, delivery
confirmation, retained attachment retries, emoji insertion and account cleanup.
Actual image selection and exchange on a physical Android device still require
manual verification.

For manual verification, use two accounts on separate devices or browser sessions:

1. Open the second account's profile and send a message.
2. Open Messages in the second account. Confirm the unread count and incoming text.
3. Open the conversation and reply. Confirm the first account sees the reply and
   the previous message's Read status.
4. Open Inbox, reopen the conversation and load older messages.
5. Turn off network access, send, restore connectivity and retry unchanged text.
   Confirm one message appears and the input clears after confirmed delivery.
6. Use the circular camera button to select a photo. Confirm preview/remove,
   send with Enter, and check the second account can see it. Repeat without text.
7. Insert an emoji at the middle of text and send. Confirm the emoji is kept.

Before store release, include direct-message data in the privacy policy and Data
Safety review and complete the existing user-content report/block work.
