import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type RecipeCommentsProps = {
  recipeId: string;
  onRequireLogin: () => void;
  onCountChange?: (count: number) => void;
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(value).toLocaleDateString();
}

export default function RecipeComments({ recipeId, onRequireLogin, onCountChange }: RecipeCommentsProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState('');

  async function loadComments() {
    setLoading(true);
    const [{ data: userData }, commentResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('recipe_comments')
        .select('id, user_id, content, created_at')
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: false }),
    ]);

    setUserId(userData.user?.id ?? null);

    if (commentResult.error) {
      console.error('Failed to load comments:', commentResult.error);
      setMessage('Could not load comments.');
      setComments([]);
      onCountChange?.(0);
      setLoading(false);
      return;
    }

    const rows = (commentResult.data ?? []) as CommentRow[];
    setComments(rows);
    onCountChange?.(rows.length);

    const ids = [...new Set(rows.map((row) => row.user_id))];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);

      if (error) {
        console.error('Failed to load comment profiles:', error);
      } else {
        setProfiles(new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])));
      }
    } else {
      setProfiles(new Map());
    }

    setLoading(false);
  }

  useEffect(() => {
    loadComments();
  }, [recipeId]);

  useEffect(() => {
    const shareButton = document.querySelector<HTMLButtonElement>('button[aria-label="Share recipe"]');
    if (!shareButton) return;

    const openShareMenu = () => {
      setShareMessage('');
      setShareOpen(true);
    };

    shareButton.addEventListener('click', openShareMenu);
    return () => shareButton.removeEventListener('click', openShareMenu);
  }, [recipeId]);

  const shareUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('recipe', recipeId);
    return url.toString();
  }, [recipeId]);

  function closeShareMenu() {
    setShareOpen(false);
    setShareMessage('');
  }

  function shareFacebook() {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
    closeShareMenu();
  }

  function shareMessenger() {
    const mobileUrl = `fb-messenger://share/?link=${encodeURIComponent(shareUrl)}`;
    window.location.href = mobileUrl;
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.open('https://www.messenger.com/', '_blank', 'noopener,noreferrer');
      }
    }, 900);
    closeShareMenu();
  }

  async function shareInstagram() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pickle recipe', url: shareUrl });
        closeShareMenu();
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage('Link copied. Paste it into Instagram.');
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setShareMessage('Could not open sharing. Try Copy link instead.');
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage('Link copied!');
    } catch {
      setShareMessage('Could not copy the link.');
    }
  }

  async function postComment() {
    const cleanText = text.trim();
    if (!userId) {
      onRequireLogin();
      return;
    }
    if (!cleanText || posting) return;

    setPosting(true);
    setMessage('');
    const { error } = await supabase
      .from('recipe_comments')
      .insert({ recipe_id: recipeId, user_id: userId, content: cleanText });

    if (error) {
      console.error('Failed to post comment:', error);
      setMessage('Could not post your comment.');
    } else {
      setText('');
      await loadComments();
    }
    setPosting(false);
  }

  async function deleteComment(commentId: string) {
    if (!userId) return;
    const { error } = await supabase
      .from('recipe_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete comment:', error);
      setMessage('Could not delete your comment.');
      return;
    }

    const next = comments.filter((comment) => comment.id !== commentId);
    setComments(next);
    onCountChange?.(next.length);
  }

  const currentProfile = useMemo(() => userId ? profiles.get(userId) : undefined, [profiles, userId]);
  const currentInitial = currentProfile?.username?.charAt(0).toUpperCase() || 'P';

  return (
    <>
      {shareOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} onClick={closeShareMenu}>
          <div
            className="w-full max-w-md bg-white px-5 pt-5 pb-7 shadow-xl"
            style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-[18px]" style={{ color: '#1F1F1F' }}>Share recipe</h3>
              <button type="button" onClick={closeShareMenu} aria-label="Close share menu" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5F5F5', color: '#555555' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex flex-row items-start justify-between gap-2">
              <button type="button" onClick={shareFacebook} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-[12px]" style={{ color: '#555555' }}>
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[22px] font-bold" style={{ backgroundColor: '#1877F2' }}>f</span>
                <span className="whitespace-nowrap">Facebook</span>
              </button>
              <button type="button" onClick={shareMessenger} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-[12px]" style={{ color: '#555555' }}>
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#0084FF' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.9 3 3 6.7 3 11.5c0 2.7 1.2 5 3.2 6.6V21l2.7-1.5c1 .3 2 .5 3.1.5 5.1 0 9-3.7 9-8.5S17.1 3 12 3z" fill="white"/><path d="M7.2 13.8l3.1-3.3 2.5 2 3.9-2.1-3 3.2-2.5-2-4 2.2z" fill="#0084FF"/></svg>
                </span>
                <span className="whitespace-nowrap">Messenger</span>
              </button>
              <button type="button" onClick={shareInstagram} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-[12px]" style={{ color: '#555555' }}>
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#FEDA75,#D62976,#4F5BD5)' }}>
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>
                </span>
                <span className="whitespace-nowrap">Instagram</span>
              </button>
              <button type="button" onClick={copyShareLink} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-[12px]" style={{ color: '#555555' }}>
                <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F3F3F3', color: '#1F1F1F' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 00-7.1-.1l-2 2A5 5 0 0012 20l1.1-1.1"/></svg>
                </span>
                <span className="whitespace-nowrap">Copy link</span>
              </button>
            </div>

            {shareMessage && <p className="text-center text-[12px] mt-5" style={{ color: '#6F6F6F' }}>{shareMessage}</p>}
          </div>
        </div>
      )}

      <section className="border-t" style={{ borderColor: '#EEEEEE', marginTop: 30, paddingTop: 15 }}>
        <h2 className="font-semibold text-[20px] mb-4" style={{ color: '#1F1F1F' }}>Comments</h2>

        <div className="flex items-start gap-3">
          {currentProfile?.avatar_url ? (
            <img src={currentProfile.avatar_url} alt="Your profile" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[13px] font-semibold" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>{currentInitial}</div>
          )}
          <div className="flex-1 min-w-0">
            <textarea
              aria-label="Write a comment"
              placeholder={userId ? 'Share your thoughts...' : 'Log in to leave a comment'}
              rows={3}
              maxLength={1000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={() => { if (!userId) onRequireLogin(); }}
              className="w-full resize-none rounded-[16px] border px-4 py-3 text-[14px] leading-5 outline-none"
              style={{ borderColor: '#E6E6E6', color: '#1F1F1F', backgroundColor: '#FAFAFA' }}
            />
            <div className="flex justify-end mt-2">
              <button type="button" onClick={postComment} disabled={posting || !text.trim()} className="h-9 px-4 rounded-full text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#F26B21' }}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>

        {message && <p className="text-[12px] mt-3" style={{ color: '#C53D2E' }}>{message}</p>}

        <div className="mt-6 space-y-5">
          {loading ? (
            <p className="text-[13px]" style={{ color: '#8A8A8A' }}>Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-[13px]" style={{ color: '#8A8A8A' }}>No comments yet. Be the first to share your thoughts.</p>
          ) : comments.map((comment) => {
          const profile = profiles.get(comment.user_id);
          const name = profile?.display_name || profile?.username || 'Pickle User';
          const initial = profile?.username?.charAt(0).toUpperCase() || 'P';
          return (
            <article key={comment.id} className="flex gap-3">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-semibold" style={{ backgroundColor: '#F5F5F5', color: '#6F6F6F' }}>{initial}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[14px] truncate" style={{ color: '#1F1F1F' }}>{name}</p>
                  <span className="text-[11px]" style={{ color: '#A0A0A0' }}>{timeAgo(comment.created_at)}</span>
                </div>
                <p className="text-[14px] leading-5 mt-1 whitespace-pre-wrap break-words" style={{ color: '#555555' }}>{comment.content}</p>
                {comment.user_id === userId && (
                  <button type="button" onClick={() => deleteComment(comment.id)} className="text-[11px] mt-1.5" style={{ color: '#A0A0A0' }}>Delete</button>
                )}
              </div>
            </article>
          );
        })}
        </div>
      </section>
    </>
  );
}
