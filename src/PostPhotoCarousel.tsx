import { useRef, useState } from "react"
import RecipeImage from "./RecipeImage"
import type { PostPhoto } from "./lib/postFeed"

export default function PostPhotoCarousel({ photos }: { photos: PostPhoto[] }) {
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const current = Math.min(index, Math.max(0, photos.length - 1))
  function go(next: number) {
    if (!track.current) return
    track.current.scrollTo({
      left:
        Math.max(0, Math.min(photos.length - 1, next)) *
        track.current.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    })
  }
  return (
    <div className="post-carousel-shell">
      <div
        ref={track}
        className="post-photo-carousel"
        role="region"
        aria-label="Post photos"
        aria-roledescription="carousel"
        tabIndex={photos.length > 1 ? 0 : -1}
        onScroll={(event) => {
          const node = event.currentTarget
          if (node.clientWidth)
            setIndex(Math.round(node.scrollLeft / node.clientWidth))
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault()
            go(current + (event.key === "ArrowLeft" ? -1 : 1))
          }
        }}
      >
        {photos.map((photo, i) => (
          <figure
            key={photo.id}
            role="group"
            aria-label={`Photo ${i + 1} of ${photos.length}`}
          >
            <RecipeImage
              src={photo.image_path}
              alt={`Photo ${i + 1} of ${photos.length}`}
              loading={i ? "lazy" : "eager"}
              draggable={false}
            />
          </figure>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <span
            className="post-photo-position"
            aria-live="polite"
            aria-atomic="true"
          >
            {current + 1} / {photos.length}
          </span>
          <button
            type="button"
            className="post-carousel-arrow post-carousel-previous"
            aria-label="Previous photo"
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="post-carousel-arrow post-carousel-next"
            aria-label="Next photo"
            disabled={current === photos.length - 1}
            onClick={() => go(current + 1)}
          >
            ›
          </button>
          <div className="post-photo-dots" aria-label="Choose a photo">
            {photos.map((photo, i) => (
              <button
                type="button"
                key={photo.id}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === current ? "true" : undefined}
                onClick={() => go(i)}
              >
                <span />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
