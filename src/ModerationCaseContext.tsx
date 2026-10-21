import RecipeImage from "./RecipeImage"

import MessagePhoto from "./MessagePhoto"

interface ContextStep {
  step_number: number

  instruction: string

  step_image: string | null
}

interface ContextIngredient {
  name: string

  amount: number

  unit: string

  substitute: string | null
}

import { useRef, useState } from "react"

import { supabase } from "./lib/supabase"

import { recipeImageUrl } from "./lib/recipe"

interface CaseContext {
  images?: string[]

  case_id: string

  type: string

  target: Record<string, unknown> | null

  recipe: {
    title: string

    description: string | null

    cover_image: string | null

    ingredients_image: string | null

    steps: ContextStep[]

    ingredients: ContextIngredient[]
  } | null
}

export default function ModerationCaseContext({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseContext | null>(null)

  const [error, setError] = useState("")

  const [busy, setBusy] = useState(false)

  const [media, setMedia] = useState(false)

  const guard = useRef(false)

  async function loadContext() {
    if (guard.current) return

    guard.current = true

    setBusy(true)

    setError("")

    try {
      const { data: result, error: failure } = await supabase.rpc(
        "get_moderation_case_context",

        { p_case: caseId },
      )

      if (failure || result?.case_id !== caseId)
        throw new Error("Could not load this case's current content.")

      setData(result)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not load content.",
      )
    } finally {
      guard.current = false

      setBusy(false)
    }
  }

  const contextImages = data?.recipe
    ? [
        data.recipe.cover_image,

        data.recipe.ingredients_image,

        ...data.recipe.steps.map((step) => step.step_image),
      ]

        .filter((path): path is string => typeof path === "string" && !!path)

        .map(recipeImageUrl)
    : typeof data?.target?.avatar_url === "string" &&
        /^https?:\/\//.test(data.target.avatar_url)
      ? [data.target.avatar_url]
      : []

  const images = Array.from(
    new Set([...contextImages, ...(data?.images ?? [])]),
  )

  return (
    <details className="moderation-case-context">
      <summary>Reported content and context</summary>
      <button type="button" disabled={busy} onClick={() => void loadContext()}>
        {busy ? "Loading…" : "Load current context"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          {data.target && <pre>{JSON.stringify(data.target, null, 2)}</pre>}
          {data.recipe && (
            <>
              <h4>{data.recipe.title}</h4>
              <p>{data.recipe.description}</p>
              <ul>
                {data.recipe.ingredients.map((ingredient, index) => (
                  <li key={index}>
                    {ingredient.name}: {ingredient.amount} {ingredient.unit}
                    {ingredient.substitute ? ` · ${ingredient.substitute}` : ""}
                  </li>
                ))}
              </ul>
              {data.recipe.steps.map((step) => (
                <p key={step.step_number}>
                  {step.step_number}. {step.instruction}
                </p>
              ))}
            </>
          )}
          {!data.recipe && !data.target && (
            <p>
              The original content may have been deleted. Review retained report
              evidence.
            </p>
          )}
          {!!images.length && (
            <>
              <p>
                Reported media is concealed until you choose to review it. Do
                not download or redistribute suspected illegal material.
              </p>
              <button type="button" onClick={() => setMedia((value) => !value)}>
                {media ? "Conceal media" : "Reveal media for review"}
              </button>
              {media &&
                images.map((image, index) =>
                  image.startsWith("chat:") ? (
                    <MessagePhoto
                      key={image}
                      path={image.slice(5)}
                      onLoad={() => {}}
                    />
                  ) : (
                    <RecipeImage
                      key={`${image}:${index}`}
                      src={image}
                      alt={`Reported media ${index + 1}`}
                      style={{
                        maxWidth: "100%",

                        maxHeight: 320,

                        objectFit: "contain",
                      }}
                    />
                  ),
                )}
            </>
          )}
        </>
      )}
    </details>
  )
}
