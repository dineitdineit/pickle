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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function loadRecipe() {
      setLoading(true);
      setErrorMessage('');

      const [recipeResult, ingredientResult, stepResult] = await Promise.all([
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
          className="absolute top-5 left-4 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold mb-1" style={{ color: '#F26B21' }}>Filipino</p>
            <h1 className="font-bold text-[28px] leading-tight" style={{ color: '#1F1F1F' }}>{recipe.title}</h1>
          </div>
          <button className="w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0" style={{ borderColor: '#EAEAEA' }} aria-label="Save recipe">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
            </svg>
          </button>
        </div>

        {recipe.short_description && (
          <p className="text-[15px] leading-6 mt-3" style={{ color: '#6F6F6F' }}>{recipe.short_description}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            ['Time', recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : '—'],
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

        <section className="mt-8">
          <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Ingredients</h2>

          {recipe.ingredients_image && (
            <div className="rounded-[16px] overflow-hidden mb-5 bg-gray-100">
              <img src={imageUrl(recipe.ingredients_image)} alt={`${recipe.title} ingredients`} className="w-full aspect-[4/3] object-cover" />
            </div>
          )}

          <div className="space-y-6">
            {groupedIngredients.map(([group, items]) => (
              <div key={group}>
                <h3 className="font-semibold text-[15px] mb-2" style={{ color: '#1F1F1F' }}>{group}</h3>
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

        <section className="mt-9">
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
                        <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>{step.step_time_minutes} min</span>
                      ) : null}
                    </div>
                    <p className="text-[15px] leading-6 mt-1.5" style={{ color: '#6F6F6F' }}>{step.instruction}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
