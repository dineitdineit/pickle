import PostPhotoTile from "./PostPhotoTile"
import type { PhotoPost } from "./lib/postFeed"
import "./photo-posts.css"

export default function HomePostsSection({
  posts,
  loading,
  error,
  onRetry,
  onOpen,
  onSeeAll,
  onCreate,
}: {
  posts: PhotoPost[]
  loading: boolean
  error: string
  onRetry: () => void
  onOpen: (id: string) => void
  onSeeAll: () => void
  onCreate: () => void
}) {
  return (
    <section className="home-posts-section" aria-label="From kitchens">
      <header>
        <div>
          <h2>From kitchens</h2>
          <p>A little of what’s cooking.</p>
        </div>
        <button type="button" onClick={onSeeAll}>
          See all <span aria-hidden="true">›</span>
        </button>
      </header>
      {loading ? (
        <div className="home-posts-loading" role="status">
          Loading kitchen moments…
        </div>
      ) : error ? (
        <div className="home-posts-empty" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : posts.length ? (
        <div className="home-posts-strip">
          {posts.slice(0, 4).map((post) => (
            <PostPhotoTile
              key={post.id}
              post={post}
              showAuthor
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="home-posts-empty">
          <p>What’s on your plate today?</p>
          <button type="button" onClick={onCreate}>
            Share a photo
          </button>
        </div>
      )}
    </section>
  )
}
