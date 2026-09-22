import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';

type ProfileScreenProps = {
  userId: string;
  email?: string;
  onOpenSaved: () => void;
  onBack: () => void;
};

type Profile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MENU_SECTIONS = [
  {
    title: 'Your activity',
    items: [
      { label: 'Saved Recipes', icon: 'bookmark', action: 'saved' },
      { label: 'My Comments', icon: 'comment' },
      { label: 'Liked Recipes', icon: 'heart' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Settings', icon: 'settings' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Contact Us', icon: 'mail' },
      { label: 'FAQ', icon: 'help' },
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

export default function ProfileScreen({ userId, email, onOpenSaved, onBack }: ProfileScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarChange}
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: 'none' }}
        />

        {profile?.avatar_url && /^https?:\/\//.test(profile.avatar_url) ? (
          <img src={profile.avatar_url} alt={displayName} className="w-[120px] h-[120px] rounded-full object-cover" />
        ) : (
          <div className="w-[120px] h-[120px] rounded-full flex items-center justify-center text-[36px] font-bold" style={{ backgroundColor: '#FFF0E6', color: '#F26B21' }}>{initial}</div>
        )}

        <button
          type="button"
          onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="mt-3 text-[13px] font-semibold disabled:opacity-60"
          style={{ color: '#F26B21' }}
        >
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
                  onClick={item.action === 'saved' ? onOpenSaved : undefined}
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
