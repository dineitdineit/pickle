import { VideoBadge } from "./RecipeVideo"
import { formatTime } from "./lib/format"
import { useState } from "react"

const PAGE_SIZE = 8

type TagRecipe = {
  id: string
  title: string
  difficulty: string
  total_time_minutes: number
  video_url?: string | null
  image: string
}

interface TagRecipeListScreenProps {
  title: string
  recipes: TagRecipe[]
  onBack: () => void
  onSelectRecipe: (id: string) => void
}

export default function TagRecipeListScreen({
  title,
  recipes,
  onBack,
  onSelectRecipe,
}: TagRecipeListScreenProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visible = recipes.slice(0, visibleCount)
  const remaining = Math.max(0, recipes.length - visibleCount)

  return (
    <div className="bg-white min-h-screen max-w-md mx-auto pb-10">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={onBack}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "#F9F9F9", border: "1.5px solid #EAEAEA" }}
          aria-label="Back"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1F1F1F"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <h1 className="font-semibold text-[22px]" style={{ color: "#1F1F1F" }}>
          {title}
        </h1>
      </div>

      <div className="px-4 mb-4">
        <p className="text-[18px] font-semibold" style={{ color: "#1F1F1F" }}>
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
        </p>
      </div>

      {visible.length > 0 ? (
        <div className="web-result-grid px-4 flex flex-col">
          {visible.map((recipe, i) => (
            <button
              key={recipe.id}
              onClick={() => onSelectRecipe(recipe.id)}
              className="flex items-center gap-4 py-3.5 w-full text-left active:bg-gray-50"
              style={{
                borderBottom:
                  i < visible.length - 1 ? "1px solid #EAEAEA" : undefined,
              }}
            >
              <div
                className="flex-shrink-0 rounded-[12px] overflow-hidden bg-gray-100"
                style={{ width: 64, height: 64, position: "relative" }}
              >
                <VideoBadge url={recipe.video_url} />
              <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="font-semibold text-[18px] leading-snug truncate"
                  style={{ color: "#1F1F1F" }}
                >
                  {recipe.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span
                    className="text-[15px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#F5F5F5", color: "#6F6F6F" }}
                  >
                    Filipino
                  </span>
                  <span
                    className="text-[15px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#F5F5F5", color: "#6F6F6F" }}
                  >
                    {recipe.difficulty}
                  </span>
                  <span className="text-[15px]" style={{ color: "#6F6F6F" }}>
                    {formatTime(recipe.total_time_minutes)}
                  </span>
                </div>
              </div>

              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C7C7C7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <p
            className="font-semibold text-[19px] mb-1"
            style={{ color: "#1F1F1F" }}
          >
            No recipes yet
          </p>
        </div>
      )}

      {remaining > 0 && (
        <div className="px-4 mt-6">
          <button
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="w-full h-12 rounded-[12px] text-[18px] font-medium"
            style={{
              backgroundColor: "#F9F9F9",
              border: "1.5px solid #EAEAEA",
              color: "#1F1F1F",
            }}
          >
            Show {remaining} more
          </button>
        </div>
      )}
    </div>
  )
}
