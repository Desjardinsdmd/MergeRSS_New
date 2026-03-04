/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminAnalytics from './pages/AdminAnalytics';
import AdminHealth from './pages/AdminHealth';
import AdminImport from './pages/AdminImport';
import AdminReports from './pages/AdminReports';
import ArticleSearch from './pages/ArticleSearch';
import Bookmarks from './pages/Bookmarks';
import Dashboard from './pages/Dashboard';
import Digests from './pages/Digests';
import Directory from './pages/Directory';
import EmailFeeds from './pages/EmailFeeds';
import FeedCurator from './pages/FeedCurator';
import Feeds from './pages/Feeds';
import Inbox from './pages/Inbox';
import Integrations from './pages/Integrations';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Privacy from './pages/Privacy';
import RssFeedGenerator from './pages/RssFeedGenerator';
import Settings from './pages/Settings';
import Team from './pages/Team';
import Terms from './pages/Terms';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminAnalytics": AdminAnalytics,
    "AdminHealth": AdminHealth,
    "AdminImport": AdminImport,
    "AdminReports": AdminReports,
    "ArticleSearch": ArticleSearch,
    "Bookmarks": Bookmarks,
    "Dashboard": Dashboard,
    "Digests": Digests,
    "Directory": Directory,
    "EmailFeeds": EmailFeeds,
    "FeedCurator": FeedCurator,
    "Feeds": Feeds,
    "Inbox": Inbox,
    "Integrations": Integrations,
    "Landing": Landing,
    "Pricing": Pricing,
    "Privacy": Privacy,
    "RssFeedGenerator": RssFeedGenerator,
    "Settings": Settings,
    "Team": Team,
    "Terms": Terms,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};