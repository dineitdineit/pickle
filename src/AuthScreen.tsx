import { FormEvent, useState } from 'react';
import { supabase } from './lib/supabase';

type Mode = 'signin' | 'signup';
type SocialProvider = 'google' | 'apple';

type AuthScreenProps = {
  onBack: () => void;
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.38Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.39l-3.23-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.08v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.93A6.02 6.02 0 0 1 6.1 12c0-.67.11-1.32.31-1.93V7.48H3.08A10 10 0 0 0 2 12c0 1.61.39 3.13 1.08 4.52l3.33-2.59Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a9.99 9.99 0 0 0-8.92 5.48l3.33 2.59C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.79 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.1v-.01ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

export default function AuthScreen({ onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setErrorMessage('');

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const cleanUsername = username.trim();
    const cleanDisplayName = displayName.trim();
    if (!cleanUsername || !cleanDisplayName) {
      setErrorMessage('Please enter a username and display name.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: cleanDisplayName,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
    } else if (!data.session) {
      setMessage('Account created. Check your email to confirm your account, then sign in.');
    }
    setLoading(false);
  }

  async function handleSocialAuth(provider: SocialProvider) {
    setSocialLoading(provider);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setSocialLoading(null);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage('');
    setErrorMessage('');
  }

  const socialButtons = (
    <div className="space-y-3">
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1" style={{ backgroundColor: '#E8E8E8' }} />
        <span className="text-[12px]" style={{ color: '#A0A0A0' }}>or continue with</span>
        <div className="h-px flex-1" style={{ backgroundColor: '#E8E8E8' }} />
      </div>

      <button
        type="button"
        onClick={() => handleSocialAuth('google')}
        disabled={Boolean(socialLoading)}
        className="w-full h-12 rounded-[8px] border flex items-center justify-center gap-3 text-[14px] font-semibold disabled:opacity-60"
        style={{ borderColor: '#E5E5E5', backgroundColor: '#FFFFFF', color: '#1F1F1F' }}
      >
        <GoogleIcon />
        {socialLoading === 'google' ? 'Connecting…' : 'Continue with Google'}
      </button>

      <button
        type="button"
        onClick={() => handleSocialAuth('apple')}
        disabled={Boolean(socialLoading)}
        className="w-full h-12 rounded-[8px] flex items-center justify-center gap-3 text-[14px] font-semibold disabled:opacity-60"
        style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
      >
        <AppleIcon />
        {socialLoading === 'apple' ? 'Connecting…' : 'Continue with Apple'}
      </button>
    </div>
  );

  if (mode === 'signup') {
    return (
      <div className="pb-28">
        <div className="px-6 pt-[72px]">
          <button
            type="button"
            onClick={() => changeMode('signin')}
            aria-label="Back to log in"
            className="w-9 h-9 flex items-center justify-center mb-8"
            style={{ color: '#1F1F1F' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex justify-center mb-6">
            <img src="/assets/logo.png" alt="Pickle" className="w-[88px] h-[88px] rounded-[24px] object-cover" />
          </div>

          <div className="text-center mb-7">
            <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Create your account</h1>
            <p className="text-[14px] mt-2" style={{ color: '#777777' }}>Save recipes and build your own Pickle profile.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="Your name" autoComplete="name" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="picklefan" autoCapitalize="none" autoComplete="username" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="At least 6 characters" autoComplete="new-password" />
            </div>

            {errorMessage && <p className="text-[13px] leading-5" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
            {message && <p className="text-[13px] leading-5" style={{ color: '#5F6F52' }}>{message}</p>}

            <button type="submit" disabled={loading || Boolean(socialLoading)} className="w-full h-12 rounded-[8px] text-white text-[15px] font-semibold disabled:opacity-60" style={{ backgroundColor: '#F26B21' }}>
              {loading ? 'Please wait…' : 'Create account'}
            </button>

            {socialButtons}

            <div className="text-center">
              <button type="button" onClick={() => changeMode('signin')} className="text-[12px] font-normal" style={{ color: '#A0A0A0' }}>
                Already have an account? Log in
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="px-4 pt-5">
        <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 flex items-center justify-center" style={{ color: '#1F1F1F' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="px-6 pt-[25px]">
        <div className="flex justify-center mb-6">
          <img src="/assets/logo.png" alt="Pickle" className="w-[88px] h-[88px] rounded-[24px] object-cover" />
        </div>

        <div className="text-center mb-7">
          <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Welcome back</h1>
          <p className="text-[14px] mt-2" style={{ color: '#777777' }}>Sign in to keep your Pickle activity with you.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" />
          </div>

          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="At least 6 characters" autoComplete="current-password" />
          </div>

          {errorMessage && <p className="text-[13px] leading-5" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
          {message && <p className="text-[13px] leading-5" style={{ color: '#5F6F52' }}>{message}</p>}

          <button type="submit" disabled={loading || Boolean(socialLoading)} className="w-full h-12 rounded-[8px] text-white text-[15px] font-semibold disabled:opacity-60" style={{ backgroundColor: '#F26B21' }}>
            {loading ? 'Please wait…' : 'Log in'}
          </button>

          {socialButtons}

          <div className="flex items-center justify-center gap-3 text-[12px]">
            <button type="button" onClick={() => changeMode('signup')} className="font-normal" style={{ color: '#A0A0A0' }}>
              Sign up
            </button>
            <span style={{ color: '#D0D0D0' }}>·</span>
            <button type="button" className="font-normal" style={{ color: '#A0A0A0' }}>
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
