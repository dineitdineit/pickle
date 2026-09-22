import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

type RecipeDetailScreenProps = {
  recipeId: string;
  onBack: () => void;
};

type Recipe = {
  id: string;
  title: string;
  short_description: string | null;
  description: string | null;
  difficulty: string | null;
  total_time_minutes: number | null;
  servings: number | null;
  cover_image: string | null;
  ingredients_image: string | null;
};

type IngredientRow = {
  id: string;
  group_name: string | null;
  amount: number | null;
  unit: string | null;
  optional: boolean | null;
  substitute: string | null;
  display_order: number | null;
  ingredients: { name: string } | null;
};

type StepRow = {
  id: string;
  step_number: number;
  title: string | null;
  instruction: string;
  step_image: string | null;
  step_time_minutes: number | null;
  is_final: boolean | null;
};

type Nutrition = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_estimated: boolean;
};

function formatTime(totalMinutes: number | null) {
  if (totalMinutes === null) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function imageUrl(path: string | null) {
  if (!path) return '';
  return supabase.storage.from('recipe_images').getPublicUrl(path).data.publicUrl;
}

function formatAmount(amount: number | null) {
  if (amount === null) return '';
  const fractions: Record<number, string> = {
    0.25: '¼',
    0.5: '½',
    0.75: '¾',
    0.33: '⅓',
    0.67: '⅔',
  };
  return fractions[amount] ?? String(amount);
}

export default function RecipeDetailScreen({ recipeId, onBack }: RecipeDetailScreenProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'Ingredients' | 'Steps' | 'Nutrition'>('Ingredients');

  useEffect(() => {
    async function loadRecipe() {
      setLoading(true);
      setErrorMessage('');

      const [recipeResult, ingredientResult, stepResult, nutritionResult] = await Promise.all([
        supabase
          .from('recipes')
          .select('id, title, short_description, description, difficulty, total_time_minutes, servings, cover_image, ingredients_image')
          .eq('id', recipeId)
          .single(),
        supabase
          .from('recipe_ingredients')
          .select('id, group_name, amount, unit, optional, substitute, display_order, ingredients(name)')
          .eq('recipe_id', recipeId)
          .order('display_order', { ascending: true }),
        supabase
          .from('recipe_steps')
          .select('id, step_number, title, instruction, step_image, step_time_minutes, is_final')
          .eq('recipe_id', recipeId)
          .order('step_number', { ascending: true }),
        supabase
          .from('recipe_nutrition')
          .select('calories, protein_g, carbs_g, fat_g, is_estimated')
          .eq('recipe_id', recipeId)
          .maybeSingle(),
      ]);

      if (recipeResult.error) {
        console.error(recipeResult.error);
        setErrorMessage('Could not load this recipe.');
        setLoading(false);
        return;
      }

      setRecipe(recipeResult.data as Recipe);
      setIngredients((ingredientResult.data ?? []) as IngredientRow[]);
      setSteps((stepResult.data ?? []) as StepRow[]);

      if (nutritionResult.error) {
        console.error('Failed to load nutrition:', nutritionResult.error);
        setNutrition(null);
      } else {
        setNutrition((nutritionResult.data as Nutrition | null) ?? null);
      }

      const viewKey = `pickle:viewed:${recipeId}`;
      if (!sessionStorage.getItem(viewKey)) {
        const { error: viewError } = await supabase
          .from('recipe_views')
          .insert({ recipe_id: recipeId });

        if (viewError) {
          console.error('Failed to record recipe view:', viewError);
        } else {
          sessionStorage.setItem(viewKey, '1');
        }
      }
      setLoading(false);
    }

    loadRecipe();
  }, [recipeId]);

  const groupedIngredients = useMemo(() => {
    const groups = new Map<string, IngredientRow[]>();
    ingredients.forEach((item) => {
      const key = item.group_name || 'Ingredients';
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return Array.from(groups.entries());
  }, [ingredients]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto flex items-center justify-center">
        <p className="text-[15px]" style={{ color: '#6F6F6F' }}>Loading recipe…</p>
      </div>
    );
  }

  if (!recipe || errorMessage) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto px-4 pt-6">
        <button onClick={onBack} className="mb-8 text-[15px] font-medium" style={{ color: '#F26B21' }}>← Back</button>
        <p className="text-[16px]" style={{ color: '#1F1F1F' }}>{errorMessage || 'Recipe not found.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto pb-10">
      <div className="relative h-[300px] bg-gray-100">
        <img src={imageUrl(recipe.cover_image)} alt={recipe.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.28), transparent 38%, rgba(0,0,0,0.18))' }} />
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"
          style={{ position: 'absolute', top: 20, left: 16, zIndex: 20 }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="Share recipe"
          className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"
          style={{ position: 'absolute', top: 20, right: 16, zIndex: 20 }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="10.51" x2="15.42" y2="6.49" />
            <line x1="8.59" y1="13.49" x2="15.42" y2="17.51" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-5">
        <div className="flex justify-between gap-4" style={{ alignItems: 'flex-end' }}>
          <div className="min-w-0">
            {recipe.short_description && (
              <p className="text-[13px] leading-5 mb-1.5" style={{ color: '#6F6F6F' }}>{recipe.short_description}</p>
            )}
            <h1 className="font-bold text-[28px] leading-tight" style={{ color: '#1F1F1F' }}>{recipe.title}</h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" style={{ alignSelf: 'flex-end', marginBottom: 4 }}>
            <button type="button" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: '#EAEAEA' }} aria-label="Like recipe">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
              </svg>
            </button>
            <button type="button" className="w-10 h-10 rounded-full border flex items-center justify-center" style={{ borderColor: '#EAEAEA' }} aria-label="Save recipe">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            ['Time', formatTime(recipe.total_time_minutes)],
            ['Difficulty', recipe.difficulty || '—'],
            ['Servings', recipe.servings ? `${recipe.servings}` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[12px] p-3 text-center" style={{ backgroundColor: '#F9F9F9' }}>
              <p className="text-[12px] mb-1" style={{ color: '#6F6F6F' }}>{label}</p>
              <p className="font-semibold text-[14px]" style={{ color: '#1F1F1F' }}>{value}</p>
            </div>
          ))}
        </div>

        {recipe.description && (
          <section className="mt-8">
            <h2 className="font-semibold text-[20px] mb-3" style={{ color: '#1F1F1F' }}>About</h2>
            <p className="text-[15px] leading-6" style={{ color: '#6F6F6F' }}>{recipe.description}</p>
          </section>
        )}

        <div className="mt-8 p-2.5 flex gap-1" style={{ backgroundColor: '#F5F5F5', borderRadius: 24 }}>
          {(['Ingredients', 'Steps', 'Nutrition'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 h-10 rounded-[16px] text-[14px] font-semibold transition-colors"
              style={activeTab === tab
                ? { backgroundColor: '#FFFFFF', color: '#F26B21', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: '#6F6F6F' }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Ingredients' && (
          <section className="mt-6">
            <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Ingredients</h2>
            {recipe.ingredients_image && (
              <div className="rounded-[16px] overflow-hidden mb-5 bg-gray-100">
                <img src={imageUrl(recipe.ingredients_image)} alt={`${recipe.title} ingredients`} className="w-full aspect-[4/3] object-cover" />
              </div>
            )}
            <div className="space-y-6">
              {groupedIngredients.map(([group, items]) => (
                <div key={group}>
                  {group !== 'Main' && (
                    <h3 className="font-semibold text-[15px] mb-2" style={{ color: '#1F1F1F' }}>{group}</h3>
                  )}
                  <div className="divide-y" style={{ borderColor: '#EAEAEA' }}>
                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-4 py-3" style={{ borderColor: '#EAEAEA' }}>
                        <div className="min-w-0">
                          <p className="text-[15px]" style={{ color: '#1F1F1F' }}>
                            {item.ingredients?.name || 'Ingredient'}
                            {item.optional ? <span className="text-[12px] ml-1" style={{ color: '#6F6F6F' }}>(optional)</span> : null}
                          </p>
                          {item.substitute && (
                            <p className="text-[12px] mt-0.5" style={{ color: '#6F6F6F' }}>Sub: {item.substitute}</p>
                          )}
                        </div>
                        <p className="text-[14px] whitespace-nowrap font-medium" style={{ color: '#1F1F1F' }}>
                          {formatAmount(item.amount)} {item.unit || ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'Steps' && (
          <section className="mt-6">
            <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Steps</h2>
            <div className="space-y-7">
              {steps.map((step) => (
                <article key={step.id}>
                  {step.step_image && (
                    <div className="rounded-[16px] overflow-hidden bg-gray-100 mb-3">
                      <img src={imageUrl(step.step_image)} alt={step.title || `Step ${step.step_number}`} className="w-full aspect-[4/3] object-cover" />
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[14px] font-semibold" style={{ backgroundColor: '#F26B21' }}>
                      {step.step_number}
                    </div>
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-[17px]" style={{ color: '#1F1F1F' }}>{step.title || `Step ${step.step_number}`}</h3>
                        {step.step_time_minutes ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>{formatTime(step.step_time_minutes)}</span>
                        ) : null}
                      </div>
                      <p className="text-[15px] leading-6 mt-1.5" style={{ color: '#6F6F6F' }}>{step.instruction}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'Nutrition' && (
          <section className="mt-6">
            <div className="flex justify-between mb-4" style={{ alignItems: 'baseline' }}>
              <h2 className="font-semibold text-[20px] leading-none" style={{ color: '#1F1F1F' }}>Nutrition</h2>
              <span className="text-[12px] leading-none" style={{ color: '#8A8A8A' }}>Per serving</span>
            </div>

            {nutrition ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Calories', nutrition.calories, 'kcal'],
                    ['Protein', nutrition.protein_g, 'g'],
                    ['Carbs', nutrition.carbs_g, 'g'],
                    ['Fat', nutrition.fat_g, 'g'],
                  ].map(([label, value, unit]) => (
                    <div key={label} className="rounded-[14px] p-4" style={{ backgroundColor: '#F9F9F9', border: '1px solid #EEEEEE' }}>
                      <p className="text-[13px] mb-2" style={{ color: '#6F6F6F' }}>{label}</p>
                      <div className="flex" style={{ alignItems: 'baseline' }}>
                        <span className="font-semibold text-[22px] leading-none" style={{ color: '#1F1F1F' }}>{value}</span>
                        <span className="text-[12px] leading-none ml-1" style={{ color: '#8A8A8A' }}>{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {nutrition.is_estimated && (
                  <p className="mt-3 text-[7px] leading-[10px]" style={{ color: '#A0A0A0' }}>
                    *Nutrition values are estimates and may not be accurate.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-[14px] px-4 py-4" style={{ backgroundColor: '#FFF8F3' }}>
                <p className="text-[13px] leading-5" style={{ color: '#6F6F6F' }}>
                  Nutrition information is not available for this recipe yet.
                </p>
              </div>
            )}
          </section>
        )}

        <section className="mt-14 pt-10 border-t" style={{ borderColor: '#EEEEEE' }}>
          <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Comments</h2>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[13px] font-semibold" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>
              P
            </div>
            <div className="flex-1 min-w-0">
              <textarea
                aria-label="Write a comment"
                placeholder="Share your thoughts..."
                rows={3}
                className="w-full resize-none rounded-[16px] border px-4 py-3 text-[14px] leading-5 outline-none"
                style={{ borderColor: '#E6E6E6', color: '#1F1F1F', backgroundColor: '#FAFAFA' }}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  className="h-9 px-4 rounded-full text-[13px] font-semibold text-white"
                  style={{ backgroundColor: '#F26B21' }}
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
