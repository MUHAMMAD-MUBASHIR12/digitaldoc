
import React, { useState } from 'react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  setView: (view: 'portal' | 'verify') => void;
  currentView: string;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, setView, currentView }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNav = (v: 'portal' | 'verify') => {
    setView(v);
    setIsMenuOpen(false);
  };

  return (
    <nav className="bg-white/90 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-[150] px-2 md:px-4">
      <div className="container mx-auto h-16 md:h-20 flex items-center justify-between">
        <div 
          className="flex items-center space-x-2 md:space-x-3 cursor-pointer group" 
          onClick={() => handleNav('portal')}
        >
          <div className="bg-blue-600 w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 transition-transform active:scale-95">
             <i className="fas fa-file-shield text-white text-xs md:text-sm"></i>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base md:text-lg tracking-tight text-blue-600 leading-none">Digital<span className="text-slate-400">Doc</span></span>
            <span className="hidden md:block text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Secure Records</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-6">
          <div className="hidden md:flex items-center space-x-2">
            <button 
              onClick={() => handleNav('portal')}
              className={`text-[11px] uppercase tracking-widest font-bold transition-all px-4 py-2 rounded-xl ${currentView === 'portal' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => handleNav('verify')}
              className={`text-[11px] uppercase tracking-widest font-bold transition-all px-4 py-2 rounded-xl ${currentView === 'verify' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
            >
              Validator
            </button>
          </div>
          
          {user ? (
            <div className="flex items-center space-x-2 md:space-x-4 pl-2 md:pl-4 border-l border-slate-100">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-bold text-slate-900 leading-none">{user.name}</p>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{user.role}</p>
              </div>
              <button 
                onClick={onLogout}
                className="bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl transition-all flex items-center justify-center border border-slate-100 hover:border-red-100 active:scale-90"
                title="Logout"
              >
                <i className="fas fa-power-off text-xs"></i>
              </button>
              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="md:hidden bg-slate-50 w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 border border-slate-100 active:scale-90"
              >
                <i className={`fas ${isMenuOpen ? 'fa-times' : 'fa-bars'} text-xs`}></i>
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
               <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Secure Link</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-50 animate-slideDown overflow-hidden">
          <div className="flex flex-col p-4 space-y-2">
            <button 
              onClick={() => handleNav('portal')}
              className={`w-full text-left py-4 px-4 rounded-xl text-xs font-bold uppercase tracking-widest ${currentView === 'portal' ? 'bg-blue-600 text-white' : 'text-slate-500 bg-slate-50'}`}
            >
              <i className="fas fa-chart-pie mr-3"></i>
              Dashboard
            </button>
            <button 
              onClick={() => handleNav('verify')}
              className={`w-full text-left py-4 px-4 rounded-xl text-xs font-bold uppercase tracking-widest ${currentView === 'verify' ? 'bg-blue-600 text-white' : 'text-slate-500 bg-slate-50'}`}
            >
              <i className="fas fa-shield-check mr-3"></i>
              Public Validator
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
