import PostPhotoTile from "./PostPhotoTile"
import usePhotoPosts from "./usePhotoPosts"
import "./photo-posts.css"
interface Props {
  recipeId: string
  userId: string | null
  onOpen: (postId?: string) => void
}
export default function RecipeTaggedPosts({ recipeId, userId, onOpen }: Props) {
  const feed = usePhotoPosts({ recipeId, viewerId: userId, pageSize: 6 })
  // Loading and a confirmed empty result occupy no space in the recipe layout.
  if (!feed.rows.length) {
    if (feed.error)
      return (
        <div className="recipe-tagged-posts-error" role="alert">
          <span>Couldn’t load photo feedback.</span>
          <button type="button" onClick={feed.reload}>
            Retry
          </button>
        </div>
      )
    return null
  }
  return (
    <section className="recipe-tagged-posts" aria-label="Made this recipe">
      <header>
        <h2>Made this recipe</h2>
        {feed.hasMore && (
          <button type="button" onClick={() => onOpen()}>
            See all ›
          </button>
        )}
      </header>
      <div className="recipe-tagged-post-grid">
        {feed.rows.map((post) => (
          <PostPhotoTile key={post.id} post={post} showAuthor onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
