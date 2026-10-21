import RecipeImage from "./RecipeImage"

import { VideoBadge } from "./RecipeVideo"

import RecipeViewOverlay from "./RecipeViewOverlay"

import { useRef } from "react"

import { formatTime } from "./lib/format"

type RecipeCard = {
  id: string

  title: string

  difficulty: string

  total_time_minutes: number

  servings: number | null

  video_url?: string | null

  cover_image: string | null

  image: string

  view_count: number
}

export default function RecipeStrip({
  title,

  recipes,

  onSelectRecipe,

  onSeeMore,
}: {
  title: string

  recipes: RecipeCard[]

  onSelectRecipe: (id: string) => void

  onSeeMore: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const startX = useRef<number | null>(null)

  const startScrollLeft = useRef(0)

  const dragging = useRef(false)

  const didDrag = useRef(false)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current

    if (!el || e.button !== 0) return

    didDrag.current = false

    if (e.pointerType !== "mouse") return

    dragging.current = true

    startX.current = e.clientX

    startScrollLeft.current = el.scrollLeft
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current

    if (!el || !dragging.current || startX.current === null) return

    const deltaX = e.clientX - startX.current

    if (Math.abs(deltaX) > 5) {
      didDrag.current = true

      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId)
    }

    el.scrollLeft = startScrollLeft.current - deltaX
  }

  function finishDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)

    dragging.current = false

    startX.current = null

    window.setTimeout(() => {
      didDrag.current = false
    }, 0)
  }

  return (
    <section className="mb-8">
      <div className="px-4 mb-3 flex items-end justify-between gap-3">
        <h2
          className="font-semibold text-section leading-none"
          style={{ color: "var(--color-ink)" }}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onSeeMore}
          className="flex-shrink-0 text-body font-medium leading-none pb-[1px]"
          style={{ color: "var(--color-gray)" }}
        >
          See more &gt;
        </button>
      </div>
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className="flex items-start gap-3 px-4 overflow-x-auto scrollbar-hide pb-1 cursor-grab active:cursor-grabbing"
        style={{
          touchAction: "pan-x pan-y pinch-zoom",

          WebkitOverflowScrolling: "touch",

          overscrollBehaviorX: "contain",
        }}
      >
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => {
              if (!didDrag.current) onSelectRecipe(recipe.id)
            }}
            className="flex-none w-[148px] text-left self-start"
          >
            <div className="relative w-[148px] h-[148px] rounded-[12px] overflow-hidden mb-1.5 bg-gray-100">
              <VideoBadge url={recipe.video_url} />
              <RecipeImage
                src={recipe.image}
                alt={recipe.title}
                className="w-full h-full object-cover block"
                draggable={false}
              />
              <RecipeViewOverlay count={recipe.view_count} />
            </div>
            <p
              className="font-semibold text-lead leading-[21px] min-h-[21px] line-clamp-2"
              style={{ color: "var(--color-ink)" }}
            >
              {recipe.title}
            </p>
            <p
              className="text-body mt-0.5"
              style={{ color: "var(--color-gray)" }}
            >
              {recipe.difficulty} · {formatTime(recipe.total_time_minutes)}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}
