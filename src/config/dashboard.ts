import type {
  SidebarItem,
  IndexData,
  StockGainerLoser,
  DashboardStats,
} from "@/types/database";

export const dashboardConfig = {
  sidebar: {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "grid" },
      { label: "Portfolio", href: "/dashboard/portfolio", icon: "briefcase" },
      { label: "Trade", href: "/dashboard/trade", icon: "trade" },
      { label: "Watchlist", href: "/dashboard/watchlist", icon: "eye" },
      { label: "Data & Brokers", href: "/dashboard/broker", icon: "link", visible: false },
      { label: "Profile", href: "/dashboard/profile", icon: "user" },
    ] as SidebarItem[],
    settingsLabel: "Settings",
    settingsHref: "/dashboard/settings",
    logoutLabel: "Logout",
  },

  navbar: {
    pageTitles: {
      "/dashboard": "Dashboard",
      "/dashboard/portfolio": "Portfolio",
      "/dashboard/trade": "Trade Simulator",
      "/dashboard/trades": "Trades",
      "/dashboard/watchlist": "Watchlist",
      "/dashboard/settings": "Settings",
      "/dashboard/profile": "Profile & Settings",
      "/dashboard/broker": "Broker Integration",
    } as Record<string, string>,
    defaultTitle: "Dashboard",
    marketOpenLabel: "Market Open",
    marketClosedLabel: "Market Closed",
    profileMenuItems: {
      viewProfile: "View Profile",
      logout: "Logout",
    },
  },

  market: {
    openHour: 9,
    openMinute: 15,
    closeHour: 15,
    closeMinute: 30,
    timezone: "Asia/Kolkata",
  },

  greeting: {
    morning: "Good Morning",
    afternoon: "Good Afternoon",
    evening: "Good Evening",
  },

  welcomeSubtext: "Here's your market overview for today.",

  mockIndices: [
    {
      name: "NIFTY 50",
      value: 22456.8,
      change: 145.3,
      changePercent: 0.65,
      isPositive: true,
      sparklineData: [
        22100, 22180, 22150, 22220, 22280, 22250, 22310, 22350, 22320, 22400,
        22380, 22456,
      ],
    },
    {
      name: "BANK NIFTY",
      value: 48234.55,
      change: -234.1,
      changePercent: 0.48,
      isPositive: false,
      sparklineData: [
        48500, 48450, 48480, 48400, 48350, 48380, 48300, 48280, 48320, 48260,
        48250, 48234,
      ],
    },
  ] as IndexData[],

  mockGainers: [
    { symbol: "TATAMOTORS", change: 18.5, changePercent: 3.2, isPositive: true },
    { symbol: "RELIANCE", change: 68.4, changePercent: 2.8, isPositive: true },
    { symbol: "HDFCBANK", change: 32.1, changePercent: 2.1, isPositive: true },
    { symbol: "INFY", change: 28.6, changePercent: 1.9, isPositive: true },
    { symbol: "WIPRO", change: 6.8, changePercent: 1.5, isPositive: true },
  ] as StockGainerLoser[],

  mockLosers: [
    { symbol: "ADANIENT", change: -65.3, changePercent: 2.8, isPositive: false },
    { symbol: "BAJFINANCE", change: -148.2, changePercent: 2.1, isPositive: false },
    { symbol: "HINDUNILVR", change: -44.1, changePercent: 1.8, isPositive: false },
    { symbol: "SUNPHARMA", change: -17.5, changePercent: 1.5, isPositive: false },
    { symbol: "MARUTI", change: -142.3, changePercent: 1.2, isPositive: false },
  ] as StockGainerLoser[],

  mockStats: {
    virtualCash: 1000000,
    portfolioValue: 0,
    totalPnL: 0,
    totalPnLPercent: 0,
  } as DashboardStats,

  labels: {
    virtualCash: "Virtual Cash",
    portfolioValue: "Portfolio Value",
    totalPnL: "Total P&L",
    totalPnLPercent: "P&L %",
    topGainers: "Top Gainers",
    topLosers: "Top Losers",
    portfolioSummary: "Portfolio Summary",
    indices: "Market Indices",
  },

  currency: "₹",
} as const;
