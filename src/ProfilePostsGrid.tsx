import PostPhotoTile from "./PostPhotoTile"
import usePhotoPosts from "./usePhotoPosts"

export default function ProfilePostsGrid({
  authorId,
  userId,
  onOpen,
}: {
  authorId: string
  userId: string | null
  onOpen: (id: string) => void
}) {
  const feed = usePhotoPosts({ authorId, viewerId: userId, pageSize: 18 })
  return (
    <div className="profile-photo-posts">
      {feed.loading ? (
        <p className="user-profile-empty" role="status">
          Loading posts…
        </p>
      ) : (
        <>
          <div className="profile-post-grid">
            {feed.rows.map((post) => (
              <PostPhotoTile key={post.id} post={post} onOpen={onOpen} />
            ))}
          </div>
          {!feed.rows.length && !feed.error && (
            <p className="user-profile-empty">No photo posts yet.</p>
          )}
        </>
      )}
      {feed.error && (
        <div className="user-profile-empty" role="alert">
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
          className="user-profile-more"
          disabled={feed.loadingMore}
          onClick={() => void feed.loadMore()}
        >
          {feed.loadingMore ? "Loading…" : "Load more posts"}
        </button>
      )}
    </div>
  )
}
