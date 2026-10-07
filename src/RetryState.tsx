type RetryStateProps = {
  title?: string
  message?: string
  onRetry: () => void
  compact?: boolean
}

export default function RetryState({
  title = "Something went wrong",
  message = "We couldn't load this right now. Please try again.",
  onRetry,
  compact = false,
}: RetryStateProps) {
  return (
    <div className={compact ? "px-4 py-3" : "px-6 py-16"}>
      <div
        className="rounded-[18px] border px-5 py-6 text-center"
        style={{ borderColor: "#EAEAEA", backgroundColor: "#FFFFFF" }}
      >
        <div
          className="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ backgroundColor: "#FFF0E6", color: "#F26B21" }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3.2-6.9" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </div>

        <p className="font-semibold text-[16px]" style={{ color: "#1F1F1F" }}>
          {title}
        </p>
        <p
          className="text-[13px] leading-5 mt-1.5"
          style={{ color: "#6F6F6F" }}
        >
          {message}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="h-10 px-5 rounded-[12px] mt-4 text-[14px] font-semibold text-white"
          style={{ backgroundColor: "#F26B21" }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
