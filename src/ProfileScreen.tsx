import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';

type ProfileScreenProps = {
  userId: string;
  email?: string;
  onOpenSaved: () => void;
  onOpenLiked: () => void;
  onBack: () => void;
};

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type MyComment = {
  id: string;
  recipe_id: string;
  content: string;
  created_at: string;
};

type RecipeSummary = {
  id: string;
  title: string;
  cover_image: string | null;
};

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MENU_SECTIONS = [
  {
    title: 'Your activity',
    items: [
      { label: 'Saved Recipes', icon: 'bookmark', action: 'saved' },
      { label: 'My Comments', icon: 'comment', action: 'comments' },
      { label: 'Liked Recipes', icon: 'heart', action: 'liked' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Settings', icon: 'settings', action: 'settings' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Contact Us', icon: 'mail', action: 'contact' },
      { label: 'FAQ', icon: 'help', action: 'faq' },
    ],
  },
] as const;

function MenuIcon({ name }: { name: string }) {
  if (name === 'bookmark') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>;
  if (name === 'comment') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" /></svg>;
  if (name === 'heart') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" /></svg>;
  if (name === 'settings') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M4.93 4.93l2.12 2.12" /><path d="M16.95 16.95l2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M4.93 19.07l2.12-2.12" /><path d="M16.95 7.05l2.12-2.12" /></svg>;
  if (name === 'mail') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /><polyline points="22 6 12 13 2 6" /></svg>;
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 115.4 1.8c-.9 1.1-2.5 1.6-2.5 3.2" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}

function avatarPathFromUrl(url: string | null) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/avatars/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  return decodeURIComponent(url.slice(markerIndex + marker.length).split('?')[0]);
}

function recipeImageUrl(path: string | null) {
  if (!path) return '';
  return supabase.storage.from('recipe_images').getPublicUrl(path).data.publicUrl;
}

export default function ProfileScreen({ userId, email, onOpenSaved, onOpenLiked, onBack }: ProfileScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [showMyComments, setShowMyComments] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [commentRecipes, setCommentRecipes] = useState<Map<string, RecipeSummary>>(new Map());
  const [commentsMessage, setCommentsMessage] = useState('');
  const [supportScreen, setSupportScreen] = useState<'contact' | 'faq' | 'settings' | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`pickle:settings:${userId}`);
      return stored ? JSON.parse(stored).notificationsEnabled ?? true : true;
    } catch {
      return true;
    }
  });
  const [language, setLanguage] = useState<'English' | 'Tagalog'>(() => {
    try {
      const stored = localStorage.getItem(`pickle:settings:${userId}`);
      const value = stored ? JSON.parse(stored).language : null;
      return value === 'Tagalog' ? 'Tagalog' : 'English';
    } catch {
      return 'English';
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .single();

      if (!ignore) {
        if (error) console.error('Failed to load profile:', error);
        else setProfile(data);
        setLoading(false);
      }
    }

    loadProfile();
    return () => { ignore = true; };
  }, [userId]);

  function saveSettings(nextNotifications: boolean, nextLanguage: 'English' | 'Tagalog') {
    localStorage.setItem(
      `pickle:settings:${userId}`,
      JSON.stringify({
        notificationsEnabled: nextNotifications,
        language: nextLanguage,
      }),
    );
  }

  function toggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    saveSettings(next, language);
  }

  function chooseLanguage(nextLanguage: 'English' | 'Tagalog') {
    setLanguage(nextLanguage);
    saveSettings(notificationsEnabled, nextLanguage);
  }

  async function openMyComments() {
    setShowMyComments(true);
    setCommentsLoading(true);
    setCommentsMessage('');

    const { data, error } = await supabase
      .from('recipe_comments')
      .select('id, recipe_id, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load comment history:', error);
      setCommentsMessage('Could not load your comments.');
      setMyComments([]);
      setCommentsLoading(false);
      return;
    }

    const rows = (data ?? []) as MyComment[];
    setMyComments(rows);
    const recipeIds = [...new Set(rows.map((comment) => comment.recipe_id))];

    if (recipeIds.length > 0) {
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('id, title, cover_image')
        .in('id', recipeIds);

      if (recipeError) {
        console.error('Failed to load recipes for comments:', recipeError);
      } else {
        setCommentRecipes(new Map(((recipeData ?? []) as RecipeSummary[]).map((recipe) => [recipe.id, recipe])));
      }
    } else {
      setCommentRecipes(new Map());
    }

    setCommentsLoading(false);
  }

  async function deleteMyComment(commentId: string) {
    const { error } = await supabase
      .from('recipe_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete comment:', error);
      setCommentsMessage('Could not delete this comment.');
      return;
    }

    setMyComments((current) => current.filter((comment) => comment.id !== commentId));
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAvatarMessage('');

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarMessage('Please choose a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarMessage('Profile photos must be 5 MB or smaller.');
      return;
    }

    setUploadingAvatar(true);

    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${userId}/avatar-${Date.now()}.${extension}`;
    const previousPath = avatarPathFromUrl(profile?.avatar_url ?? null);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });

    if (uploadError) {
      console.error('Failed to upload avatar:', uploadError);
      setAvatarMessage('Could not upload this photo. Please try again.');
      setUploadingAvatar(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const avatarUrl = publicUrlData.publicUrl;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to save avatar to profile:', profileError);
      await supabase.storage.from('avatars').remove([filePath]);
      setAvatarMessage('The photo uploaded, but your profile could not be updated.');
      setUploadingAvatar(false);
      return;
    }

    setProfile((current) => current ? { ...current, avatar_url: avatarUrl } : current);
    setAvatarMessage('Profile photo updated.');

    if (previousPath && previousPath !== filePath && previousPath.startsWith(`${userId}/`)) {
      const { error: deleteError } = await supabase.storage.from('avatars').remove([previousPath]);
      if (deleteError) console.error('Failed to remove previous avatar:', deleteError);
    }

    setUploadingAvatar(false);
  }

  const displayName = profile?.display_name || profile?.username || 'Pickle User';
  const username = profile?.username ? `@${profile.username}` : email || '';
  const initial = profile?.username?.trim().charAt(0).toUpperCase() || 'P';

  if (supportScreen === 'settings') {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button type="button" onClick={() => setSupportScreen(null)} aria-label="Back to profile" className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Settings</h1>
        </div>

        <div className="px-4 space-y-7">
          <section>
            <p className="text-[13px] font-semibold mb-2 px-1" style={{ color: '#8A8A8A' }}>Notifications</p>
            <div className="rounded-[16px] border px-4 py-4 flex items-center gap-4" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
              <div className="flex-1">
                <p className="text-[15px] font-medium" style={{ color: '#1F1F1F' }}>Notifications</p>
                <p className="text-[13px] leading-5 mt-1" style={{ color: '#8A8A8A' }}>
                  Get updates about activity related to your Pickle account.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={toggleNotifications}
                className="relative w-[48px] h-[28px] rounded-full flex-shrink-0 transition-colors"
                style={{ backgroundColor: notificationsEnabled ? '#F26B21' : '#D9D9D9' }}
              >
                <span
                  className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-all"
                  style={{ left: notificationsEnabled ? 23 : 3 }}
                />
              </button>
            </div>
          </section>

          <section>
            <p className="text-[13px] font-semibold mb-2 px-1" style={{ color: '#8A8A8A' }}>Language</p>
            <div className="rounded-[16px] border overflow-hidden" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
              {(['English', 'Tagalog'] as const).map((option, index) => {
                const selected = language === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseLanguage(option)}
                    className="w-full min-h-[58px] px-4 flex items-center gap-3 text-left"
                    style={{ borderBottom: index === 0 ? '1px solid #EAEAEA' : undefined, backgroundColor: '#FFFFFF' }}
                  >
                    <span className="flex-1 text-[15px] font-medium" style={{ color: '#1F1F1F' }}>{option}</span>
                    <span
                      className="w-5 h-5 rounded-full border flex items-center justify-center"
                      style={{ borderColor: selected ? '#F26B21' : '#CFCFCF' }}
                    >
                      {selected && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F26B21' }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] leading-5 mt-2 px-1" style={{ color: '#A0A0A0' }}>
              Language preference is saved now. Full Tagalog translation can be applied as the localization system is added.
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (supportScreen === 'contact') {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button type="button" onClick={() => setSupportScreen(null)} aria-label="Back to profile" className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Contact Us</h1>
        </div>

        <div className="px-4 space-y-5">
          <section className="rounded-[18px] border p-5" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>
              <MenuIcon name="mail" />
            </div>
            <h2 className="font-semibold text-[18px]" style={{ color: '#1F1F1F' }}>How can we help?</h2>
            <p className="text-[14px] leading-6 mt-2" style={{ color: '#6F6F6F' }}>
              Questions, recipe feedback, bug reports, and general suggestions are all welcome.
            </p>
          </section>

          <section className="rounded-[18px] border overflow-hidden" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: '#EAEAEA' }}>
              <p className="text-[12px] font-semibold" style={{ color: '#8A8A8A' }}>EMAIL</p>
              <p className="text-[15px] font-medium mt-1" style={{ color: '#1F1F1F' }}>support@pickle.app</p>
            </div>
            <div className="px-5 py-4 border-b" style={{ borderColor: '#EAEAEA' }}>
              <p className="text-[12px] font-semibold" style={{ color: '#8A8A8A' }}>RESPONSE TIME</p>
              <p className="text-[15px] font-medium mt-1" style={{ color: '#1F1F1F' }}>Usually within 2–3 business days</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] font-semibold" style={{ color: '#8A8A8A' }}>SUPPORT HOURS</p>
              <p className="text-[15px] font-medium mt-1" style={{ color: '#1F1F1F' }}>Monday–Friday, 9:00 AM–6:00 PM</p>
            </div>
          </section>

          <p className="text-[12px] leading-5 px-1" style={{ color: '#A0A0A0' }}>
            Contact information on this preview screen is temporary and can be replaced before launch.
          </p>
        </div>
      </div>
    );
  }

  if (supportScreen === 'faq') {
    const faqs = [
      {
        question: 'What is Pickle?',
        answer: 'Pickle is a recipe discovery app designed to help you find, save, and cook recipes more easily.',
      },
      {
        question: 'Do I need an account to browse recipes?',
        answer: 'No. You can browse and view recipes without signing in. An account is needed for features such as saving, liking, and commenting.',
      },
      {
        question: 'Where can I find recipes I saved?',
        answer: 'Open the Saved tab from the bottom navigation, or go to Profile and choose Saved Recipes.',
      },
      {
        question: 'Can I remove a saved or liked recipe?',
        answer: 'Yes. Tap the bookmark or heart again on the recipe page to remove it from your saved or liked recipes.',
      },
      {
        question: 'How do I change or delete my comments?',
        answer: 'Open the menu next to your comment to edit or delete it. You can also review your comments from Profile > My Comments.',
      },
      {
        question: 'Are nutrition values exact?',
        answer: 'Nutrition information may be estimated and can vary depending on ingredients, brands, serving sizes, and preparation methods.',
      },
      {
        question: 'How do I report a problem with a recipe?',
        answer: 'Use Contact Us and include the recipe name along with a short description of the issue so the Pickle team can review it.',
      },
    ];

    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-8">
          <button type="button" onClick={() => setSupportScreen(null)} aria-label="Back to profile" className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>FAQ</h1>
        </div>

        <div className="px-4">
          <p className="text-[14px] leading-6 mb-5" style={{ color: '#6F6F6F' }}>
            Quick answers to common questions about using Pickle.
          </p>

          <div className="rounded-[18px] border overflow-hidden" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
            {faqs.map((faq, index) => (
              <details key={faq.question} className="group" style={{ borderBottom: index < faqs.length - 1 ? '1px solid #EAEAEA' : undefined }}>
                <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3">
                  <span className="flex-1 text-[15px] font-semibold leading-5" style={{ color: '#1F1F1F' }}>{faq.question}</span>
                  <svg className="transition-transform group-open:rotate-180 flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p className="px-5 pb-4 text-[14px] leading-6" style={{ color: '#6F6F6F' }}>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (showMyComments) {
    return (
      <div className="pb-28">
        <div className="relative px-4 pt-6 text-center mb-7">
          <button type="button" onClick={() => setShowMyComments(false)} aria-label="Back to profile" className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>My Comments</h1>
        </div>

        {commentsLoading ? (
          <div className="px-4 py-16 text-center text-[14px]" style={{ color: '#6F6F6F' }}>Loading comments…</div>
        ) : myComments.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}><MenuIcon name="comment" /></div>
            <p className="font-semibold text-[17px]" style={{ color: '#1F1F1F' }}>No comments yet</p>
            <p className="text-[14px] mt-1" style={{ color: '#6F6F6F' }}>Comments you leave on recipes will appear here.</p>
            {commentsMessage && <p className="text-[12px] mt-3" style={{ color: '#C53D2E' }}>{commentsMessage}</p>}
          </div>
        ) : (
          <div className="px-4 space-y-3">
            {commentsMessage && <p className="text-[12px]" style={{ color: '#C53D2E' }}>{commentsMessage}</p>}
            {myComments.map((comment) => {
              const recipe = commentRecipes.get(comment.recipe_id);
              return (
                <article key={comment.id} className="rounded-[16px] border p-3.5" style={{ borderColor: '#EAEAEA', backgroundColor: '#FFFFFF' }}>
                  <div className="flex gap-3">
                    {recipe?.cover_image ? (
                      <img src={recipeImageUrl(recipe.cover_image)} alt={recipe.title} className="w-14 h-14 rounded-[10px] object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-[10px] flex-shrink-0" style={{ backgroundColor: '#F5F5F5' }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate" style={{ color: '#1F1F1F' }}>{recipe?.title || 'Recipe'}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#A0A0A0' }}>{new Date(comment.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="text-[14px] leading-5 mt-3 whitespace-pre-wrap break-words" style={{ color: '#555555' }}>{comment.content}</p>
                  <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => deleteMyComment(comment.id)} className="text-[12px]" style={{ color: '#A0A0A0' }}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="relative px-4 pt-6 text-center">
        <button type="button" onClick={onBack} aria-label="Back" className="absolute left-4 top-5 w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Profile</h1>
      </div>

      <section className="px-4 pb-8 flex flex-col items-center" style={{ paddingTop: 50 }}>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} aria-hidden="true" tabIndex={-1} style={{ display: 'none' }} />

        {profile?.avatar_url && /^https?:\/\//.test(profile.avatar_url) ? (
          <img src={profile.avatar_url} alt={displayName} className="w-[120px] h-[120px] rounded-full object-cover" />
        ) : (
          <div className="w-[120px] h-[120px] rounded-full flex items-center justify-center text-[36px] font-bold" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>{initial}</div>
        )}

        <button type="button" onClick={() => !uploadingAvatar && fileInputRef.current?.click()} disabled={uploadingAvatar} className="mt-3 text-[13px] font-semibold disabled:opacity-60" style={{ color: '#F26B21' }}>
          {uploadingAvatar ? 'Uploading…' : 'Upload new photo'}
        </button>
        {avatarMessage && <p className="text-[12px] mt-2 text-center" style={{ color: avatarMessage === 'Profile photo updated.' ? '#5F6F52' : '#C53D2E' }}>{avatarMessage}</p>}

        <h2 className="font-semibold text-[20px] mt-4" style={{ color: '#1F1F1F' }}>{loading ? 'Loading…' : displayName}</h2>
        <p className="text-[13px] mt-1" style={{ color: '#8A8A8A' }}>{loading ? '' : username}</p>
      </section>

      <div className="px-4 space-y-7">
        {MENU_SECTIONS.map((section) => (
          <section key={section.title}>
            <p className="text-[13px] font-semibold mb-2 px-1" style={{ color: '#8A8A8A' }}>{section.title}</p>
            <div className="rounded-[16px] border overflow-hidden" style={{ borderColor: '#EAEAEA' }}>
              {section.items.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action === 'saved' ? onOpenSaved : item.action === 'liked' ? onOpenLiked : item.action === 'comments' ? openMyComments : item.action === 'settings' ? () => setSupportScreen('settings') : item.action === 'contact' ? () => setSupportScreen('contact') : item.action === 'faq' ? () => setSupportScreen('faq') : undefined}
                  className="w-full h-[58px] px-4 flex items-center gap-3 text-left"
                  style={{ borderBottom: index < section.items.length - 1 ? '1px solid #EAEAEA' : undefined, backgroundColor: '#FFFFFF' }}
                >
                  <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F9F9F9', color: '#5F5F5F' }}><MenuIcon name={item.icon} /></span>
                  <span className="flex-1 text-[15px] font-medium" style={{ color: '#1F1F1F' }}>{item.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B0B0B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              ))}
            </div>
          </section>
        ))}

        <button type="button" onClick={() => supabase.auth.signOut()} className="w-full h-12 rounded-[12px] text-[15px] font-semibold" style={{ border: '1.5px solid #E5E5E5', color: '#6F6F6F', backgroundColor: '#FFFFFF' }}>
          Log out
        </button>
      </div>
    </div>
  );
}
