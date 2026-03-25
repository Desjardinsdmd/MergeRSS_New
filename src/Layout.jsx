import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import ErrorBoundary from '@/components/ErrorBoundary';
import InboxBell from '@/components/layout/InboxBell';
import BookmarkBell from '@/components/layout/BookmarkBell';
import ReportProblemDialog from '@/components/ReportProblemDialog';
import {
  Rss,
  LayoutDashboard,
  FileText,
  Link2,
  Mail,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Crown,
  Activity,
  BarChart3,
  Zap,
  Inbox,
  Users,
  Globe,
  Search,
  Bookmark,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/ThemeProvider';
import { applyAccentColor } from '@/components/settings/ThemeSettings';
import { Toaster } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navigation = [
  { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard },
  { name: 'AI Curator', href: 'FeedCurator', icon: Zap },
  { name: 'Feeds', href: 'Feeds', icon: Rss },
  { name: 'Digests', href: 'Digests', icon: FileText },
  { name: 'Digest Reports', href: 'DigestReports', icon: BarChart3 },
  { name: 'Inbox', href: 'Inbox', icon: Inbox },
  { name: 'Read Later', href: 'Bookmarks', icon: Bookmark },

  { name: 'Email Feeds', href: 'EmailFeeds', icon: Mail },
  { name: 'Search', href: 'ArticleSearch', icon: Search },
  { name: 'Directory', href: 'Directory', icon: Globe },
  { name: 'Team', href: 'Team', icon: Users },
  { name: 'Integrations', href: 'Integrations', icon: Link2 },
  { name: 'Settings', href: 'Settings', icon: Settings },
];

// Hidden admin routes — removed from main navigation
// { name: 'RSS Generator', href: 'RssFeedGenerator', icon: Rss }, // → now backend-only via addSource()

const adminNav = [
  { name: 'System Health', href: 'AdminHealth', icon: Activity },
  { name: 'Problem Reports', href: 'AdminReports', icon: AlertCircle },
  { name: 'Import Feeds', href: 'AdminImport', icon: Globe },
  { name: 'Analytics', href: 'AdminAnalytics', icon: BarChart3 },
];

function BookmarkNavBadge({ user }) {
  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmarks-unread', user?.email],
    queryFn: () => base44.entities.Bookmark.filter({ created_by: user?.email }, '-created_date', 200),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const unread = bookmarks.filter(b => !b.is_read).length;
  if (!unread) return null;
  return (
    <span className="min-w-[18px] h-[18px] bg-[hsl(var(--primary))] text-stone-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none flex-shrink-0">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

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
    <span className="min-w-[18px] h-[18px] bg-[hsl(var(--primary))] text-stone-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none flex-shrink-0">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

function LayoutContent({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [themeTransitioning, setThemeTransitioning] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = { theme: 'dark', setTheme: () => {} };

  const publicPages = ['Landing', 'Pricing', 'Privacy', 'Terms'];
  const isPublicPage = publicPages.includes(currentPageName);

  // Initialize Google Analytics
  useEffect(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-KKX3RWJ7EY';
    document.head.appendChild(script);
    
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-KKX3RWJ7EY');
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        // Restore accent color preference on every page load
        if (userData?.accent_color) applyAccentColor(userData.accent_color);
      } catch (e) {
        // not authenticated — ok for public pages
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  const handleThemeChange = (newTheme) => {
    setThemeTransitioning(true);
    setTheme(newTheme);
    setTimeout(() => setThemeTransitioning(false), 300);
  };

  // Public pages layout
  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-[#0a0805]">
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0805]/90 backdrop-blur-lg border-b border-stone-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to={createPageUrl('Landing')} className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-[hsl(var(--primary))] flex items-center justify-center">
                  <Rss className="w-3.5 h-3.5 text-stone-900" />
                </div>
                <span className="font-bold text-stone-100 tracking-tight">MergeRSS</span>
              </Link>

              <nav className="hidden md:flex items-center gap-8">
                <Link to={createPageUrl('Landing')} className="text-sm text-stone-500 hover:text-stone-200 transition font-medium">
                  Home
                </Link>
                <Link to={createPageUrl('Pricing')} className="text-sm text-stone-500 hover:text-stone-200 transition font-medium">
                  Pricing
                </Link>
              </nav>

              <div className="flex items-center gap-3">
                {user ? (
                  <button
                    onClick={() => navigate(createPageUrl('Dashboard'))}
                    className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold px-5 py-2 text-sm transition-all"
                  >
                    Go to Dashboard
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="text-stone-500 hover:text-stone-200 text-sm font-medium transition"
                    >
                      Sign in
                    </button>
                    <button
                      onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                      className="bg-[hsl(var(--primary))] hover:opacity-90 text-stone-900 font-bold px-5 py-2 text-sm transition-all"
                    >
                      Get started
                    </button>
                  </>
                )}
              </div>
              {/* Loading state placeholder to avoid flash */}
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
      <div className="min-h-screen bg-[#0a0805] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
    return null;
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      "dark:bg-[#0a0805]",
      "light:bg-stone-50"
    )}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className={cn(
            "fixed inset-0 z-40 backdrop-blur-sm lg:hidden transition-colors duration-300",
            "dark:bg-black/60",
            "light:bg-black/30"
          )}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-60 bg-[hsl(var(--card))] border-r border-stone-800 dark:border-stone-800 light:border-stone-300 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-stone-800 dark:border-stone-800 light:border-stone-300 flex-shrink-0">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[hsl(var(--primary))] flex items-center justify-center">
              <Rss className="w-3 h-3 text-stone-900" />
            </div>
            <span className="font-bold text-stone-100 tracking-tight">MergeRSS</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close navigation menu" className="lg:hidden p-1 text-stone-600 hover:text-stone-300">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
          const isActive = currentPageName === item.href;
          const isInbox = item.href === 'Inbox';
          return (
            <TooltipProvider key={item.name}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={createPageUrl(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.name}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 rounded-md group focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a06]",
                      isActive
                        ? "bg-stone-800 text-[hsl(var(--primary))]"
                        : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4 flex-shrink-0 transition-transform duration-150 group-hover:scale-110",
                      isActive ? "text-[hsl(var(--primary))]" : "text-stone-500"
                    )} aria-hidden="true" />
                    <span className="flex-1">{item.name}</span>
                    {isInbox && <InboxNavBadge user={user} />}
                    {item.href === 'Bookmarks' && <BookmarkNavBadge user={user} />}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-stone-950 border border-stone-700 text-stone-100 text-xs">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
          })}

          {user?.role === 'admin' && (
            <>
              <div className="pt-5 pb-1 px-3">
                <p className="text-[10px] font-semibold text-stone-700 uppercase tracking-widest">Admin</p>
              </div>
              {adminNav.map((item) => {
                const isActive = currentPageName === item.href;
                return (
                  <TooltipProvider key={item.name}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={createPageUrl(item.href)}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={item.name}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all duration-150 rounded-md group focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a06]",
                            isActive
                              ? "bg-stone-800 text-[hsl(var(--primary))]"
                              : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
                          )}
                        >
                          <item.icon className={cn("w-4 h-4 transition-transform duration-150 group-hover:scale-110", isActive ? "text-[hsl(var(--primary))]" : "text-stone-500")} aria-hidden="true" />
                          {item.name}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-stone-950 border border-stone-700 text-stone-100 text-xs">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-stone-800 flex-shrink-0">
          {user?.plan !== 'premium' && (
            <Link
              to={createPageUrl('Pricing')}
              aria-label="Upgrade to Premium"
              className="flex items-center gap-2.5 px-3 py-2.5 mb-3 bg-[hsl(var(--primary))] text-stone-900 text-sm font-bold hover:opacity-90 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a06] focus-visible:ring-[hsl(var(--primary))]"
            >
              <Crown className="w-4 h-4" aria-hidden="true" />
              <span>Upgrade to Premium</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto" aria-hidden="true" />
            </Link>
          )}

          <div className="flex items-center gap-3 px-3 py-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-8 h-8 bg-stone-800 border border-stone-700 flex items-center justify-center text-sm font-bold text-[hsl(var(--primary))] flex-shrink-0 rounded cursor-help">
                  {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-stone-950 border border-stone-700 text-stone-100 text-xs">
                {user?.full_name || 'User'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-200 truncate">{user?.full_name || 'User'}</p>
            <p className="text-xs text-stone-400 truncate">{user?.email}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLogout} aria-label="Sign out" className="p-1 text-stone-600 hover:text-stone-300 transition flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a06] rounded">
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-stone-950 border border-stone-700 text-stone-100 text-xs">
                Sign out
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        {/* Desktop header */}
        <header className={cn(
          "hidden lg:block sticky top-0 z-30 border-b transition-colors duration-300",
          "dark:bg-[#0d0a06] dark:border-stone-800",
          "light:bg-stone-50 light:border-stone-200"
        )}>
          <div className="h-16 px-8 flex items-center justify-end gap-2">
            <button
              onClick={() => setReportDialogOpen(true)}
              title="Report a problem"
              className="p-1.5 text-stone-500 hover:text-[hsl(var(--primary))] transition"
            >
              <AlertCircle className="w-5 h-5" />
            </button>
            <BookmarkBell user={user} />
            <InboxBell user={user} />
          </div>
        </header>

        {/* Mobile header */}
        <header className={cn(
          "lg:hidden sticky top-0 z-30 border-b transition-colors duration-300",
          "dark:bg-[#0d0a06] dark:border-stone-800",
          "light:bg-stone-50 light:border-stone-200"
        )}>
          <div className="flex items-center justify-between h-14 px-4">
            <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" className="p-1.5 text-stone-500">
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[hsl(var(--primary))] flex items-center justify-center">
                <Rss className="w-3 h-3 text-stone-900" />
              </div>
              <span className="font-bold text-stone-100 tracking-tight">MergeRSS</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setReportDialogOpen(true)}
                title="Report a problem"
                className="p-1.5 text-stone-500 hover:text-[hsl(var(--primary))] transition"
              >
                <AlertCircle className="w-5 h-5" />
              </button>
              <BookmarkBell user={user} />
              <InboxBell user={user} />
            </div>
          </div>
        </header>

        <main className="min-h-screen">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Report Dialog */}
      <ReportProblemDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        user={user}
      />
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

function LayoutWithReportDialog({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <>
      <Layout children={children} currentPageName={currentPageName} />
      {user && (
        <ReportProblemDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          user={user}
        />
      )}
    </>
  );
}