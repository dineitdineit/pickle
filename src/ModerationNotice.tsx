export interface ModerationDetails {
  type: "recipe" | "review" | "comment" | "post" | "post_comment" | "message" | "account" | "appeal" | "report_result"
  action: string
  title?: string
  reason: string
  message: string
}
interface Props {
  details: ModerationDetails | null
  createdAt: string
  unread: boolean
}
export default function ModerationNotice({
  details,
  createdAt,
  unread,
}: Props) {
  return (
    <article
      className={`social-person social-moderation-notice${
        unread ? " is-unread" : ""
      }`}
    >
      <span className="social-avatar social-moderation-icon" aria-hidden="true">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M12 3 22 21H2L12 3Z" />
          <path d="M12 9v5" />
          <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <div className="social-moderation-text">
        <strong>Moderation notice</strong>
        <p>
          {details?.message ?? "Your content received a moderation action."}
        </p>
        {details?.reason && (
          <p className="social-moderation-reason">Reason: {details.reason}</p>
        )}
        <small>{new Date(createdAt).toLocaleString()}</small>
      </div>
    </article>
  )
}
