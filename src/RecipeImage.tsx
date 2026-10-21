import { useEffect, useState, type ImgHTMLAttributes } from "react"
import { resolveRecipeImageUrl } from "./lib/recipe"
import { supabase } from "./lib/supabase"

/** Private recipe media uses short-lived, policy-checked URLs, including previews. */
export default function RecipeImage({
  src,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [resolved, setResolved] = useState<{
    source: string
    url: string
  } | null>(null)
  const source = src ?? ""
  useEffect(() => {
    if (!source.startsWith("community:")) return
    let active = true
    let generation = 0
    let owner: string | null | undefined
    let authTimer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      const version = ++generation
      void resolveRecipeImageUrl(source)
        .then((url) => {
          if (active && version === generation) setResolved({ source, url })
        })
        .catch(() => {
          if (active && version === generation)
            setResolved({ source, url: "/recipe-placeholder.svg" })
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 240000)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id ?? null
      const changed = owner !== undefined && owner !== nextOwner
      owner = nextOwner
      if (event === "SIGNED_OUT" || changed) {
        generation++
        setResolved(null)
        clearTimeout(authTimer)
        authTimer = setTimeout(refresh, 0)
      }
    })
    return () => {
      active = false
      window.clearInterval(timer)
      clearTimeout(authTimer)
      subscription.unsubscribe()
    }
  }, [source])
  return (
    <img
      {...props}
      src={
        resolved?.source === source
          ? resolved.url
          : source.startsWith("community:")
            ? "/recipe-placeholder.svg"
            : source || "/recipe-placeholder.svg"
      }
    />
  )
}
