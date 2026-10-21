import ViewIcon from "./ViewIcon"
import "./recipe-view-overlay.css"

export default function RecipeViewOverlay({ count }: { count: number }) {
  return (
    <span
      className="recipe-view-overlay"
      aria-label={`${count.toLocaleString()} views`}
    >
      <ViewIcon size={10} />
      {count.toLocaleString()}
    </span>
  )
}
