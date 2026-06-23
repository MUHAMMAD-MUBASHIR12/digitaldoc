import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import AuthPortal from './components/AuthPortal';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import PublicVerification from './components/PublicVerification';
import Navbar from './components/Navbar';
import { supabase } from './services/supabase';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const params = new URLSearchParams(window.location.search);
  const initialPsid  = params.get('psid')  ?? undefined;
  const initialToken = params.get('token') ?? undefined;

  const [view, setView] = useState<'portal' | 'verify'>(initialPsid ? 'verify' : 'portal');

  const buildUserProfile = async (supabaseUserId: string, email: string, fullName?: string): Promise<User> => {
    const { data: profile, error } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', supabaseUserId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const p = profile as Record<string, unknown> | null;
    const rawRole = (p?.role as string | undefined)?.toLowerCase();
    const role = rawRole === 'admin' ? UserRole.ADMIN : UserRole.STUDENT;

    return {
      id: supabaseUserId,
      email,
      name: (p?.full_name as string) || fullName || email.split('@')[0],
      role,
    };
  };

  useEffect(() => {
    // onAuthStateChange is the primary auth driver — handles INITIAL_SESSION,
    // SIGNED_IN, TOKEN_REFRESHED, and SIGNED_OUT without any timers.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            try {
              const profile = await buildUserProfile(
                session.user.id,
                session.user.email ?? '',
                session.user.user_metadata?.full_name,
              );
              setUser(profile);
            } catch {
              setUser(null);
            }
          }
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        } else if (event === 'INITIAL_SESSION') {
          if (!session?.user) {
            setLoading(false);
          }
        }
      }
    );

    // Eager check so the loading state resolves immediately when a valid
    // session is already in localStorage (avoids a flash of the login page).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        try {
          const profile = await buildUserProfile(
            session.user.id,
            session.user.email ?? '',
            session.user.user_metadata?.full_name,
          );
          setUser(profile);
        } catch {
          setUser(null);
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    setView('portal');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setView('portal');
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <i className="fas fa-spinner fa-spin text-blue-600 text-3xl"></i>
        </div>
      );
    }
    if (view === 'verify') {
      return <PublicVerification initialPsid={initialPsid} initialToken={initialToken} />;
    }
    if (!user) return <AuthPortal onLogin={handleLogin} />;
    if (user.role === UserRole.ADMIN) return <AdminDashboard user={user} />;
    return <StudentDashboard user={user} />;
  };

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <Navbar
        user={user}
        onLogout={handleLogout}
        setView={setView}
        currentView={view}
      />
      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        {renderContent()}
      </main>
      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="space-y-2 text-center md:text-left">
              <p className="font-bold text-blue-600 text-lg">DigitalDoc</p>
              <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">University Registrar's Office &bull; Archive v2.5</p>
            </div>
            <div className="flex gap-10 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              <a href="#" className="hover:text-blue-600 transition-colors">Privacy</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Security Audit</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Nodes</a>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-50 text-center">
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.5em]">&copy; {new Date().getFullYear()} CRYPTOGRAPHICALLY SECURED LEDGER</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
