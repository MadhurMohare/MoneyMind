import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, FinancialState, Transaction, FinancialGoal, Debt, User, ProcessedFile } from './types.ts';
import Dashboard from './components/Dashboard.tsx';
import FileUpload from './components/FileUpload.tsx';
import GoalTracker from './components/GoalTracker.tsx';
import DebtTracker from './components/DebtTracker.tsx';
import PlanDisplay from './components/PlanDisplay.tsx';
import TransactionManager from './components/TransactionManager.tsx';
import Login from './components/Login.tsx';
import { GeminiService } from './services/geminiService.ts';

const DEFAULT_STATE: FinancialState = {
  transactions: [],
  goals: [],
  debts: [],
  monthlyIncome: 0,
  processedFiles: [],
  lastUpdated: Date.now()
};

const normalizeDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.trim();
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr.trim();
  }
};

const getTransactionKey = (t: Partial<Transaction>): string => {
  const ref = (t.referenceNumber || '').trim().toLowerCase();
  if (ref && ref.length > 2) {
    return `ref_${ref}`;
  }
  const date = normalizeDate(t.date || '');
  const amount = Math.abs(Number(t.amount || 0)).toFixed(2);
  const type = (t.transactionType || '').toLowerCase();
  const cleanAcc = (acc?: string) => {
    const digits = (acc || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : 'xxxx';
  };
  const src = cleanAcc(t.sourceAccount);
  const dest = cleanAcc(t.destinationAccount);
  const fuzzyBrand = (t.description || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 6);
  return `${date}|${amount}|${type}|${src}|${dest}|${fuzzyBrand}`;
};

interface Notification {
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  id: number;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [financialState, setFinancialState] = useState<FinancialState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const gemini = useMemo(() => new GeminiService(), []);
  const stateRef = useRef(financialState);

  useEffect(() => {
    stateRef.current = financialState;
  }, [financialState]);

  const showNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    if (!user) return;
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `moneymind_data_${user.username}`) {
        try {
           const newState = JSON.parse(e.newValue || '{}');
           if (newState.lastUpdated > (stateRef.current.lastUpdated || 0)) {
             setFinancialState(newState);
           }
        } catch (err) {
           console.error("Failed to sync storage:", err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user]);

  useEffect(() => {
    if (user && user.isLoggedIn) {
      localStorage.setItem(`moneymind_data_${user.username}`, JSON.stringify({
        ...financialState,
        lastUpdated: Date.now()
      }));
    }
  }, [financialState, user]);

  const handleLogin = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    const savedData = localStorage.getItem(`moneymind_data_${authenticatedUser.username}`);
    if (savedData) {
      setFinancialState({ ...DEFAULT_STATE, ...JSON.parse(savedData) });
    } else {
      setFinancialState(DEFAULT_STATE);
    }
    setCurrentView(View.DASHBOARD);
    showNotification(`Welcome back, ${authenticatedUser.username}!`, 'success');
  };

  const handleLogout = () => {
    setUser(null);
    setFinancialState(DEFAULT_STATE);
    setCurrentView(View.LOGIN);
  };

  const handleFileUpload = async (base64: string, mimeType: string, fileInfo?: { name: string, size: number }) => {
    if (fileInfo) {
      const alreadyProcessed = financialState.processedFiles.some(
        f => f.name === fileInfo.name && f.size === fileInfo.size && f.type === mimeType
      );
      if (alreadyProcessed) {
        showNotification(`File "${fileInfo.name}" has already been processed. Skipping.`, 'warning');
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await gemini.analyzeDocument(base64, mimeType);
      
      setFinancialState(prev => {
        const existingKeys = new Set(prev.transactions.map(t => getTransactionKey(t)));
        const uniqueIncoming = new Map<string, Transaction>();
        
        (result.transactions || []).forEach(t => {
          const key = getTransactionKey(t);
          if (!uniqueIncoming.has(key) && !existingKeys.has(key)) {
            uniqueIncoming.set(key, { 
              ...t, 
              id: Math.random().toString(36).substr(2, 9),
              date: normalizeDate(t.date)
            } as Transaction);
          }
        });

        const newTransactions = Array.from(uniqueIncoming.values());
        const existingDebtFuzzy = new Set(prev.debts.map(d => d.name.toLowerCase().replace(/[^a-z]/g, '')));
        const newDebts = (result.debts || [])
          .filter(d => {
            const fuzzy = d.name.toLowerCase().replace(/[^a-z]/g, '');
            return fuzzy.length > 0 && !existingDebtFuzzy.has(fuzzy);
          })
          .map(d => ({ ...d, id: Math.random().toString(36).substr(2, 9) })) as Debt[];

        const newProcessedFiles: ProcessedFile[] = fileInfo ? [...prev.processedFiles, {
          ...fileInfo,
          type: mimeType,
          timestamp: Date.now()
        }] : prev.processedFiles;

        if (newTransactions.length === 0 && newDebts.length === 0 && !result.monthlyIncome) {
          showNotification("No new unique data found.", "info");
        } else {
          showNotification(`Imported ${newTransactions.length} transactions and ${newDebts.length} debts.`, 'success');
        }

        return {
          ...prev,
          monthlyIncome: result.monthlyIncome || prev.monthlyIncome,
          transactions: [...prev.transactions, ...newTransactions],
          debts: [...prev.debts, ...newDebts],
          processedFiles: newProcessedFiles,
          lastUpdated: Date.now()
        };
      });
      
      setCurrentView(View.DASHBOARD);
    } catch (error) {
      console.error("Error processing file:", error);
      showNotification("Analysis failed. Try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const generatePlan = async () => {
    setIsLoading(true);
    try {
      const plan = await gemini.generateFinancialPlan(financialState);
      setFinancialState(prev => ({
        ...prev,
        analysis: plan.analysis,
        recommendations: plan.recommendations,
        lastUpdated: Date.now()
      }));
      setCurrentView(View.PLAN);
      showNotification("AI Plan updated!", "success");
    } catch (error) {
      console.error("Error generating plan:", error);
      showNotification("Plan generation failed.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const addTransaction = (t: Omit<Transaction, 'id'>) => {
    setFinancialState(prev => ({
      ...prev,
      transactions: [{ ...t, id: Date.now().toString() }, ...prev.transactions],
      lastUpdated: Date.now()
    }));
    showNotification("Transaction added.", "success");
  };

  const updateTransaction = (updated: Transaction) => {
    setFinancialState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === updated.id ? updated : t),
      lastUpdated: Date.now()
    }));
    showNotification("Transaction updated.", "success");
  };

  const removeTransaction = (id: string) => {
    setFinancialState(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
      lastUpdated: Date.now()
    }));
    showNotification("Transaction removed.", "info");
  };

  const addGoal = (goal: Omit<FinancialGoal, 'id'>) => {
    setFinancialState(prev => ({
      ...prev,
      goals: [...prev.goals, { ...goal, id: Date.now().toString() }],
      lastUpdated: Date.now()
    }));
    showNotification("Goal added.", "success");
  };

  const removeGoal = (id: string) => {
    setFinancialState(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id),
      lastUpdated: Date.now()
    }));
  };

  const addDebt = (debt: Omit<Debt, 'id'>) => {
    setFinancialState(prev => ({
      ...prev,
      debts: [...prev.debts, { ...debt, id: Date.now().toString() }],
      lastUpdated: Date.now()
    }));
    showNotification("Debt added.", "success");
  };

  const removeDebt = (id: string) => {
    setFinancialState(prev => ({
      ...prev,
      debts: prev.debts.filter(d => d.id !== id),
      lastUpdated: Date.now()
    }));
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <div className="fixed top-6 right-6 z-[60] flex flex-col gap-3 max-w-sm w-full">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 border ${
              n.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
              n.type === 'warning' ? 'bg-amber-500 border-amber-400 text-white' :
              n.type === 'error' ? 'bg-rose-500 border-rose-400 text-white' :
              'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <i className={`fas ${
              n.type === 'success' ? 'fa-check-circle' :
              n.type === 'warning' ? 'fa-exclamation-triangle' :
              n.type === 'error' ? 'fa-times-circle' :
              'fa-info-circle'
            } text-xl`}></i>
            <p className="text-sm font-medium">{n.message}</p>
          </div>
        ))}
      </div>

      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col z-20`}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-emerald-500 p-2 rounded-lg shrink-0">
            <i className="fas fa-brain text-white text-xl"></i>
          </div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">MoneyMind</span>}
        </div>
        
        <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto">
          <NavItem icon="fas fa-chart-line" label="Dashboard" active={currentView === View.DASHBOARD} onClick={() => setCurrentView(View.DASHBOARD)} collapsed={!isSidebarOpen} />
          <NavItem icon="fas fa-file-upload" label="Uploads" active={currentView === View.UPLOADS} onClick={() => setCurrentView(View.UPLOADS)} collapsed={!isSidebarOpen} />
          <NavItem icon="fas fa-receipt" label="Transactions" active={currentView === View.TRANSACTIONS} onClick={() => setCurrentView(View.TRANSACTIONS)} collapsed={!isSidebarOpen} />
          <NavItem icon="fas fa-bullseye" label="Goals" active={currentView === View.GOALS} onClick={() => setCurrentView(View.GOALS)} collapsed={!isSidebarOpen} />
          <NavItem icon="fas fa-hand-holding-dollar" label="Debts" active={currentView === View.DEBTS} onClick={() => setCurrentView(View.DEBTS)} collapsed={!isSidebarOpen} />
          <NavItem icon="fas fa-magic" label="AI Plan" active={currentView === View.PLAN} onClick={() => setCurrentView(View.PLAN)} collapsed={!isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {isSidebarOpen && (
            <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-xl mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold truncate">{user.username}</p>
                <button onClick={handleLogout} className="text-[10px] text-slate-400 hover:text-emerald-400 uppercase tracking-widest font-bold">Logout</button>
              </div>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <i className={`fas fa-chevron-${isSidebarOpen ? 'left' : 'right'}`}></i>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
            <p className="text-slate-600 font-medium animate-pulse text-center px-4">Processing with MoneyMind AI...</p>
          </div>
        )}

        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-lg font-semibold text-slate-800">
            {currentView === View.DASHBOARD && 'Overview'}
            {currentView === View.UPLOADS && 'Upload Documents'}
            {currentView === View.TRANSACTIONS && 'Transactions'}
            {currentView === View.GOALS && 'Financial Goals'}
            {currentView === View.DEBTS && 'Debts'}
            {currentView === View.PLAN && 'AI Strategy'}
          </h1>
          <div className="flex items-center gap-4">
            <button onClick={generatePlan} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
              <i className="fas fa-sparkles"></i> Get AI Plan
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {currentView === View.DASHBOARD && <Dashboard state={financialState} />}
          {currentView === View.UPLOADS && <FileUpload onUpload={handleFileUpload} />}
          {currentView === View.TRANSACTIONS && (
            <TransactionManager 
              transactions={financialState.transactions} 
              onAdd={addTransaction}
              onUpdate={updateTransaction}
              onDelete={removeTransaction}
            />
          )}
          {currentView === View.GOALS && <GoalTracker goals={financialState.goals} onAdd={addGoal} onRemove={removeGoal} />}
          {currentView === View.DEBTS && <DebtTracker debts={financialState.debts} onAdd={addDebt} onRemove={removeDebt} />}
          {currentView === View.PLAN && <PlanDisplay state={financialState} />}
        </div>
      </main>
    </div>
  );
};

interface NavItemProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, collapsed }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${active ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <i className={`${icon} w-6 text-center text-lg`}></i>
    {!collapsed && <span className="font-medium">{label}</span>}
  </button>
);

export default App;
