export interface Trade {
  id: string;
  date: string; // Display string DD/MM/YYYY
  timestamp?: number;
  time: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  entry: string;
  exit: string;
  qty: string;
  pnl: number;
  strategy: string;
  notes: string;
}

export interface TradeFormData {
  symbol: string;
  date: string; // Input string YYYY-MM-DD
  time: string;
  type: 'LONG' | 'SHORT';
  entry: string;
  exit: string;
  qty: string;
  strategy: string;
  notes: string;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
  capital?: number;
}

export interface Stats {
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  currentCapital: number;
  roi: number;
  winningTrades: number;
  losingTrades: number;
}
