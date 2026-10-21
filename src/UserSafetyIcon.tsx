interface Props {
  kind: "block" | "report"
}
export default function UserSafetyIcon({ kind }: Props) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-7a8 8 0 1 1 18-3Z" />
      {kind === "block" ? (
        <path d="M3 3l18 18" />
      ) : (
        <>
          <path d="M11 7v5" />
          <circle cx="11" cy="15.5" r=".8" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}
