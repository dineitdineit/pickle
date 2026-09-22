import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

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
  onBack: () => void;
}

function formatTime(totalMinutes: number | null) {
  if (totalMinutes === null) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function SavedScreen({ recipes, onSelectRecipe, onBack }: SavedScreenProps) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadSavedRecipes() {
      setLoading(true);
      setErrorMessage('');

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;

      if (ignore) return;

      if (userError || !user) {
        setLoggedIn(false);
        setSavedIds([]);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      const { data, error } = await supabase
        .from('saved_recipes')
        .select('recipe_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ignore) return;

      if (error) {
        console.error('Failed to load saved recipes:', error);
        setErrorMessage('Could not load your saved recipes.');
        setSavedIds([]);
      } else {
        setSavedIds((data ?? []).map((row) => row.recipe_id));
      }

      setLoading(false);
    }

    loadSavedRecipes();
    return () => { ignore = true; };
  }, []);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const visibleRecipes = useMemo(
    () => savedIds.map((id) => recipeMap.get(id)).filter((recipe): recipe is SavedRecipe => Boolean(recipe)),
    [savedIds, recipeMap],
  );

  async function removeSaved(recipeId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { error } = await supabase
      .from('saved_recipes')
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_id', recipeId);

    if (error) {
      console.error('Failed to remove saved recipe:', error);
      setErrorMessage('Could not remove this recipe. Please try again.');
      return;
    }

    setSavedIds((current) => current.filter((id) => id !== recipeId));
  }

  return (
    <div className="pb-24">
      <div className="relative px-4 pt-6 text-center" style={{ marginBottom: 40 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center rounded-full"
          style={{ backgroundColor: '#F9F9F9', border: '1.5px solid #EAEAEA' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Saved Recipes</h1>
      </div>

      {loading ? (
        <div className="px-4 py-16 text-center text-[14px]" style={{ color: '#6F6F6F' }}>Loading saved recipes…</div>
      ) : !loggedIn ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="font-semibold text-[17px] mb-1" style={{ color: '#1F1F1F' }}>Log in to save recipes</p>
          <p className="text-[14px] leading-5" style={{ color: '#6F6F6F' }}>Your saved recipes are linked to your Pickle account.</p>
        </div>
      ) : visibleRecipes.length > 0 ? (
        <div className="px-4 flex flex-col">
          {errorMessage && <p className="text-[12px] mb-2" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
          {visibleRecipes.map((recipe, index) => (
            <div
              key={recipe.id}
              className="flex items-center gap-4 py-3.5 w-full"
              style={{ borderBottom: index < visibleRecipes.length - 1 ? '1px solid #EAEAEA' : undefined }}
            >
              <button
                type="button"
                onClick={() => onSelectRecipe(recipe.id)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left active:bg-gray-50"
              >
                <div className="flex-shrink-0 rounded-[8px] overflow-hidden bg-gray-100" style={{ width: 64, height: 64 }}>
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
                style={{ backgroundColor: '#F26B21', color: '#FFFFFF', border: '1.5px solid #F26B21' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
          {errorMessage && <p className="text-[12px] mt-3" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
        </div>
      )}
    </div>
  );
}
