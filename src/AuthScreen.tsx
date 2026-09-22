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

  return (
    <div className="pb-28">
      <div className="px-4 pt-6 text-center">
        <h1 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>Profile</h1>
      </div>

      <div className="px-6 pt-[50px]">
        <div className="flex justify-center mb-6">
          <img src="/assets/pickle-logo.png" alt="Pickle" className="w-[88px] h-[88px] rounded-[24px] object-cover" />
        </div>

        <div className="text-center mb-7">
          <h2 className="font-bold text-[24px]" style={{ color: '#1F1F1F' }}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="text-[14px] mt-2" style={{ color: '#777777' }}>
            {mode === 'signin' ? 'Sign in to keep your Pickle activity with you.' : 'Save recipes and build your own Pickle profile.'}
          </p>
        </div>

        <div className="p-2.5 flex gap-1 mb-6" style={{ backgroundColor: '#F5F5F5', borderRadius: 24 }}>
          <button
            type="button"
            onClick={() => changeMode('signin')}
            className="flex-1 h-10 rounded-[16px] text-[14px] font-semibold transition-colors"
            style={mode === 'signin'
              ? { backgroundColor: '#FFFFFF', color: '#F26B21', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#6F6F6F' }}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => changeMode('signup')}
            className="flex-1 h-10 rounded-[16px] text-[14px] font-semibold transition-colors"
            style={mode === 'signup'
              ? { backgroundColor: '#FFFFFF', color: '#F26B21', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: '#6F6F6F' }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Display name</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="Your name" autoComplete="name" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="picklefan" autoCapitalize="none" autoComplete="username" />
              </div>
            </>
          )}

          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" />
          </div>

          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: '#444444' }}>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 px-4 rounded-[12px] border outline-none text-[15px]" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#1F1F1F' }} placeholder="At least 6 characters" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </div>

          {errorMessage && <p className="text-[13px] leading-5" style={{ color: '#C53D2E' }}>{errorMessage}</p>}
          {message && <p className="text-[13px] leading-5" style={{ color: '#5F6F52' }}>{message}</p>}

          <button type="submit" disabled={loading} className="w-full h-12 rounded-[12px] text-white text-[15px] font-semibold disabled:opacity-60" style={{ backgroundColor: '#F26B21' }}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Create account'}
          </button>

          {mode === 'signin' && (
            <div className="text-center">
              <button type="button" className="text-[12px] font-normal" style={{ color: '#A0A0A0' }}>
                Forgot password?
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
