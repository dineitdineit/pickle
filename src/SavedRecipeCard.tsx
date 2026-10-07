type Props = {
  recipe: { title: string; image: string; difficulty: string; total_time_minutes: number | null };
  saved: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggle: () => void;
};

export default function SavedRecipeCard({ recipe, saved, pending, onSelect, onToggle }: Props) {
  const minutes = recipe.total_time_minutes;
  const duration = minutes === null ? '—' : minutes < 60 ? `${minutes}min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`;
  return (
    <article className="saved-recipe-card">
      <button type="button" className="saved-recipe-open" onClick={onSelect} aria-label={`View ${recipe.title}`}>
        <div className="saved-recipe-photo"><img src={recipe.image} alt={recipe.title} loading="lazy" /></div>
        <h2 className="saved-recipe-title">{recipe.title}</h2>
        <div className="saved-recipe-tags"><span>Filipino</span><span>{recipe.difficulty || 'Recipe'}</span><span>{duration}</span></div>
      </button>
      <button type="button" className="saved-recipe-toggle" aria-label={`${saved ? 'Unsave' : 'Save'} ${recipe.title}`} aria-pressed={saved} disabled={pending} onClick={onToggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>
      </button>
    </article>
  );
}
