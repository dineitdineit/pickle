# Recipe comments and reply notifications

Applied 2026-10-16 in `20261016020650_comment_reply_notifications.sql`.

New comments create server-side, in-app notifications in the existing `user_notifications` inbox. This includes replies posted under a recipe. The recipe author receives a `recipe_comment` notice, and the direct parent comment's author receives `comment_reply`. If both recipients are the same person, only the reply notice is created. Authors never receive notices for their own actions. Editing or restoring a comment does not generate another notice; old comments are not backfilled.

Notifications keep actor, recipe and comment identifiers without copying the comment body. The recipient-only RLS policy remains in force, and ordinary clients cannot insert notices. A restrictive visibility policy also checks the current comment, parent comment, recipe and block relationship. Hidden/removed content and blocked actors are excluded from both the list and unread count; restoring visibility can reveal an existing notice again. Deleting the comment, recipe or linked account cascades its notices. Existing account-deletion preparation and user-block guards are respected when producing new notices.

The header bell badge and inbox listen for recipient-filtered Realtime INSERT/UPDATE events with a short coalescing delay. They also recheck every 30 seconds while visible and when the app regains focus. DELETE events are deliberately not subscribed to, because their filtering/RLS behavior differs; polling and existing safety refreshes reconcile deleted or hidden notices. This feature does not add OS push notifications, background device alerts or comment/reply email.

Tapping a comment/reply notice opens the recipe and focuses/scrolls to the referenced comment after it loads. It updates only that recipient's selected notice to read, and requires a confirmed server response before changing local read state. The existing mark-all-visible-as-read action remains available. If the referenced comment is not in the loaded list, there is no forced jump to an unrelated comment.

Comment/reply notices expire after 30 days through the existing scheduled retention purge. Follow/new-recipe alert retention remains unchanged. The privacy notice and its current text snapshot describe this behavior; terms/content-policy consent version remains `2026-10-15.3`.

Validation: 161 JavaScript tests passed, including copy, recipient-scoped read acknowledgements, Realtime subscription cleanup and exact-comment routing. `tests/comment-notifications.integration.sql` passed with synthetic users inside BEGIN/ROLLBACK for recipients, self/edit deduplication, ownership, unread status, hidden content, blocking and cascades. The independent `tests/comment-notification-expiry.integration.sql` verified 31-day removal and 29-day retention through the real purge function inside rollback. No real customer comment was posted to generate a test notice. Publication/trigger/RLS metadata and security advisors were checked; existing advisor findings remain unchanged.

TypeScript/Vite build, Capacitor sync and Gradle debug APK build passed. Use Android Studio Run to install the updated client. Neither a production web deployment, Git merge/commit nor Play release was performed. An actual two-device Realtime delivery test and device-level background/push delivery were not performed.
