import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { supabase } from "./lib/supabase"
import { type Review, type useRecipeReviews } from "./lib/reviews"
import "./reviews.css"

export function ReviewStars({
  value,
  size = 18,
}: {
  value: number
  size?: number
}) {
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          fill={Math.max(0, Math.min(1, value - star + 1))}
          size={size}
        />
      ))}
    </span>
  )
}
function Star({ fill, size = 32 }: {
  fill: number
  size?: number
}) {
  return (
    <span
      className="review-star"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="m12 2.5 2.9 6 6.6.9-4.8 4.7 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6L2.5 9.4l6.6-.9z" />
      </svg>
      <span style={{ width: `${fill * 100}%` }}>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ width: size, height: size }}
        >
          <path d="m12 2.5 2.9 6 6.6.9-4.8 4.7 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6L2.5 9.4l6.6-.9z" />
        </svg>
      </span>
    </span>
  )
}

type Props = {
  recipeId: string
  onRequireLogin: () => void
  data: ReturnType<typeof useRecipeReviews>
}
export default function RecipeReviews({
  recipeId,
  onRequireLogin,
  data,
}: Props) {
  const { summary, reviews, ownReview, userId, loading, error, reload } = data
  const [editor, setEditor] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const writeButton = useRef<HTMLButtonElement>(null)
  const mutation = useRef(false)
  useEffect(() => {
    if (confirmDelete) dialog.current?.showModal()
  }, [confirmDelete])
  useEffect(() => {
    setEditor(false)
    setConfirmDelete(false)
    setMessage("")
    setSuccess("")
  }, [recipeId, userId])

  function begin(value?: number) {
    if (!userId) {
      onRequireLogin()
      return
    }
    setRating(value ?? ownReview?.rating ?? 0)
    setText(ownReview?.content ?? "")
    setMessage("")
    setSuccess("")
    setEditor(true)
  }
  async function save() {
    if (!userId) {
      onRequireLogin()
      return
    }
    if (mutation.current || rating < 1 || rating > 5) return
    mutation.current = true
    setBusy(true)
    setMessage("")
    try {
      const values = { rating, content: text.trim() }
      const result = ownReview
        ? await supabase
            .from("recipe_reviews")
            .update(values)
            .eq("id", ownReview.id)
            .eq("user_id", userId)
            .select("id,rating,content")
            .single()
        : await supabase
            .from("recipe_reviews")
            .insert({ ...values, recipe_id: recipeId, user_id: userId })
            .select("id,rating,content")
            .single()
      if (result.error || !result.data)
        throw result.error ?? new Error("No saved review")
      setEditor(false)
      setSuccess(
        ownReview
          ? "Your rating has been updated."
          : "Thanks for rating this recipe!",
      )
      reload()
      writeButton.current?.focus()
    } catch (err: any) {
      console.error("Failed to save review", err)
      if (err?.code === "23505") {
        reload()
        setMessage(
          "You already rated this recipe. Close this form and edit your rating.",
        )
      } else setMessage("Could not save your rating. Please try again.")
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }
  async function remove() {
    if (!ownReview || !userId || mutation.current) return
    mutation.current = true
    setBusy(true)
    setMessage("")
    try {
      const result = await supabase
        .from("recipe_reviews")
        .delete()
        .eq("id", ownReview.id)
        .eq("user_id", userId)
        .select("id")
        .single()
      if (result.error || !result.data)
        throw result.error ?? new Error("Review was not deleted")
      setConfirmDelete(false)
      setEditor(false)
      setSuccess("Your rating has been deleted.")
      reload()
    } catch (err) {
      console.error("Failed to delete review", err)
      setMessage("Could not delete your rating. Please try again.")
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }
  function card(review: Review, own = false) {
    const name =
      review.profiles?.display_name ||
      review.profiles?.username ||
      "Pickle user"
    return (
      <article className="review-card" key={review.id}>
        <div className="review-author">
          {review.profiles?.avatar_url ? (
            <img src={review.profiles.avatar_url} alt="" />
          ) : (
            <span className="review-avatar">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="comment-author-name">
            {own ? "Your review" : name}
          </span>
        </div>
        <div className="review-meta">
          <ReviewStars value={review.rating} size={16} />
          <time dateTime={review.updated_at}>
            {new Date(review.updated_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
        {review.content && <p className="review-content">{review.content}</p>}
        {own && (
          <div className="review-own-actions">
            <button
              type="button"
              className="review-delete"
              disabled={busy || loading}
              onClick={() => {
                setMessage("")
                setConfirmDelete(true)
              }}
            >
              Delete
            </button>
          </div>
        )}
      </article>
    )
  }

  return (
    <section
      id="recipe-reviews"
      className="recipe-reviews"
      aria-labelledby="reviews-heading"
    >
      <h2 id="reviews-heading">Ratings &amp; reviews</h2>
      {error ? (
        <div role="alert" className="review-error">
          {error} <button onClick={reload}>Retry</button>
        </div>
      ) : (
        <>
          <div className="review-summary" aria-busy={loading}>
            <div className="review-score">
              <strong>
                {summary.total ? summary.average.toFixed(1) : "—"}
              </strong>
              <ReviewStars value={summary.average} />
              <span>
                {loading && !summary.total
                  ? "Loading ratings…"
                  : `${summary.total.toLocaleString()} ${
                      summary.total === 1 ? "rating" : "ratings"
                    }`}
              </span>
            </div>
            <div className="review-distribution">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="review-bar-row">
                  <span>{star}</span>
                  <div
                    role="meter"
                    aria-label={`${star} star ratings`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(summary.total, 1)}
                    aria-valuenow={summary.distribution[star - 1]}
                    aria-valuetext={`${summary.distribution[star - 1]} ratings`}
                  >
                    <span
                      style={{
                        width: `${
                          summary.total
                            ? (summary.distribution[star - 1] / summary.total) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!loading && !summary.total && (
            <p className="review-muted">
              No ratings yet. Be the first to rate this recipe.
            </p>
          )}
          {ownReview && !editor && card(ownReview, true)}
          {!editor && !ownReview && (
            <div className="review-rate-prompt">
              <h3>Rate this recipe</h3>
              <p className="review-muted">
                Share your experience with other cooks.
              </p>
              <div className="review-picker">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={loading}
                    aria-label={`Rate ${star} ${star === 1 ? "star" : "stars"}`}
                    onClick={() => begin(star)}
                  >
                    <Star fill={0} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {!editor && (
            <button
              type="button"
              ref={writeButton}
              className="review-outline"
              disabled={loading || busy}
              onClick={() => begin()}
            >
              {ownReview ? "Edit your rating" : "Write a review"}
            </button>
          )}
          {editor && (
            <form
              className="review-editor"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <h3>{ownReview ? "Edit your rating" : "Rate this recipe"}</h3>
              <div
                className="review-picker"
                role="radiogroup"
                aria-label="Your rating"
                onMouseLeave={() => setHover(0)}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                    disabled={busy}
                    onMouseEnter={() => setHover(star)}
                    onFocus={() => setHover(0)}
                    onClick={() => setRating(star)}
                    onKeyDown={(event) => {
                      if (
                        [
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowLeft",
                          "ArrowDown",
                          "Home",
                          "End",
                        ].includes(event.key)
                      ) {
                        event.preventDefault()
                        const next =
                          event.key === "Home"
                            ? 1
                            : event.key === "End"
                              ? 5
                              : Math.max(
                                  1,
                                  Math.min(
                                    5,
                                    star +
                                      (["ArrowRight", "ArrowUp"].includes(
                                        event.key,
                                      )
                                        ? 1
                                        : -1),
                                  ),
                                )
                        setRating(next)
                        const buttons =
                          event.currentTarget.parentElement?.querySelectorAll(
                            "button",
                          )
                        buttons?.[next - 1]?.focus()
                      }
                    }}
                  >
                    <Star fill={star <= (hover || rating) ? 1 : 0} />
                  </button>
                ))}
              </div>
              <label htmlFor="review-content">
                Your review <span className="review-muted">(optional)</span>
              </label>
              <textarea
                id="review-content"
                className="comment-textarea"
                placeholder="Tell us how it turned out…"
                rows={4}
                maxLength={2000}
                disabled={busy}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <p className="review-muted review-character-count">
                {text.length}/2,000
              </p>
              {message && (
                <p role="alert" className="review-error">
                  {message}
                </p>
              )}
              <div className="review-form-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditor(false)
                    setMessage("")
                    writeButton.current?.focus()
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="review-primary"
                  disabled={busy || loading || !rating}
                >
                  {busy ? "Saving…" : ownReview ? "Save" : "Post"}
                </button>
              </div>
            </form>
          )}
          {success && (
            <p role="status" className="review-muted">
              {success}
            </p>
          )}
          <div className="review-list">
            {reviews
              .filter((review) => review.id !== ownReview?.id)
              .map((review) => card(review))}
          </div>
          {summary.written > reviews.length && (
            <button
              className="review-outline"
              disabled={loading}
              onClick={data.loadMore}
            >
              {loading ? "Loading…" : "See more reviews"}
            </button>
          )}
        </>
      )}
      {confirmDelete &&
        createPortal(
          <dialog
            ref={dialog}
            className="review-delete-dialog"
            aria-labelledby="review-delete-heading"
            onCancel={(event) => {
              if (busy) event.preventDefault()
              else setConfirmDelete(false)
            }}
          >
            <h2 id="review-delete-heading">Delete your rating?</h2>
            <p className="review-muted">
              Your star rating and review will be removed. This cannot be
              undone.
            </p>
            {message && (
              <p role="alert" className="review-error">
                {message}
              </p>
            )}
            <div className="review-form-actions">
              <button
                autoFocus
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="review-primary review-danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </dialog>,
          document.body,
        )}
    </section>
  )
}
