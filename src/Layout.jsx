import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { 
  Rss, 
  LayoutDashboard, 
  FileText, 
  Link2, 
  Settings, 
  LogOut,
  Menu,
  X,
  ChevronRight,
  Crown,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard },
  { name: 'Feeds', href: 'Feeds', icon: Rss },
  { name: 'Digests', href: 'Digests', icon: FileText },
  { name: 'Inbox', href: 'Inbox', icon: FileText },
  { name: 'Integrations', href: 'Integrations', icon: Link2 },
  { name: 'Settings', href: 'Settings', icon: Settings },
];

const adminNav = [
  { name: 'System Health', href: 'AdminHealth', icon: Activity },
];

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const publicPages = ['Landing', 'Pricing'];
  const isPublicPage = publicPages.includes(currentPageName);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const userData = await base44.auth.me();
          setUser(userData);
        }
      } catch (e) {
        console.log('Not authenticated');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  // Public pages layout
  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to={createPageUrl('Landing')} className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Rss className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-lg text-slate-900">MergeRSS</span>
              </Link>
              
              <nav className="hidden md:flex items-center gap-8">
                <Link to={createPageUrl('Landing')} className="text-sm text-slate-600 hover:text-slate-900 transition">
                  Home
                </Link>
                <Link to={createPageUrl('Pricing')} className="text-sm text-slate-600 hover:text-slate-900 transition">
                  Pricing
                </Link>
              </nav>

              <div className="flex items-center gap-3">
                {user ? (
                  <Button 
                    onClick={() => navigate(createPageUrl('Dashboard'))}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Dashboard
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="text-slate-600"
                    >
                      Sign in
                    </Button>
                    <Button 
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="bg-violet-600 hover:bg-violet-700"
                    >
                      Get Started
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="pt-16">
          {children}
        </main>
      </div>
    );
  }

  // App pages layout
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100">
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Rss className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg text-slate-900">MergeRSS</span>
            </Link>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = currentPageName === item.href;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-violet-50 text-violet-700" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}

            {user?.role === 'admin' && (
              <>
                <div className="pt-4 pb-2">
                  <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Admin
                  </div>
                </div>
                {adminNav.map((item) => {
                  const isActive = currentPageName === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.href)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-violet-50 text-violet-700" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-100">
            {user?.plan === 'free' && (
              <Link
                to={createPageUrl('Pricing')}
                className="flex items-center gap-2 px-3 py-2 mb-3 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg text-sm text-violet-700 hover:from-violet-100 hover:to-indigo-100 transition"
              >
                <Crown className="w-4 h-4" />
                <span className="font-medium">Upgrade to Premium</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </Link>
            )}
            
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center text-sm font-medium text-slate-600">
                {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between h-14 px-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-slate-600"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Rss className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-slate-900">MergeRSS</span>
            </div>
            <div className="w-8" />
          </div>
        </header>

        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}