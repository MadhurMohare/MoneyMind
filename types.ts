export interface User {
  username: string;
  isLoggedIn: boolean;
}

export interface Recommendation {
  title: string;
  description: string;
  impact: string;
  steps: string[];
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: 'income' | 'expense' | 'debt_payment' | 'other';
  transactionType: 'debit' | 'credit';
  sourceAccount?: string;
  destinationAccount?: string;
  sourceFile?: string;
  referenceNumber?: string;
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  priority: 'low' | 'medium' | 'high';
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
}

export enum View {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  UPLOADS = 'UPLOADS',
  TRANSACTIONS = 'TRANSACTIONS',
  GOALS = 'GOALS',
  DEBTS = 'DEBTS',
  PLAN = 'PLAN'
}

export interface FinancialState {
  user: User | null;
  currentView: View;
  transactions: Transaction[];
  goals: FinancialGoal[];
  debts: Debt[];
  monthlyIncome: number;
  analysis?: string;
  recommendations?: Recommendation[];
  isLoading: boolean;
  isSidebarOpen: boolean;
  notifications: { id: number; message: string; type: string }[];
  searchQuery: string;
  editingTransactionId: string | null;
  isTransactionModalOpen: boolean;
}