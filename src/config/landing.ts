import type { LandingConfig } from "@/types/landing";

export const landingConfig: LandingConfig = {
  appName: "TradeShala",
  tagline: "Your virtual paper trading playground",
  description:
    "Master the art of trading without risking real money. Practice with virtual funds, learn strategies, and build confidence before entering the real market.",

  navLinks: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Testimonials", href: "#testimonials" },
  ],

  hero: {
    headline: "Master Trading Without the",
    highlightedWord: "Risk",
    subheadline:
      "Practice trading with virtual ₹10,00,000. Learn strategies, track performance, and build confidence — all without risking a single rupee.",
    ctaButtons: [
      { label: "Start Trading Free", href: "#", variant: "primary" },
      { label: "Learn More", href: "#features", variant: "secondary" },
    ],
    badges: [
      { text: "No Real Money Required" },
      { text: "Real-Time Market Data" },
      { text: "100% Free" },
    ],
  },

  stats: [
    { value: "10,000+", label: "Active Traders" },
    { value: "₹50Cr+", label: "Virtual Trades" },
    { value: "95%", label: "User Satisfaction" },
    { value: "24/7", label: "Market Access" },
  ],

  features: [
    {
      icon: "📊",
      title: "Real-Time Market Data",
      description:
        "Get live prices from NSE & BSE. Practice with real market conditions and make informed decisions.",
    },
    {
      icon: "💰",
      title: "Virtual Portfolio",
      description:
        "Start with ₹10,00,000 in virtual funds. Build and manage your portfolio just like the real thing.",
    },
    {
      icon: "📈",
      title: "Performance Analytics",
      description:
        "Track your P&L, win rate, and trading patterns. Detailed charts and insights to improve your strategy.",
    },
    {
      icon: "🎓",
      title: "Learn & Earn",
      description:
        "Access curated tutorials, trading strategies, and market analysis. Learn from experts and community.",
    },
    {
      icon: "🏆",
      title: "Leaderboards & Contests",
      description:
        "Compete with other traders in weekly contests. Climb the leaderboard and earn bragging rights.",
    },
    {
      icon: "🔔",
      title: "Smart Alerts",
      description:
        "Set price alerts and get notified instantly. Never miss a trading opportunity again.",
    },
  ],

  howItWorks: [
    {
      stepNumber: 1,
      title: "Create Your Account",
      description:
        "Sign up in seconds with your email or Google account. No KYC or documents needed.",
    },
    {
      stepNumber: 2,
      title: "Get Virtual Funds",
      description:
        "Receive ₹10,00,000 in virtual money instantly. Ready to trade from day one.",
    },
    {
      stepNumber: 3,
      title: "Start Trading",
      description:
        "Buy and sell stocks, track your portfolio, and learn the market — risk-free.",
    },
  ],

  testimonials: [
    {
      name: "Priya Sharma",
      role: "College Student",
      avatarInitials: "PS",
      text: "TradeShala helped me understand the stock market before investing my savings. The virtual portfolio feature is amazing!",
      rating: 5,
    },
    {
      name: "Rahul Verma",
      role: "Software Engineer",
      avatarInitials: "RV",
      text: "I've been using TradeShala for 3 months and my real trading has improved significantly. The analytics are top-notch.",
      rating: 5,
    },
    {
      name: "Anita Desai",
      role: "Business Owner",
      avatarInitials: "AD",
      text: "Finally a platform that lets me practice without fear. The contests keep me motivated to learn more every day.",
      rating: 4,
    },
  ],

  cta: {
    headline: "Ready to Start Your Trading Journey?",
    subheadline:
      "Join thousands of traders who are learning and growing with TradeShala. It's completely free.",
    buttonText: "Create Free Account",
    buttonHref: "#",
  },

  footer: {
    description:
      "India's most trusted paper trading platform. Learn, practice, and master the stock market without any risk.",
    linkGroups: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "How It Works", href: "#how-it-works" },
          { label: "Pricing", href: "#" },
          { label: "FAQ", href: "#" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "About Us", href: "#" },
          { label: "Blog", href: "#" },
          { label: "Careers", href: "#" },
          { label: "Contact", href: "#" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Privacy Policy", href: "#" },
          { label: "Terms of Service", href: "#" },
          { label: "Disclaimer", href: "#" },
        ],
      },
    ],
    copyright: "© 2025 TradeShala. All rights reserved.",
  },
};
