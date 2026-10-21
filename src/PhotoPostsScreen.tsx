import BackIcon from "./BackIcon"
import PhotoPostCard from "./PhotoPostCard"
import usePhotoPosts from "./usePhotoPosts"
import "./photo-posts.css"
import { useRef, useState, type ReactNode } from "react"

interface Props {
  authorId?: string
  recipeId?: string
  postId?: string
  initialCommentId?: string
  userId: string | null
  onBack: () => void
  renderAuthor?: (id: string, onBack: () => void) => ReactNode
  onChanged?: () => void
  onCreate?: () => void
  navigation?: ReactNode
  onSelectRecipe?: (id: string) => void
  onOpenAuthor?: (id: string) => void
}
export default function PhotoPostsScreen({
  authorId,
  recipeId,
  postId,
  initialCommentId,
  userId,
  onBack,
  renderAuthor,
  onChanged,
  onCreate,
  navigation,
  onSelectRecipe,
  onOpenAuthor,
}: Props) {
  const feed = usePhotoPosts({ authorId, recipeId, postId, viewerId: userId })
  const [profileId, setProfileId] = useState<string | null>(null)
  const scroll = useRef(0)
  return (
    <>
      <section className="photo-post-screen post-feed" hidden={!!profileId}>
        <header className="post-topbar">
          <button type="button" aria-label="Back" onClick={onBack}>
            <BackIcon />
          </button>
          <h1>
            {postId
              ? "Post"
              : recipeId
                ? "Made this recipe"
                : authorId
                  ? "Posts"
                  : "From kitchens"}
          </h1>
          <span />
        </header>
        {feed.loading ? (
          <p className="post-feed-empty" role="status">
            Loading kitchen moments…
          </p>
        ) : (
          <>
            {feed.rows.map((post) => (
              <PhotoPostCard
                key={post.id}
                post={post}
                initialCommentId={
                  post.id === postId ? initialCommentId : undefined
                }
                userId={userId}
                onSelectRecipe={onSelectRecipe}
                onOpenAuthor={
                  renderAuthor
                    ? (id) => {
                        scroll.current = window.scrollY
                        setProfileId(id)
                        window.scrollTo({ top: 0 })
                      }
                    : onOpenAuthor
                }
                onDeleted={() => {
                  feed.removeLocal(post.id)
                  onChanged?.()
                  if (postId) onBack()
                }}
              />
            ))}
            {!feed.rows.length && !feed.error && (
              <div className="post-feed-empty">
                <h2>
                  {postId ? "Post unavailable" : "A little of what’s cooking"}
                </h2>
                <p>
                  {postId
                    ? "This post may have been deleted or is no longer available."
                    : "Photos, small discoveries and everyday meals from the Pickle community."}
                </p>
                {!postId && onCreate && (
                  <button
                    type="button"
                    className="post-empty-create"
                    onClick={onCreate}
                  >
                    Share a photo
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {feed.error && (
          <div role="alert" className="post-error">
            <p>{feed.error}</p>
            <button
              type="button"
              onClick={
                feed.rows.length ? () => void feed.loadMore() : feed.reload
              }
            >
              Try again
            </button>
          </div>
        )}
        {feed.hasMore && (
          <button
            type="button"
            className="post-feed-more"
            disabled={feed.loadingMore}
            onClick={() => void feed.loadMore()}
          >
            {feed.loadingMore ? "Loading…" : "Load more posts"}
          </button>
        )}
        {navigation}
      </section>
      {profileId &&
        renderAuthor?.(profileId, () => {
          setProfileId(null)
          requestAnimationFrame(() => window.scrollTo({ top: scroll.current }))
        })}
    </>
  )
}
