import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { supabase } from '../services/supabase';

interface AuthPortalProps {
  onLogin: (user: User) => void;
}

const AuthPortal: React.FC<AuthPortalProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        console.error('[Auth] signInWithPassword failed — full error object:', authError);
        console.error('[Auth] error.message:', authError.message, '| error.status:', authError.status);
        if (authError.message.toLowerCase().includes('email not confirmed')) {
          throw new Error(
            'Email not confirmed. In Supabase dashboard go to Authentication → Users, click the user, and choose "Confirm email" — or disable "Email confirmations" in Auth → Settings.'
          );
        }
        const statusHint = authError.status ? ` [HTTP ${authError.status}]` : '';
        throw new Error(`${authError.message}${statusHint}`);
      }

      if (!data.user) throw new Error('Login succeeded but no user was returned. Check Supabase Auth logs.');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, full_name')
        .eq('id', data.user.id)
        .limit(1)
        .maybeSingle();

      if (profileError) {
        console.error('[Auth] users table query failed — full error object:', profileError);
        throw new Error(`Profile lookup failed: ${profileError.message}`);
      }

      if (!profile) {
        const noProfileMsg =
          `Authenticated in Supabase Auth (id: ${data.user.id}) but no matching row exists in the "users" table. ` +
          `Create the profile row with: INSERT INTO public.users (id, email, full_name, role) VALUES ('${data.user.id}', '${trimmedEmail}', 'Your Name', 'admin');`;
        console.error('[Auth]', noProfileMsg);
        await supabase.auth.signOut();
        throw new Error(noProfileMsg);
      }

      const rawRole = (profile.role as string | undefined)?.toLowerCase();
      const role = rawRole === 'admin' ? UserRole.ADMIN : UserRole.STUDENT;

      const userData: User = {
        id: data.user.id,
        email: data.user.email ?? trimmedEmail,
        name: profile.full_name || data.user.user_metadata?.full_name || trimmedEmail.split('@')[0],
        role,
      };

      onLogin(userData);
    } catch (err: unknown) {
      console.error('[Auth] Caught in outer catch — full object:', err);
      const message = err instanceof Error 
  ? err.message 
  : (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-8 animate-fadeIn">
      <div className="text-center mb-8 md:mb-14 space-y-4 max-w-3xl">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-200">
           <i className="fas fa-file-shield text-white text-2xl"></i>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          DigitalDoc – <span className="text-blue-600">Instant, Secure & Verified Academic Documents</span>
        </h1>
        <p className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-[0.3em] px-4">Trusted Academic Record Authentication Platform</p>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-100 p-6 sm:p-10 w-full max-w-md transition-all">
        <div className="text-center mb-10">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Portal Authentication</h2>
          <p className="text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-widest">Authorized Access Only</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-600/5 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-700 text-sm font-medium"
              placeholder="student@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Secure PIN</label>
            <input
              type="password"
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-600/5 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-700 text-sm font-medium"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 transition-all text-xs uppercase tracking-widest active:scale-[0.98] mt-2 disabled:bg-slate-400 disabled:shadow-none"
          >
            {isLoading ? <i className="fas fa-spinner fa-spin"></i> : 'Access My Documents'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default AuthPortal;
