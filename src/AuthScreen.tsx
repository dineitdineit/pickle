import { FormEvent, useState } from 'react';
import { supabase } from './lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
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

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage('');
    setErrorMessage('');
  }

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

            <button type="submit" disabled={loading} className="w-full h-12 rounded-[8px] text-white text-[15px] font-semibold disabled:opacity-60" style={{ backgroundColor: '#F26B21' }}>
              {loading ? 'Please wait…' : 'Create account'}
            </button>

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
      <div className="px-6 pt-[70px]">
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

          <button type="submit" disabled={loading} className="w-full h-12 rounded-[8px] text-white text-[15px] font-semibold disabled:opacity-60" style={{ backgroundColor: '#F26B21' }}>
            {loading ? 'Please wait…' : 'Log in'}
          </button>

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
