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
  );
}
