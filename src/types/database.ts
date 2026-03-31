export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  virtual_balance: number;
  created_at: string;
  updated_at: string;
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
    };
  };
}
