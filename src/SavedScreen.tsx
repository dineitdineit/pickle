import { useEffect, useState } from 'react';

type SavedRecipe = {
  id: string;
  title: string;
  difficulty: string;
  total_time_minutes: number;
  image: string;
};

interface SavedScreenProps {
  recipes: SavedRecipe[];
  onSelectRecipe: (id: string) => void;
}

function formatTime(totalMinutes: number | null) {
  if (totalMinutes === null) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function SavedScreen({ recipes, onSelectRecipe }: SavedScreenProps) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (recipes.length > 0 && savedIds.size === 0) {
      setSavedIds(new Set(recipes.slice(0, 8).map((recipe) => recipe.id)));
    }
  }, [recipes]);

  const savedRecipes = recipes.filter((recipe) => savedIds.has(recipe.id));

  function removeSaved(recipeId: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      next.delete(recipeId);
      return next;
    });
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-6 pb-5">
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Saved Recipes</h1>
      </div>

      {savedRecipes.length > 0 ? (
        <div className="px-4 flex flex-col">
          {savedRecipes.map((recipe, index) => (
            <div
              key={recipe.id}
              className="flex items-center gap-4 py-3.5 w-full"
              style={{ borderBottom: index < savedRecipes.length - 1 ? '1px solid #EAEAEA' : undefined }}
            >
              <button
                type="button"
                onClick={() => onSelectRecipe(recipe.id)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left active:bg-gray-50"
              >
                <div className="flex-shrink-0 rounded-[12px] overflow-hidden bg-gray-100" style={{ width: 64, height: 64 }}>
                  <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[16px] leading-snug truncate" style={{ color: '#1F1F1F' }}>{recipe.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[13px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}>Filipino</span>
                    <span className="text-[13px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}>{recipe.difficulty}</span>
                    <span className="text-[13px]" style={{ color: '#6F6F6F' }}>{formatTime(recipe.total_time_minutes)}</span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => removeSaved(recipe.id)}
                aria-label={`Remove ${recipe.title} from saved recipes`}
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: '#F26B21', color: '#FFFFFF' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="font-semibold text-[17px] mb-1" style={{ color: '#1F1F1F' }}>No saved recipes yet</p>
          <p className="text-[14px] leading-5" style={{ color: '#6F6F6F' }}>Recipes you save will appear here.</p>
        </div>
      )}
    </div>
  );
}
