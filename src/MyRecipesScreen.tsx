import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { recipeImageUrl } from "./lib/recipe"
import { submissionColumns, type RecipeTag, type Submission } from "./lib/submissions"
import RecipeUploadScreen from "./RecipeUploadScreen"
import "./submissions.css"

type Props = { userId: string; startNew: boolean; onBack: () => void; onShowList: () => void; onSelectRecipe: (id: string) => void }
export default function MyRecipesScreen({ userId, startNew, onBack, onShowList, onSelectRecipe }: Props) {
  const [rows,setRows] = useState<Submission[]>([])
  const [tags,setTags] = useState<RecipeTag[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState("")
  const [editing,setEditing] = useState<Submission | null>(null)
  const [creating,setCreating] = useState(startNew)
  const [refresh,setRefresh] = useState(0)
  const [limit,setLimit] = useState(50)
  const [count,setCount] = useState(0)
  const [notice,setNotice] = useState("")
  useEffect(() => { if (startNew) { setEditing(null); setCreating(true) } }, [startNew])
  useEffect(() => {
    let ignore=false
    setLoading(true); setError("")
    Promise.all([
      supabase.from("recipe_submissions").select(submissionColumns,{ count: "exact" }).eq("user_id",userId).order("updated_at",{ ascending:false }).range(0,limit-1),
      supabase.from("tags").select("id,name,category").order("category").order("name"),
    ]).then(([result,catalog]) => {
      if(ignore) return
      if(result.error || catalog.error) { console.error("Failed to load own recipes",result.error || catalog.error); setError("Could not load your recipes. Please try again.") }
      else { setRows((result.data ?? []) as Submission[]); setTags(catalog.data ?? []); setCount(result.count ?? 0) }
      setLoading(false)
    }).catch(error => { if(!ignore) { console.error(error); setError("Could not load your recipes. Please try again."); setLoading(false) } })
    return () => { ignore=true }
  },[userId,refresh,limit])
  if(loading && !rows.length) return <div className="submission-ui my-recipes"><p role="status">Loading your recipes…</p></div>
  if(error) return <div className="submission-ui my-recipes"><p role="alert">{error}</p><button className="submission-secondary" onClick={() => setRefresh(value => value+1)}>Retry</button><button className="submission-text-button" onClick={onBack}>Back</button></div>
  if(creating || editing) return <RecipeUploadScreen key={editing?.id ?? "new"} userId={userId} submission={editing} tags={tags} onBack={() => { setCreating(false); setEditing(null); onShowList() }} onSaved={() => { setNotice("Recipe saved."); onShowList(); setCreating(false); setEditing(null); setRefresh(value => value+1) }} />
  return <div className="submission-ui my-recipes">
    <div className="submission-heading"><button onClick={onBack} aria-label="Back to profile">‹</button><h1>My recipes</h1></div>
    <div className="submission-list-heading"><p className="submission-muted">Drafts stay private. Publish a finished recipe to share it with everyone.</p><button className="submission-primary" onClick={() => { setEditing(null); setCreating(true); setNotice("") }}>Upload recipe</button></div>
    {notice && <p role="status" className="submission-notice">{notice}</p>}
    {!rows.length && <div className="submission-empty"><h2>No recipes yet</h2><p className="submission-muted">Share a recipe you love, or save a draft to finish later.</p></div>}
    <div className="submission-own-list">{rows.map(row => <article key={row.id} className="submission-own-card">
      {row.payload.cover_image && <img src={recipeImageUrl(row.payload.cover_image)} alt={row.payload.title || "Recipe"} />}
      <div><span className={`submission-status status-${row.status}`}>{({draft:"Draft",published:"Published"})[row.status]}</span><h2>{row.payload.title || "Untitled recipe"}</h2><p className="submission-muted">Updated {new Date(row.updated_at).toLocaleDateString()}</p><div className="submission-inline-actions"><button className="submission-secondary" disabled={loading} onClick={() => setEditing(row)}>{row.status === "draft" ? "Edit recipe" : "View details"}</button>{row.published_recipe_id && <button className="submission-text-button" onClick={() => onSelectRecipe(row.published_recipe_id!)}>View published recipe</button>}</div></div>
    </article>)}</div>
    {count>rows.length && <button className="submission-secondary" disabled={loading} onClick={() => setLimit(value => value+50)}>{loading ? "Loading…" : "Load more recipes"}</button>}
  </div>
}
