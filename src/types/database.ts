export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone_number: string | null;
  virtual_balance: number;
  created_at: string;
  updated_at: string | null;
}

export interface Portfolio {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  total_amount: number;
  created_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  added_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  quantity: number;
  average_buy_price: number;
  total_invested: number;
  current_price: number | null;
  current_value: number | null;
  pnl: number;
  pnl_percent: number;
  exchange: string;
  sector: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioStats {
  total_invested: number;
  current_value: number;
  total_pnl: number;
  pnl_percent: number;
  virtual_cash: number;
  stocks_held: number;
}

export interface TradeWithDetails extends Trade {
  running_pnl?: number;
}

export interface BrokerField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  helpText: string;
}

export interface BrokerConfig {
  id: string;
  name: string;
  logo: string;
  color: string;
  authType: "oauth" | "apikey" | "token";
  website: string;
  apiDocsUrl: string;
  description: string;
  fields: BrokerField[];
  setupSteps: string[];
  redirectUri?: string;
}

export interface BrokerConnection {
  id: string;
  user_id: string;
  broker_name: string;
  broker_id: string;
  is_connected: boolean;
  is_active: boolean;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  client_id: string | null;
  totp_secret: string | null;
  token_expiry: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketData {
  symbol: string;
  exchange: string;
  last_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  change: number;
  change_percent: number;
  volume: number;
  last_updated: string;
}

export interface BrokerConnectionStatus {
  isConnected: boolean;
  brokerName: string | null;
  brokerId: string | null;
  lastConnected: string | null;
}

export interface IndexData {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
  sparklineData: number[];
}

export interface StockGainerLoser {
  symbol: string;
  change: number;
  changePercent: number;
  isPositive: boolean;
}

export interface DashboardStats {
  virtualCash: number;
  portfolioValue: number;
  totalPnL: number;
  totalPnLPercent: number;
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      portfolios: {
        Row: Portfolio;
        Insert: Omit<Portfolio, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Portfolio, "id" | "user_id" | "created_at">>;
      };
      trades: {
        Row: Trade;
        Insert: Omit<Trade, "id" | "created_at">;
        Update: never;
      };
      watchlist: {
        Row: WatchlistItem;
        Insert: Omit<WatchlistItem, "id" | "added_at">;
        Update: never;
      };
      holdings: {
        Row: Holding;
        Insert: Omit<Holding, "id" | "created_at" | "updated_at" | "pnl" | "pnl_percent" | "current_value">;
        Update: Partial<Omit<Holding, "id" | "user_id" | "created_at">>;
      };
      broker_connections: {
        Row: BrokerConnection;
        Insert: Omit<BrokerConnection, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<BrokerConnection, "id" | "user_id" | "created_at">>;
      };
    };
  };
}
