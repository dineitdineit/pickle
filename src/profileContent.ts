export const privacySections = [
  {
    title: "1. Information we collect",

    body: "We process your email and authentication information through Supabase, account ID, username, display name, optional profile photo and biography; recipes and drafts, photo posts and captions, photos, comments, replies, reviews and message text/photos; saves and private cooking states (Want to cook/Cooked), likes, follows, blocks and notification preferences. We also process reports, content snapshots, moderation decisions and appeals, policy-agreement versions/times, search events, recipe-view counts and minimal deletion-job/receipt data including identifiers, cleanup paths, timestamps and sanitized status codes. Birth dates entered for account eligibility are used to evaluate the 13+ rule without storing a birth-date field; the server keeps the eligibility result, guardian-required flag, rule version and confirmation time. For accounts declared age 13 we also keep a consent request number, policy version, status, review times, reviewer identifiers and internal evidence references. The guardian sends their name, relationship and explicit consent to our official mailbox; we do not request government IDs or the child’s full birth date in that statement. Service providers may process technical information needed to operate and secure the service.",
  },

  {
    title: "2. Purposes for collecting and using information",

    body: "We use account, authentication, 13+ eligibility and guardian-consent records to register, sign in, secure and activate accounts, verify guardian authority and record consent or withdrawal for accounts declared age 13. We use profile details, recipes, drafts, photo posts and captions, uploaded images, comments and reviews to provide the publishing and community features you choose. Message text/photos, participant IDs and read status provide private delivery and conversation history. Saves, cooking states, likes, follows, blocks and notification choices provide your collections, social connections, safety controls and requested alerts. Search and recipe-view records support discovery, recommendations and usage statistics. The Following feed uses your existing follow relationships to show published recipes and photo posts from followed cooks in time order. To evaluate whether saved recipes are useful, we record signed-in account ID, recipe ID, original save time, UTC day, event type and server creation time for later-day saved-recipe opens and changes to Cooked, deduplicated per account/recipe/type/day. We use these records and existing published recipe-linked posts, comments and original-author hearts for admin-only aggregate cooking and response metrics. These metrics do not prove that cooking occurred or a phone notification was delivered. No additional external analytics SDK or provider is added. Reports, evidence, moderation decisions and appeals support abuse prevention, policy enforcement and review. Agreement versions/times document your choices. Contact details and inquiry contents let us respond to support/privacy requests and send authentication or service notices.",
  },

  {
    title: "3. Service providers",

    body: "Supabase provides authentication, database, file storage and server functions and processes the account/content data needed for those features; the current primary database region is Seoul, South Korea. Vercel hosts and delivers the web service and may process web-request technical information. Resend receives recipient email addresses and message content to deliver authentication and service/moderation emails. Porkbun forwards inquiries sent to admin@getpickleapp.com, including sender details and inquiry contents, to the operator’s Gmail mailbox provided by Google. Google also provides the currently enabled social sign-in flow and related identity data. Apple sign-in is planned but is not currently offered. Provider infrastructure, support, logs or delivery may involve processing outside South Korea; the database region does not determine every provider’s processing location. External video playback and links contact their respective providers under their own data practices. Pickle uses the Supabase JavaScript SDK for authentication, database, storage and realtime requests, and Capacitor App/Browser for app and browser integration. We have not integrated a dedicated advertising, external analytics or remote crash-reporting SDK in this app build. Provider request logs may include technical request information such as IP address, user agent, request path, time, status and account identifiers where applicable; actual fields and retention depend on the provider and configuration.",
  },

  {
    title: "4. Sharing and sale of information",

    body: "We do not sell your personal information. We may share information with service providers that help us operate Pickle, when you direct us to share it, or when disclosure is required to comply with law, protect users, or protect the rights and security of Pickle.",
  },

  {
    title: "5. Public and private information",

    body: "Other users or visitors, where the feature permits, can see your username/tag, display name, profile photo, biography, published recipe titles/descriptions/ingredients/steps/photos/video links, published photo-post photos and captions, tagged original-recipe links and original-author heart reactions, recipe and photo-post comments/replies (including a Recipe author label where applicable), and review/rating content. Public activity includes visible post, follower/following, recipe-view and like counts. Frequently searched terms may also appear as recommendations without naming the searcher, as explained in section 11. Your email address, authentication credentials, private drafts, saved-recipe collection and cooking states, message contents/photos, block list and private report/appeal submissions are not intended for public display. Ordinary message/photo access is limited to the participants. Authorised staff may access information needed for service administration, security, moderation or valid legal requests; this is not an end-to-end encrypted messaging service. Participants can copy received content. User-uploaded recipe and post images are stored privately; draft previews are limited to the owner and authorised staff, and published recipe and post images can be accessed through short-lived URLs after a visibility check. Profile photos and legacy catalogue images remain public. URLs already issued, cached files and copies already obtained cannot all be recalled immediately by hiding a screen or blocking a user.",
  },

  {
    title: "6. Retention, deletion and retained records",

    body: "Deleting a photo-post comment erases its text and leaves a placeholder so replies can remain connected. Comment identifiers and timestamps remain with the post until post or account deletion. Deleting a photo post or deleting/replacing a recipe/draft queues unused user-uploaded recipe/post images for Storage deletion with retries; images still referenced by saved content or retained report evidence remain subject to their applicable retention rules. Unsaved uploads abandoned without an explicit discard are eligible for cleanup after seven days. Unpublished server post drafts are eligible for cleanup after seven days without an update; recoverable photo-post drafts are stored separately on this device as described in section 7. Account records and content remain available while needed to provide your account and the features you use; the 30-day rule is not automatic deletion of an active account. Request deletion through Profile settings > Delete Account or admin@getpickleapp.com. We immediately attempt removal of your account, published recipes and photo posts, drafts, uploaded account/recipe/post/chat photos, messages and linked activity. Your profile and content are hidden and new ordinary writes are restricted while cleanup runs. File or authentication failures are queued for automatic retry; an accepted request is not falsely described as completed deletion. A minimal deletion job keeps the account identifier, file-cleanup paths, timestamps and sanitized status/error codes while needed to finish the request. After successful deletion, that minimal receipt and its application-managed encrypted backup expire in 30 days. We do not create a recovery copy of your recipes, photo posts, messages or photos in that backup. Detailed report snapshots, evidence and notes expire 30 days after case closure or final appeal review, whichever is later. Minimum enforcement history is retained for 90 days; an open case/appeal and the minimum state needed to enforce an active restriction remain until resolved or the restriction ends. Saved-recipe return and Cooked-change activity records expire after 30 days, are purged hourly and cascade on account or recipe deletion. They are private and are not displayed to other users. Search events and in-app moderation, recipe-comment and comment-reply notices expire after 30 days; the application email queue expires 30 days after sending or, if not sent, creation. Non-identifying recipe statistics are separate from personal search records. Cleanup is scheduled automatically; failed physical deletion remains pending, is retried and is visible to the operator. Expiry is a processing deadline, not a guarantee that a provider outage cannot delay erasure. Pending, declined or revoked guardian requests and their review history expire 30 days after the request or latest review; approved consent and review history remain while needed for the active account and are deleted with that account. An expired or withdrawn consent does not activate an account. Vendor-managed logs, mailbox copies (including guardian correspondence) and infrastructure backups are outside this application-managed archive; their actual lifecycles require separate provider settings and are not claimed to have been changed by our 30-day job. Public copies already obtained and other-device caches cannot all be recalled. Contact admin@getpickleapp.com for deletion assistance or a review of retained information.",
  },

  {
    title: "7. Your choices",

    body: "You can manage supported profile fields, collections, follows, author alerts and blocks, edit/delete your supported content, and request account deletion in Settings. Username and display name are currently fixed in the ordinary UI. You may contact admin@getpickleapp.com to exercise applicable access, correction, deletion or other data rights; we may verify your identity proportionately. Device search history, theme, drafts and Supabase authentication/session data are stored locally in browser/WebView storage. Photo-post drafts use IndexedDB for one private draft per account on each device, including selected metadata-stripped photo files and cropped copies, photo order and editing settings/text overlays, caption, recipe tag, editor position and a stable post identifier for retrying interrupted sharing. These photos and draft fields are not uploaded until Share is pressed. Drafts expire 30 days after the last save and expired records are removed when draft storage is next opened. Signing out retains the account-scoped draft for that account on this device; the app does not show it to another signed-in account. An explicit discard removes the local draft, and confirmed sharing removes it after publication. App account-deletion cleanup attempts to remove the account's local draft and photos before signing out, with a warning if local cleanup fails. Drafts are not cloud-synced and can be lost if app/site data is cleared, the app is uninstalled or the device/browser removes local storage. A storage failure is shown in the composer; continuing without draft saving keeps changes only in memory. Cooking-mode checkoffs, step progress, serving choices and timer deadlines are also stored on the device, separately for each account or guest use, without uploading cooking history. Cooking progress can be resumed for 30 days after its last change; expired records are removed when cooking mode is opened, and account-deletion cleanup removes that account cooking cache on the current device. The screen-awake option is temporary and resets off after leaving cooking mode. Recent searches are cleared when signing out or changing accounts, and can persist for the same account on that device. This Android build excludes its local app data from OS cloud backup and device transfer using backup rules; previously created backups and copies on other devices are not recalled by these settings. Newly uploaded profile, recipe, post and chat photos are decoded and re-encoded on the device before transfer to avoid forwarding source EXIF/GPS and other embedded metadata; this does not describe a retrospective rewrite of older uploads. Removing a recent search from the device does not delete its server search event. After an accepted app account-deletion request we attempt to clear this account’s draft/settings cache and shared recent searches on that device; other devices or OS backups can retain copies.",
  },

  {
    title: "8. Children",

    body: "Pickle accounts are for people aged 13 and over. People under 13 must not activate an account. Accounts declared age 13 stay inactive until an adult parent or legal guardian submits explicit consent from their own email to admin@getpickleapp.com and an authorised administrator reviews the consent and guardian authority. Show your guardian the Privacy Policy, Terms and Content Policy supplied on the eligibility screen. A child’s checkbox or age entry alone is insufficient. Until approval, ordinary publishing, uploads, messages and social writes are restricted and the profile is not publicly shown. Guardians can request access, correction, consent withdrawal or account deletion at the same address; withdrawal pauses ordinary account features. Age 14+ accounts pass the ordinary eligibility check, subject to applicable local requirements. Existing users and Google sign-in users also pass the check. Age entry is self-declaration, not government-ID verification. A minimal authentication record may exist before the post-login check, especially with social sign-in. Public recipe browsing is separate from account activation. Contact us about an underage account or a child’s rights; do not send sensitive identity documents unsolicited.",
  },

  {
    title: "9. Changes to this policy",

    body: "We may update this Privacy Policy as Pickle changes. When we make material changes, we will update the date shown on this page and provide additional notice when appropriate.",
  },

  {
    title: "10. Operator and privacy contact",

    body: "Pickle is operated by Taelim Auh, an individual based in the Republic of Korea. Privacy contact: Taelim Auh, admin@getpickleapp.com. Use this address for questions about data collection, public visibility, service providers or retention, and for applicable access, correction, deletion or account-deletion assistance requests. We may need proportionate identity verification to handle a request. Initial store distribution is planned for the Philippines; future country availability will be introduced separately.",
  },

  {
    title: "11. Search and discovery records",

    body: "Submitted general search events include the search text, normalised text, result count, time and account ID when signed in. Recommended search terms are limited to terms matching public ingredient/tag names, containing only permitted word characters and searched by at least five distinct signed-in accounts in the recent 30-day window. Searcher identities are not returned in recommendations; do not enter private or sensitive information in search fields. Raw search events expire after 30 days and are removed by the scheduled retention task. Recipe-view rows contain a recipe ID and time, not an account ID in that table; ordinary clients receive aggregate counts rather than raw viewing timestamps. Recipe statistics have a separate service purpose. A follower’s author-alert preference is available through their own account controls rather than direct relationship-table reads. Provider request logs are separate.",
  },

  {
    title: "12. Moderation notices and service email",

    body: "Reports, content snapshots, evidence and appeal records are used for safety review and oversight with access restricted to authorised staff. You can report photo posts, post comments/replies and individual received messages as well as recipes, reviews, recipe comments and accounts. A message report shares only the selected message text, sent time, immutable report identifier and any attached photo reference with the moderation team, together with your chosen reason/details; it does not submit other conversation messages. Post reports retain the caption and selected post photo references; comment reports retain the selected comment and thread identifiers. The server verifies content access or message-recipient status. Admin review uses the existing assignment, decision, reversal and appeal workflow. Hiding or removing a message prevents ordinary access to its body and photo and excludes it from inbox previews, unread counts and new push delivery; hiding a post comment also hides its replies until restored. Previously issued short-lived photo links, content already displayed and copies others made may remain accessible until expiry or beyond Pickle's control. Authors receive the public action/reason and appeal information in the app and through the configured service-email queue, without reporter identities, report details, message bodies/photos or internal admin notes. Removed content is withheld using moderation flags so eligible reversals remain possible; account/content deletion and the evidence-retention rules still apply. Detailed evidence is removed 30 days after final case/appeal closure; minimum enforcement history is retained for 90 days, subject to an ongoing case/appeal or active restriction as described in section 6. Authors receive public reasons, clauses, actions and restriction periods; reporter identities and internal notes are not disclosed through those notices. Moderation notices in the app expire after 30 days. Resend can receive the recipient address, public notice text and recipe title. The app email queue is cleared after 30 days; this does not delete a copy already delivered to a mailbox or set Resend’s own retention. These service messages are separate from marketing consent. Comments on your recipes and photo posts, and replies to your comments on either, also generate in-app alerts using participant, recipe or post, and comment identifiers, without a separate copy of the comment body. These comment/reply alerts expire after 30 days and are hidden when their content is unavailable or the relevant users are blocked. Posts tagging your recipes can also generate in-app photo-feedback alerts, controlled by the recipe comment/photo-feedback notification setting. These alerts open the photo post, expire after 30 days, and are hidden when the post, recipe or relevant accounts are unavailable or blocked. The tag links to the original recipe without copying its text into a separate snapshot. Deleting the original recipe removes the tag and associated alert while leaving the photo post. Original-author hearts are public acknowledgements and do not generate a separate alert. Optional Android phone notifications use Capacitor Push Notifications and Google Firebase Cloud Messaging (FCM). They require a separate enable action in Notification settings and Android permission. Pickle stores the FCM device token, account and session identifiers, installation identifier, a hashed unlink capability, and last registration time in private server records; the device stores its installation identifier, unlink capability and selected account, without caching the token in browser storage. Google processes the token, technical delivery information and minimal account/installation and notification/message identifiers to route alerts. Lock-screen text is generic; message/comment bodies, names, emails and photos are not included. Taps check the current account and current content access before opening. Device bindings are removed when disabled, when their session is deleted or the account is deleted, and expire after 30 days without renewal. Queue records expire after one day and are removed by periodic cleanup. Delivery uses bounded retries and can be delayed, repeated or suppressed by Android; it is not an emergency service. Google may process delivery information outside South Korea under its own policies; Pickle does not control every provider log retention period. Phone notification availability depends on device permissions and service configuration. Comment/reply and photo-feedback email remains unavailable.",
  },

  {
    title: "13. Optional AI recipe organization",

    body: "AI recipe organization is optional and starts only after you select the separate AI agreement and press Organize with AI. The ingredients and cooking-step text you supply is sent through Supabase to Vercel AI Gateway and Google Vertex AI using Gemini 2.5 Flash Lite, to produce editable recipe fields. This function does not automatically send your account email, profile, photos, other recipe details or messages to the model. Do not include personal or sensitive information in these text boxes. You can decline and enter your recipe manually. Accounts requiring guardian consent cannot use this optional AI feature while AI-specific guardian approval is unavailable; manual recipe entry remains available. Google inference may take place in the United States or the European Union, and provider infrastructure and technical logs can involve other locations. Pickle restricts requests to the Google Vertex serving route and requests no prompt training. Vercel currently lists that route as having no-training and zero-retention agreements, but Pickle does not claim that its current Hobby plan enforces Vercel's separate zero-retention routing control or a fixed deletion period for every provider record. Providers may retain technical, billing and security records under their own terms. Pickle's account-deletion and 30-day backup rules do not determine those providers' retention. The original text remains in your private recipe draft and device draft cache; applied suggestions become ordinary editable recipe content. No separate AI prompt/output archive is created by this function. Private usage-limit records contain account ID, UTC day, request count and last-use time, are cleared after the previous UTC day by a daily job, and cascade on account deletion. This optional choice uses notice version recipe-ai-2026-10-16.1; acceptance of the general Terms and Content Policy alone does not authorize an AI request. AI output may be inaccurate and must be reviewed before publishing.",
  },
]

export const termsSections = [
  {
    title: "1. Using Pickle",

    body: "Pickle is operated by Taelim Auh, an individual based in the Republic of Korea. You must be at least 13 years old to activate or use a Pickle account. At age 13, activation requires explicit consent from an adult parent or legal guardian, reviewed by Pickle before account features are available. Guardian consent is tied to the displayed policy version; material updates can require renewed review. A guardian may withdraw consent or request deletion through admin@getpickleapp.com. A self-declaration is not proof of age or guardian authority. Follow any additional local consent requirements that apply to you. Public recipe browsing is separate from account activation and does not waive this account-age rule. Use Pickle in compliance with applicable law, these terms and the Content Policy. The Privacy Policy explains our data practices.",
  },

  {
    title: "2. Accounts",

    body: "Some features require an account. You are responsible for the accuracy of your account information and for keeping your login credentials secure. You are also responsible for activity that occurs through your account.",
  },

  {
    title: "3. Recipes and nutrition information",

    body: "Recipes, cooking times, substitutions, serving sizes, and nutrition values are provided for general informational purposes. Results can vary based on ingredients, equipment, brands, preparation methods, and individual circumstances. Use appropriate food-safety practices and your own judgment when cooking.",
  },

  {
    title: "4. User content",

    body: "You retain rights you hold in recipes, images, comments, reviews, profile information and messages you submit. You give Pickle a non-exclusive, worldwide, royalty-free permission to store, host, technically format, reproduce and display or deliver that content as needed to operate and secure the features you use. Public posts may be displayed/shared through public features. Private messages and drafts are processed for their private features and the limited safety/legal operations described in the Privacy Policy, rather than unrestricted public distribution. You must have the rights and permissions needed to share your content.",
  },

  {
    title: "5. Acceptable use",

    body: "Do not use Pickle to harass others, post illegal or harmful content, impersonate others, infringe intellectual-property rights, distribute malware, interfere with the service, scrape the service in an abusive manner, or attempt to access accounts or systems without authorization.",
  },

  {
    title: "6. Pickle content and intellectual property",

    body: "The Pickle name, branding, app design, software, and original content are protected by applicable intellectual-property laws. These terms do not transfer ownership of Pickle or its content to you.",
  },

  {
    title: "7. Suspension and termination",

    body: "We may apply warnings, content hiding/public removal, account restrictions or suspension according to the Content Policy and safety needs. That policy explains provisional actions, repeat incidents, approval of long/permanent suspensions, public reasons and appeals within 14 days. You may request account deletion, including deletion of your published recipes and uploaded photos. Deletion is attempted immediately; failed steps continue through a restricted background retry process. An accepted request is distinguished from completed deletion. Minimal deletion receipts and encrypted application backups expire after 30 days; detailed evidence and minimum enforcement history follow the 30/90-day rules and active-case/restriction exceptions in the Privacy Policy. Staff accounts require operator-assisted deletion. Provider copies have separate lifecycles.",
  },

  {
    title: "8. Service availability",

    body: "We work to keep Pickle available and reliable, but we do not guarantee uninterrupted or error-free operation. Features may change, be added, or be removed as the service develops.",
  },

  {
    title: "9. Disclaimer and limitation",

    body: "To the extent permitted by applicable law, Pickle is provided on an “as is” and “as available” basis. Pickle is not responsible for losses caused by reliance on recipe or nutrition information, service interruptions, or user-submitted content except where liability cannot legally be excluded.",
  },

  {
    title: "10. Changes to these terms",

    body: "We may update these terms as Pickle changes. When renewed agreement is required, you must accept the updated terms and Content Policy before sharing recipes, photos, comments, reviews or messages. The server records the accepted policy version and time. This agreement is not consent to unrelated marketing or all possible processing. Privacy notices and any separate purpose-specific consents must be handled according to their actual purpose and applicable rules.",
  },

  {
    title: "11. Contact",

    body: "For questions about these terms, contact Taelim Auh, the Pickle operator in the Republic of Korea, at admin@getpickleapp.com. Mandatory rights under applicable law are not excluded by these terms.",
  },
]

export const faqs = [
  {
    question: "What is Pickle?",

    answer:
      "Pickle is a recipe discovery app designed to help you find, save, and cook recipes more easily.",
  },

  {
    question: "Do I need an account to browse recipes?",

    answer:
      "No. You can browse and view recipes without signing in. An account is needed for features such as saving, liking, and commenting.",
  },

  {
    question: "Where can I find recipes I saved?",

    answer:
      "Open the Saved tab from the bottom navigation, or go to Profile and choose Saved Recipes.",
  },

  {
    question: "Can I remove a saved or liked recipe?",

    answer:
      "Yes. Tap the bookmark or heart again on the recipe page to remove it from your saved or liked recipes.",
  },

  {
    question: "How do I change or delete my comments?",

    answer:
      "Open the menu next to your comment to edit or delete it. You can also review your comments from Profile > My Comments.",
  },

  {
    question: "Are nutrition values exact?",

    answer:
      "Nutrition information may be estimated and can vary depending on ingredients, brands, serving sizes, and preparation methods.",
  },

  {
    question: "How do I report a problem with a recipe?",

    answer:
      "Use Report recipe on the recipe page. You can also report comments, reviews or users through their menus. For a general support or privacy question, contact admin@getpickleapp.com.",
  },
]
