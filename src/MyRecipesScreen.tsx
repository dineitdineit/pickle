import RecipeImage from "./RecipeImage"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { supabase } from "./lib/supabase"

import { recipeImageUrl } from "./lib/recipe"

import {
  submissionColumns,
  type RecipeTag,
  type Submission,
} from "./lib/submissions"

import RecipeUploadScreen from "./RecipeUploadScreen"

import "./submissions.css"

type Props = {
  userId: string

  startNew: boolean

  onBack: () => void

  onShowList: () => void

  onSelectRecipe: (id: string) => void

  navigation: ReactNode
}

export default function MyRecipesScreen({
  userId,

  startNew,

  onBack,

  onShowList,

  onSelectRecipe,

  navigation,
}: Props) {
  const [rows, setRows] = useState<Submission[]>([])

  const [tags, setTags] = useState<RecipeTag[]>([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [editing, setEditing] = useState<Submission | null>(null)

  const [creating, setCreating] = useState(startNew)

  const [refresh, setRefresh] = useState(0)

  const [limit, setLimit] = useState(50)

  const [count, setCount] = useState(0)

  const [notice, setNotice] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null)

  const [deleting, setDeleting] = useState(false)

  const [deleteError, setDeleteError] = useState("")

  const [listStatus, setListStatus] = useState<"published" | "draft">(
    "published",
  )

  const deleteDialog = useRef<HTMLDialogElement>(null)

  const deleteGuard = useRef(false)

  function changeList(status: "published" | "draft") {
    if (deleteGuard.current) return

    setListStatus(status)

    setRows([])

    setCount(0)

    setLimit(50)

    setNotice("")

    setError("")

    setLoading(true)
  }

  function openRecipe(row: Submission) {
    if (loading || deleting) return

    if (row.published_recipe_id) onSelectRecipe(row.published_recipe_id)
    else setEditing(row)
  }

  useEffect(() => {
    if (deleteTarget) deleteDialog.current?.showModal()
    else deleteDialog.current?.close()
  }, [deleteTarget])

  async function deleteRecipe() {
    if (!deleteTarget || deleteGuard.current) return

    deleteGuard.current = true

    setDeleting(true)

    setDeleteError("")

    try {
      const { data, error } = await supabase.rpc("delete_recipe_submission", {
        p_id: deleteTarget.id,

        p_expected_updated_at: deleteTarget.updated_at,
      })

      if (error || data?.id !== deleteTarget.id || data?.deleted !== true)
        throw error ?? new Error("Deletion was not confirmed")

      try {
        localStorage.removeItem(
          `pickle:recipe-draft:${userId}:${deleteTarget.id}`,
        )
      } catch {
        /* Optional draft cache. */
      }

      setRows((current) => current.filter((row) => row.id !== deleteTarget.id))

      setCount((current) => Math.max(0, current - 1))

      setDeleteTarget(null)

      setNotice("Recipe deleted.")

      onShowList()

      setRefresh((current) => current + 1)
    } catch (error: any) {
      setDeleteError(
        error?.code === "40001"
          ? "This recipe changed. Close this dialog and refresh your recipes before deleting."
          : "Could not delete your recipe. Please try again.",
      )
    } finally {
      deleteGuard.current = false

      setDeleting(false)
    }
  }

  useEffect(() => {
    if (startNew) {
      setEditing(null)

      setCreating(true)
    }
  }, [startNew])

  useEffect(() => {
    let ignore = false

    setLoading(true)

    setError("")

    Promise.all([
      supabase

        .from("recipe_submissions")

        .select(submissionColumns, { count: "exact" })

        .eq("user_id", userId)

        .eq("status", listStatus)

        .order("updated_at", { ascending: false })

        .order("id")

        .range(0, limit - 1),

      supabase

        .from("tags")

        .select("id,name,category")

        .order("category")

        .order("name"),
    ])

      .then(([result, catalog]) => {
        if (ignore) return

        if (result.error || catalog.error) {
          console.error("Failed to load own recipes")

          setError("Could not load your recipes. Please try again.")
        } else {
          setRows((result.data ?? []) as Submission[])

          setTags(catalog.data ?? [])

          setCount(result.count ?? 0)
        }

        setLoading(false)
      })

      .catch(() => {
        if (!ignore) {
          console.error("Operation failed")

          setError("Could not load your recipes. Please try again.")

          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [userId, refresh, limit, listStatus])

  if (loading && !rows.length)
    return (
      <div className="submission-ui my-recipes">
        <p role="status">Loading your recipes…</p>
        {navigation}
      </div>
    )

  if (error)
    return (
      <div className="submission-ui my-recipes">
        <p role="alert">{error}</p>
        <button
          className="submission-secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Retry
        </button>
        <button className="submission-text-button" onClick={onBack}>
          Back
        </button>
        {navigation}
      </div>
    )

  if (creating || editing)
    return (
      <RecipeUploadScreen
        key={editing?.id ?? "new"}
        userId={userId}
        submission={editing}
        tags={tags}
        onBack={() => {
          setCreating(false)

          setEditing(null)

          onShowList()

          setRefresh((value) => value + 1)
        }}
        onSaved={() => {
          setListStatus("published")

          setRows([])

          setCount(0)

          setLimit(50)

          setNotice(
            editing?.status === "published"
              ? "Recipe updated."
              : "업로드 되었습니다.",
          )

          onShowList()

          setCreating(false)

          setEditing(null)

          setRefresh((value) => value + 1)
        }}
      />
    )

  return (
    <div className="submission-ui my-recipes">
      <dialog
        ref={deleteDialog}
        className="wizard-cancel"
        aria-labelledby="delete-recipe-title"
        aria-describedby="delete-recipe-description"
        onCancel={(event) => {
          event.preventDefault()

          if (!deleteGuard.current) setDeleteTarget(null)
        }}
      >
        <h2 id="delete-recipe-title">
          Are you sure you want to delete this recipe?
        </h2>
        <p id="delete-recipe-description" className="submission-muted">
          This cannot be undone.
          {deleteTarget?.status === "published"
            ? " The published recipe and its comments, reviews and saves will be removed."
            : " Your draft will be removed."}
        </p>
        {deleteError && (
          <p role="alert" className="photo-crop-error">
            {deleteError}
          </p>
        )}
        <div className="wizard-cancel-buttons">
          <button
            type="button"
            className="submission-secondary"
            autoFocus
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            Keep recipe
          </button>
          <button
            type="button"
            className="submission-primary"
            disabled={deleting}
            onClick={() => void deleteRecipe()}
          >
            {deleting ? "Deleting…" : "Delete recipe"}
          </button>
        </div>
      </dialog>
      <div className="submission-heading">
        <button
          type="button"
          onClick={() =>
            listStatus === "draft" ? changeList("published") : onBack()
          }
          aria-label={
            listStatus === "draft" ? "Back to my recipes" : "Back to profile"
          }
        >
          ‹
        </button>
        <h1>{listStatus === "draft" ? "Draft" : "My recipes"}</h1>
        {listStatus === "published" && (
          <button
            type="button"
            className="submission-drafts-button"
            disabled={deleting}
            onClick={() => changeList("draft")}
          >
            Draft
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="submission-notice">
          {notice}
        </p>
      )}
      {!rows.length && (
        <div className="submission-empty">
          <h2>
            {listStatus === "draft"
              ? "No drafts yet"
              : "No published recipes yet"}
          </h2>
          <p className="submission-muted">
            {listStatus === "draft"
              ? "Your saved drafts will appear here."
              : "Your published recipes will appear here."}
          </p>
        </div>
      )}
      <div className="submission-own-list">
        {rows.map((row) => (
          <article key={row.id} className="submission-own-card">
            <button
              type="button"
              className="submission-card-open"
              aria-label={`${
                row.published_recipe_id ? "View" : "Edit draft"
              } ${row.payload.title || "Untitled recipe"}`}
              disabled={loading || deleting}
              onClick={() => openRecipe(row)}
            />
            <header className="submission-card-header">
              <span className={`submission-status status-${row.status}`}>
                {{ draft: "Draft", published: "Published" }[row.status]}
              </span>
              <span className="submission-card-controls">
                <button
                  type="button"
                  className="submission-card-icon"
                  aria-label={`Edit ${row.payload.title || "Untitled recipe"}`}
                  title="Edit recipe"
                  disabled={loading || deleting}
                  onClick={() => setEditing(row)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 00-5-5L3 15z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="submission-card-icon"
                  aria-label={`Delete ${row.payload.title || "Untitled recipe"}`}
                  title="Delete recipe"
                  disabled={loading || deleting}
                  onClick={() => {
                    setDeleteError("")

                    setDeleteTarget(row)
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </span>
            </header>
            <div className="submission-card-body">
              {row.payload.cover_image && (
                <RecipeImage
                  src={recipeImageUrl(row.payload.cover_image)}
                  alt={row.payload.title || "Recipe"}
                />
              )}
              <div className="submission-card-details">
                <h2>{row.payload.title || "Untitled recipe"}</h2>
                <p className="submission-muted">
                  Updated {new Date(row.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
      {count > rows.length && (
        <button
          className="submission-secondary"
          disabled={loading}
          onClick={() => setLimit((value) => value + 50)}
        >
          {loading
            ? "Loading…"
            : listStatus === "draft"
              ? "Load more drafts"
              : "Load more recipes"}
        </button>
      )}
      {navigation}
    </div>
  )
}
