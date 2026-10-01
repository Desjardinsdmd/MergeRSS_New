import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import ErrorBoundary from '@/components/ErrorBoundary';
import InboxBell from '@/components/layout/InboxBell';
import BookmarkBell from '@/components/layout/BookmarkBell';
import ReportProblemDialog from '@/components/ReportProblemDialog';
import {
  Rss,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Crown,
  Activity,
  BarChart3,
  Inbox,
  Users,
  Globe,
  Search,
  AlertCircle,
  Newspaper,
  SlidersHorizontal,
  Sun,
  MailPlus,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/ThemeProvider';
import { applyAccentColor } from '@/components/settings/ThemeSettings';
import { Toaster } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Logo, MicroLabel } from '@/components/brand/Brand';

// Primary navigation. `match` lists pages that highlight the item (routes that were removed
// from the sidebar still work and light up their parent). `children` show only while the
// parent or a child is active.
const navigation = [
  { name: 'Today', href: 'Dashboard', icon: Sun, match: ['Dashboard'] },
  {
    name: 'Briefings', href: 'Digests', icon: FileText, match: ['Digests', 'DigestReports'],
    children: [{ name: 'Reports', href: 'DigestReports' }],
  },
  { name: 'Inbox', href: 'Inbox', icon: Inbox, match: ['Inbox', 'Bookmarks'] },
  { name: 'Sources', href: 'Feeds', icon: Rss, match: ['Feeds', 'Directory', 'FeedCurator', 'RssFeedGenerator'] },
  { name: 'Search', href: 'ArticleSearch', icon: Search, match: ['ArticleSearch'] },
  { name: 'Newsletters', href: 'Newsletters', icon: MailPlus, match: ['Newsletters'] },
  { name: 'Team', href: 'Team', icon: Users, match: ['Team'] },
  {
    name: 'Settings', href: 'Settings', icon: Settings, match: ['Settings', 'Integrations'],
    children: [{ name: 'Integrations', href: 'Integrations' }],
  },
];

// Pages a signed-in user can open before finishing onboarding.
const ONBOARDING_EXEMPT = ['Welcome'];

const adminNav = [
  // Admin-only features (single-tenant by design for now: they run on the app
  // owner's X account). Backend functions enforce this too.
  { name: 'Publications', href: 'Publications', icon: Newspaper },
  { name: 'X Drafts', href: 'Drafts', icon: Send },
  { name: 'Lenses', href: 'SettingsLenses', icon: SlidersHorizontal },
  { name: 'System Health', href: 'AdminHealth', icon: Activity },
  { name: 'Problem Reports', href: 'AdminReports', icon: AlertCircle },
  { name: 'Import Sources', href: 'AdminImport', icon: Globe },
  { name: 'Analytics', href: 'AdminAnalytics', icon: BarChart3 },
];

const PUBLIC_PAGES = ['Landing', 'Pricing', 'Privacy', 'Terms'];

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
    <span className="font-mono text-[11px] font-medium text-emerald-300">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

function NavLink({ item, active, onClick, badge }) {
  return (
    <Link
      to={createPageUrl(item.href)}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn('nav-item outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]', active && 'nav-item-active')}
    >
      <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-stone-100' : 'text-stone-500')} aria-hidden="true" />
      <span className="flex-1">{item.name}</span>
      {badge}
    </Link>
  );
}

/** Header used by all public (marketing) pages. */
function PublicHeader({ user, navigate }) {
  return (
    <header className="fixed left-0 right-0 top-0 z-50">
      <div className="mx-auto mt-3 max-w-6xl px-4 sm:px-6">
        <div className="panel flex h-14 items-center justify-between px-4 sm:px-5">
          <Link to={createPageUrl('Landing')} aria-label="MergeRSS home">
            <Logo size="sm" tagline={false} />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <Link to={createPageUrl('Landing')} className="text-sm font-medium text-stone-400 transition hover:text-stone-100">Product</Link>
            <Link to={createPageUrl('Pricing')} className="text-sm font-medium text-stone-400 transition hover:text-stone-100">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <button onClick={() => navigate(createPageUrl('Dashboard'))} className="btn-brand py-1.5">
                Open MergeRSS
              </button>
            ) : (
              <>
                <button
                  onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                  className="hidden px-2 text-sm font-medium text-stone-400 transition hover:text-stone-100 sm:block"
                >
                  Sign in
                </button>
                <button onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))} className="btn-brand py-1.5">
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function LayoutContent({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const navigate = useNavigate();

  const isPublicPage = PUBLIC_PAGES.includes(currentPageName);

  // Google Analytics
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
        if (userData?.accent_color) applyAccentColor(userData.accent_color);
      } catch (e) {
        // not authenticated, fine for public pages
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  if (isPublicPage) {
    return (
      <div className="app-backdrop min-h-screen">
        <PublicHeader user={user} navigate={navigate} />
        <main className="pt-20">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    base44.auth.redirectToLogin(createPageUrl('Dashboard'));
    return null;
  }

  // First run: anyone who has not finished onboarding goes to the Welcome flow.
  // Admins are exempt so the operator console is never blocked by the flow.
  if (user.onboarding_complete !== true && user.role !== 'admin' && !ONBOARDING_EXEMPT.includes(currentPageName)) {
    return <Navigate to={createPageUrl('Welcome')} replace />;
  }

  if (currentPageName === 'Welcome') {
    return (
      <div className="app-backdrop min-h-screen">
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="app-backdrop min-h-screen">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar: floating glass panel */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-[264px] p-3 transition-transform duration-200 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="panel flex h-full flex-col bg-[#120F1A]/90">
          <div className="flex items-center justify-between px-4 pb-4 pt-5">
            <Link to={createPageUrl('Dashboard')} aria-label="MergeRSS, go to Today">
              <Logo />
            </Link>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation menu" className="rounded-lg p-1 text-stone-500 hover:text-stone-200 lg:hidden">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
            <MicroLabel className="px-3 pb-2 pt-1">Workspace</MicroLabel>
            {navigation.map((item) => {
              const isActive = (item.match || [item.href]).includes(currentPageName);
              return (
                <div key={item.name}>
                  <NavLink
                    item={item}
                    active={isActive}
                    onClick={() => setSidebarOpen(false)}
                    badge={item.href === 'Inbox' ? <InboxNavBadge user={user} /> : null}
                  />
                  {item.children && isActive && (
                    <div className="mb-1 ml-9 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                      {item.children.map(child => {
                        const childActive = currentPageName === child.href;
                        return (
                          <Link
                            key={child.href}
                            to={createPageUrl(child.href)}
                            aria-current={childActive ? 'page' : undefined}
                            onClick={() => setSidebarOpen(false)}
                            className={cn('block rounded-lg px-2 py-1.5 text-[13px]', childActive ? 'text-stone-100' : 'text-stone-500 hover:text-stone-200')}
                          >
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {user?.role === 'admin' && (
              <>
                <MicroLabel className="px-3 pb-2 pt-5">Admin</MicroLabel>
                {adminNav.map((item) => (
                  <NavLink key={item.name} item={item} active={currentPageName === item.href} onClick={() => setSidebarOpen(false)} />
                ))}
              </>
            )}
          </nav>

          <div className="space-y-2 border-t border-white/[0.06] p-3">
            {user?.plan !== 'premium' && (
              <Link to={createPageUrl('Pricing')} aria-label="Upgrade to Premium" className="btn-brand w-full justify-start">
                <Crown className="h-4 w-4" aria-hidden="true" />
                <span>Upgrade to Premium</span>
                <ChevronRight className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
            <div className="flex items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => setReportDialogOpen(true)}
                title="Report a problem"
                aria-label="Report a problem"
                className="rounded-lg p-1.5 text-stone-500 transition hover:text-stone-100"
              >
                <AlertCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              <BookmarkBell user={user} />
              <InboxBell user={user} />
            </div>
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.16)] font-display text-sm font-semibold text-[#D9C7FE]">
                {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-200">{user?.full_name || 'User'}</p>
                <p className="truncate font-mono text-[11px] text-stone-500">{user?.email}</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={handleLogout} aria-label="Sign out" className="rounded-lg p-1 text-stone-500 transition hover:text-stone-200">
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sign out</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[264px]">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
          <div className="panel flex h-14 items-center justify-between px-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" className="rounded-lg p-1.5 text-stone-400">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <Logo size="sm" tagline={false} />
            <div className="flex items-center gap-1">
              <BookmarkBell user={user} />
              <InboxBell user={user} />
            </div>
          </div>
        </header>

        <main className="min-h-screen p-3 lg:py-3 lg:pl-0 lg:pr-3">
          <div className="panel min-h-[calc(100vh-1.5rem)] bg-[#100E17]/80">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>

      <ReportProblemDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} user={user} />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
      <Toaster theme="dark" toastOptions={{ className: 'font-sans' }} />
    </ThemeProvider>
  );
}
