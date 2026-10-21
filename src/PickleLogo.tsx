type PickleLogoProps = {
  size?: number
  iconSize?: number
  stacked?: boolean
}
/** Shared Pickle wordmark: keep the orange dot with the name at every size. */
export default function PickleLogo({
  size = 28,
  iconSize,
  stacked = false,
}: PickleLogoProps) {
  return (
    <span
      aria-label="Pickle"
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexDirection: stacked ? "column" : "row",
        gap: stacked ? 12 : 10,
        flexShrink: 0,
      }}
    >
      {iconSize && (
        <img
          src="/assets/logo.png"
          alt=""
          width={iconSize}
          height={iconSize}
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconSize * 0.3,
            objectFit: "cover",
          }}
        />
      )}
      <span
        aria-hidden="true"
        style={{
          color: "var(--color-ink)",
          fontSize:
            size <= 22
              ? "var(--text-section)"
              : size <= 26
                ? "var(--text-title)"
                : size <= 29
                  ? "var(--text-page)"
                  : size <= 33
                    ? "var(--text-hero)"
                    : "var(--text-display)",
          fontWeight: 700,
          letterSpacing: `${(-1.3 / 28) * size}px`,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
        }}
      >
        Pickle<span style={{ color: "var(--color-primary)" }}>.</span>
      </span>
    </span>
  )
}
