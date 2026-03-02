import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import ErrorBoundary from '@/components/ErrorBoundary';
import InboxBell from '@/components/layout/InboxBell';
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
  Activity,
  Zap,
  Inbox,
  Users,
  Globe,
  Moon,
  Sun,
  Search,
  Bookmark
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from 'sonner';

const navigation = [
  { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard },
  { name: 'AI Curator', href: 'FeedCurator', icon: Zap },
  { name: 'Feeds', href: 'Feeds', icon: Rss },
  { name: 'Digests', href: 'Digests', icon: FileText },
  { name: 'Inbox', href: 'Inbox', icon: Inbox },
  { name: 'Read Later', href: 'Bookmarks', icon: Bookmark },
  { name: 'RSS Generator', href: 'RssFeedGenerator', icon: Rss },
  { name: 'Search', href: 'ArticleSearch', icon: Search },
  { name: 'Directory', href: 'Directory', icon: Globe },
  { name: 'Team', href: 'Team', icon: Users },
  { name: 'Integrations', href: 'Integrations', icon: Link2 },
  { name: 'Settings', href: 'Settings', icon: Settings },
];

const adminNav = [
  { name: 'System Health', href: 'AdminHealth', icon: Activity },
  { name: 'Import Feeds', href: 'AdminImport', icon: Globe },
];

function InboxNavBadge({ user }) {
  const { data: digests = [] } = useQuery({
    queryKey: ['nav-digests', user?.email],
    queryFn: () => base44.entities.Digest.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 60000,
  });

  const digestIds = digests.map(d => d.id);

  const { data: deliveries = [] } = useQuery({
    queryKey: ['nav-inboxCount', user?.email, digestIds.join(',')],
    queryFn: () => base44.entities.DigestDelivery.filter(
      { digest_id: { $in: digestIds }, delivery_type: 'web', status: 'sent', is_read: false },
      '-created_date',
      100
    ),
    enabled: !!user && digestIds.length > 0,
    refetchInterval: 60000,
  });

  const unread = deliveries.length;
  if (!unread) return null;

  return (
    <span className="min-w-[18px] h-[18px] bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none flex-shrink-0">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

function LayoutContent({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { theme, setTheme, mounted } = useTheme();

  const publicPages = ['Landing', 'Pricing', 'Privacy', 'Terms'];
  const isPublicPage = publicPages.includes(currentPageName);

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Only try to load user if they might be authenticated
        // For public pages, skip authentication check to avoid login prompts
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        // not authenticated or error - that's ok for public pages
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
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-lg border-b border-slate-100 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to={createPageUrl('Landing')} className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Rss className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">MergeRSS</span>
              </Link>

              <nav className="hidden md:flex items-center gap-8">
                <Link to={createPageUrl('Landing')} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium">
                  Home
                </Link>
                <Link to={createPageUrl('Pricing')} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition font-medium">
                  Pricing
                </Link>
              </nav>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="text-slate-600 dark:text-slate-400"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                {user ? (
                  <Button
                    onClick={() => navigate(createPageUrl('Dashboard'))}
                    className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm"
                  >
                    Go to Dashboard
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="text-slate-600 dark:text-slate-300 text-sm font-medium"
                    >
                      Sign in
                    </Button>
                    <Button
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm"
                    >
                      Get started
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="pt-16">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-60 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Rss className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white tracking-tight">MergeRSS</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = currentPageName === item.href;
            const isInbox = item.href === 'Inbox';
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.href)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <item.icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
                <span className="flex-1">{item.name}</span>
                {isInbox && <InboxNavBadge user={user} />}
              </Link>
            );
          })}

          {user?.role === 'admin' && (
            <>
              <div className="pt-5 pb-1 px-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Admin</p>
              </div>
              {adminNav.map((item) => {
                const isActive = currentPageName === item.href;
                return (
                  <Link
                    key={item.name}
                    to={createPageUrl(item.href)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-indigo-600" : "text-slate-400")} />
                    {item.name}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
          {user?.plan !== 'premium' && (
            <Link
              to={createPageUrl('Pricing')}
              className="flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-medium hover:from-indigo-700 hover:to-indigo-800 transition"
            >
              <Crown className="w-4 h-4" />
              <span>Upgrade to Premium</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />
            </Link>
          )}

          <div className="flex items-center justify-between px-3 py-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-slate-600 dark:text-slate-400 h-8 w-8"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </div>

          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
              {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.full_name || 'User'}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between h-14 px-4">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-slate-600 dark:text-slate-400">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                <Rss className="w-3 h-3 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white tracking-tight">MergeRSS</span>
            </div>
            <div className="flex items-center gap-1">
              <InboxBell user={user} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-slate-600 dark:text-slate-400"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-screen">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
      <Toaster />
    </ThemeProvider>
  );
}