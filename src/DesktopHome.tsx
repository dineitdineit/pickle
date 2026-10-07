import RetryState from './RetryState';

type Recipe = {
  id: string;
  title: string;
  difficulty: string;
  total_time_minutes: number;
  image: string;
};

type Props = {
  featured: Recipe[];
  trending: Recipe[];
  quick: Recipe[];
  party: Recipe[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onCollection: (title: string) => void;
  onKeyword: (keyword: string) => void;
};

function time(minutes: number | null) {
  if (minutes === null) return '—';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

function RecipeCollection({ title, subtitle, recipes, onSelect, onMore }: { title: string; subtitle: string; recipes: Recipe[]; onSelect: Props['onSelect']; onMore: () => void }) {
  if (recipes.length === 0) return null;
  return (
    <section className="web-collection">
      <div className="web-section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" onClick={onMore}>View all</button></div>
      <div className="web-recipe-grid">
        {recipes.slice(0, 4).map((recipe) => (
          <button type="button" key={recipe.id} className="web-recipe-card" onClick={() => onSelect(recipe.id)}>
            <div className="web-card-image"><img src={recipe.image} alt={recipe.title} loading="lazy" /><span>{time(recipe.total_time_minutes)}</span></div>
            <div className="web-card-copy"><p className="web-card-meta">Filipino <span>·</span> {recipe.difficulty || 'Recipe'}</p><h3>{recipe.title}</h3></div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function DesktopHome({ featured, trending, quick, party, loading, error, onRetry, onSelect, onCollection, onKeyword }: Props) {
  const lead = featured[0];
  return (
    <div className="desktop-home">
      <div className="web-home-heading"><div><h1>What are we cooking today?</h1><p>Find your next recipe.</p></div></div>
      <nav className="web-quick-links" aria-label="Browse by ingredient or occasion">
        {['Chicken', 'Pork', 'Beef', 'Seafood', 'Dessert', 'Quick', 'Party'].map((keyword) => <button type="button" key={keyword} onClick={() => onKeyword(keyword)}>{keyword}</button>)}
      </nav>
      {loading ? <div className="web-loading" role="status">Loading recipes…</div> : error ? <RetryState title="Couldn't load recipes" message="Please check your connection and try again." onRetry={onRetry} /> : !lead ? <div className="web-loading">No recipes available yet.</div> : <>
        <section className="web-featured" aria-label="Featured recipes">
          <button type="button" className="web-featured-lead" onClick={() => onSelect(lead.id)}>
            <img src={lead.image} alt={lead.title} fetchPriority="high" />
            <div className="web-featured-copy"><span className="web-featured-label">Featured recipe</span><h2>{lead.title}</h2><p>{lead.difficulty || 'Filipino'} <span>·</span> {time(lead.total_time_minutes)}</p><span className="web-featured-cta">View recipe</span></div>
          </button>
          <div className="web-featured-side">
            <div className="web-side-heading"><span className="web-eyebrow">A LITTLE INSPIRATION</span><h2>On the menu</h2></div>
            {featured.slice(1, 3).map((recipe) => <button type="button" className="web-menu-card" key={recipe.id} onClick={() => onSelect(recipe.id)}><img src={recipe.image} alt={recipe.title} /><div><p>{recipe.difficulty || 'Filipino'} · {time(recipe.total_time_minutes)}</p><h3>{recipe.title}</h3><span>View recipe</span></div></button>)}
            <button type="button" className="web-browse-all" onClick={() => onKeyword('')}>Explore all recipes</button>
          </div>
        </section>
        <RecipeCollection title="Trending Recipes" subtitle="Popular in the Pickle kitchen" recipes={trending} onSelect={onSelect} onMore={() => onCollection('Trending Recipes')} />
        <RecipeCollection title="Under 30min" subtitle="Good food, even on busy days" recipes={quick} onSelect={onSelect} onMore={() => onCollection('Under 30min')} />
        <RecipeCollection title="Party Packs" subtitle="Bring everyone to the table" recipes={party} onSelect={onSelect} onMore={() => onCollection('Party Packs')} />
      </>}
    </div>
  );
}
