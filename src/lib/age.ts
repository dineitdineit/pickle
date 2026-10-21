const MINIMUM_ACCOUNT_AGE = 13

const AGE_RULE_VERSION = "13-plus-guardian-v1"

/** Neutral birthday entry; no date is cached or added to Auth user metadata. */

export function isEligibleBirthday(
  value: string,

  today = new Date(),

  minimumAge = MINIMUM_ACCOUNT_AGE,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return false

  const day = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )

  const cutoff = new Date(day)

  cutoff.setUTCFullYear(day.getUTCFullYear() - minimumAge)

  // Clamp Feb 29 to Feb 28 when the cutoff year is not a leap year.

  if (cutoff.getUTCMonth() !== day.getUTCMonth()) cutoff.setUTCDate(0)

  return date <= cutoff && day.getUTCFullYear() - date.getUTCFullYear() <= 120
}

export function requiresGuardian(value: string, today = new Date()) {
  return (
    isEligibleBirthday(value, today) && !isEligibleBirthday(value, today, 14)
  )
}

export interface AccountAgeStatus {
  user_id: string

  eligible: boolean

  minimum_age: number

  rule_version: string

  guardian_required: boolean

  guardian_status: "not_required" | "not_requested" | "pending" | "approved" | "declined" | "revoked"

  guardian_request_id: string | null

  guardian_policy_version: string | null
}

export function checkedAgeStatus(
  value: unknown,

  userId: string,
): AccountAgeStatus {
  const state = value as AccountAgeStatus | null

  if (
    !state ||
    state.user_id !== userId ||
    state.rule_version !== AGE_RULE_VERSION ||
    state.minimum_age !== MINIMUM_ACCOUNT_AGE ||
    typeof state.eligible !== "boolean" ||
    typeof state.guardian_required !== "boolean" ||
    ![
      "not_required",

      "not_requested",

      "pending",

      "approved",

      "declined",

      "revoked",
    ].includes(state.guardian_status) ||
    (state.guardian_required &&
      state.eligible &&
      state.guardian_status !== "approved")
  )
    throw new Error("Could not check your account eligibility. Please retry.")

  const hasRequest = ["pending", "approved", "declined", "revoked"].includes(
    state.guardian_status,
  )

  if (
    hasRequest
      ? !state.guardian_required ||
        typeof state.guardian_request_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          state.guardian_request_id,
        ) ||
        typeof state.guardian_policy_version !== "string" ||
        !state.guardian_policy_version
      : state.guardian_request_id !== null ||
        state.guardian_policy_version !== null ||
        state.guardian_required !== (state.guardian_status === "not_requested")
  )
    throw new Error("Invalid guardian eligibility response.")

  return state
}

export function guardianEmailBody(requestId: string, version: string) {
  return `Guardian consent request: ${requestId}\nPolicy version: ${version}\n\nTo be completed and sent by the parent or legal guardian from their own email address.\n\nMy name:\nMy relationship to the account holder:\n\nI confirm that I am an adult parent or legal guardian authorised to give consent for the 13-year-old account holder identified by this request number. I have read the current Pickle Privacy Policy, Terms and Content Policy supplied with this request. I consent to the account's personal-data processing for registration, profiles, publishing photos/recipes, comments/reviews, follows and private messages/photos as described in that notice. I understand that published content is public, other users may contact the account, and copies may be retained by recipients. I understand the retention/deletion rules and that I can contact admin@getpickleapp.com to request withdrawal or exercise the child's rights.\n\nI agree: [write YES or NO]\n\nPlease do not attach government IDs or the child's full birth date. Pickle may contact me to clarify my authority and consent before approving the request.`
}
