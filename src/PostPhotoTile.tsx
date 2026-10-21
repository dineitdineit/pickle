import RecipeImage from "./RecipeImage"

import { orderedPhotos, postAuthorName, type PhotoPost } from "./lib/postFeed"

function MultiplePhotosIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="14" height="14" rx="3" />
      <path d="M7 3h11a3 3 0 0 1 3 3v11" />
    </svg>
  )
}

export default function PostPhotoTile({
  post,

  showAuthor = false,

  onOpen,
}: {
  post: PhotoPost

  showAuthor?: boolean

  onOpen: (id: string) => void
}) {
  const photo = orderedPhotos(post)[0]

  const name = postAuthorName(post)

  return (
    <button
      type="button"
      className="post-photo-tile"
      onClick={() => onOpen(post.id)}
      aria-label={`Open post by ${name}${
        post.caption ? `: ${post.caption.slice(0, 80)}` : ""
      }${post.recipe_tag ? ` · Tagged recipe: ${post.recipe_tag.title}` : ""}`}
    >
      <div className="post-tile-image">
        <RecipeImage src={photo?.image_path} alt="" loading="lazy" />
        {post.recipe_tag && (
          <span className="post-tile-recipe-tag" title={post.recipe_tag.title}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M20 13 13 20a2 2 0 0 1-3 0L3 13V3h10l7 7a2 2 0 0 1 0 3Z" />
              <circle cx="7.5" cy="7.5" r="1" />
            </svg>
            <span>{post.recipe_tag.title}</span>
          </span>
        )}
        {post.photos.length > 1 && (
          <span
            className="post-multiple-badge"
            aria-label={`${post.photos.length} photos`}
          >
            <MultiplePhotosIcon />
          </span>
        )}
      </div>
      {showAuthor && (
        <span className="post-tile-author">
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt="" loading="lazy" />
          ) : (
            <span className="post-avatar-placeholder">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span>{name}</span>
        </span>
      )}
    </button>
  )
}
