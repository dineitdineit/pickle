import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

type LikedRecipe = {
  id: string;
  title: string;
  difficulty: string;
  total_time_minutes: number;
  image: string;
};

type LikedScreenProps = {
  recipes: LikedRecipe[];
  onSelectRecipe: (id: string) => void;
  onBack: () => void;
};

function formatTime(totalMinutes: number | null) {
  if (totalMinutes === null) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function LikedScreen({ recipes, onSelectRecipe, onBack }: LikedScreenProps) {
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadLikedRecipes() {
      setLoading(true);
      setErrorMessage('');

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;

      if (ignore) return;
      if (userError || !user) {
        setLikedIds([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('recipe_likes')
        .select('recipe_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ignore) return;
      if (error) {
        console.error('Failed to load liked recipes:', error);
        setErrorMessage('Could not load your liked recipes.');
        setLikedIds([]);
      } else {
        setLikedIds((data ?? []).map((row) => row.recipe_id));
      }

      setLoading(false);
    }

    loadLikedRecipes();
    return () => { ignore = true; };
  }, []);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const visibleRecipes = useMemo(
    () => likedIds.map((id) => recipeMap.get(id)).filter((recipe): recipe is LikedRecipe => Boolean(recipe)),
    [likedIds, recipeMap],
  );

  async function removeLike(recipeId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { error } = await supabase
      .from('recipe_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('recipe_id', recipeId);

    if (error) {
      console.error('Failed to unlike recipe:', error);
      setErrorMessage('Could not update this recipe. Please try again.');
      return;
    }

    setLikedIds((current) => current.filter((id) => id !== recipeId));
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
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Liked Recipes</h1>
      </div>

      {loading ? (
        <div className="px-4 py-16 text-center text-[14px]" style={{ color: '#6F6F6F' }}>Loading liked recipes…</div>
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
                onClick={() => removeLike(recipe.id)}
                aria-label={`Unlike ${recipe.title}`}
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: '#F26B21', color: '#FFFFFF', border: '1.5px solid #F26B21' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
          </div>
          <p className="font-semibold text-[17px] mb-1" style={{ color: '#1F1F1F' }}>No liked recipes yet</p>
          <p className="text-[14px] leading-5" style={{ color: '#6F6F6F' }}>Recipes you like will appear here.</p>
          {errorMessage && <p className="text-[12px] mt-3" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
        </div>
      )}
    </div>
  );
}
