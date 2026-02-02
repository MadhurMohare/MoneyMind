
import { GoogleGenAI, Type } from "@google/genai";
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// --- Types ---
export interface User {
  username: string;
  isLoggedIn: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: 'income' | 'expense' | 'debt_payment' | 'other';
  transactionType: 'debit' | 'credit';
  referenceNumber?: string;
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
}

export interface Recommendation {
  title: string;
  description: string;
  impact: string;
  steps: string[];
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
}

// --- Initial State ---
let state: FinancialState = {
  user: null,
  currentView: View.LOGIN,
  transactions: [],
  goals: [],
  debts: [],
  monthlyIncome: 0,
  isLoading: false,
  isSidebarOpen: true,
  notifications: []
};

// --- State Management ---
const updateState = (patch: Partial<FinancialState>) => {
  state = { ...state, ...patch };
  if (state.user) {
    localStorage.setItem(`moneymind_${state.user.username}`, JSON.stringify({
      transactions: state.transactions,
      goals: state.goals,
      debts: state.debts,
      monthlyIncome: state.monthlyIncome,
      analysis: state.analysis,
      recommendations: state.recommendations
    }));
  }
  render();
};

const showNotification = (message: string, type: string = 'info') => {
  const id = Date.now();
  const notifications = [...state.notifications, { id, message, type }];
  updateState({ notifications });
  setTimeout(() => {
    updateState({ notifications: state.notifications.filter(n => n.id !== id) });
  }, 4000);
};

// --- AI Service ---
const getGemini = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const analyzeDocument = async (base64: string, mime: string) => {
  updateState({ isLoading: true });
  try {
    const ai = getGemini();
    const prompt = `Analyze this financial document. Extract income, expenses, and debts. Return JSON. 
    Category: income, expense, debt_payment, other. Type: debit, credit. Date: YYYY-MM-DD.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ inlineData: { data: base64, mimeType: mime } }, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            monthlyIncome: { type: Type.NUMBER },
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  transactionType: { type: Type.STRING },
                  referenceNumber: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    const newTransactions = (data.transactions || []).map((t: any) => ({ ...t, id: Math.random().toString(36).substr(2, 9) }));
    
    updateState({
      transactions: [...newTransactions, ...state.transactions],
      monthlyIncome: data.monthlyIncome || state.monthlyIncome,
      currentView: View.DASHBOARD,
      isLoading: false
    });
    showNotification("Document processed successfully!", "success");
  } catch (err) {
    console.error(err);
    updateState({ isLoading: false });
    showNotification("Failed to analyze document.", "error");
  }
};

const generatePlan = async () => {
  updateState({ isLoading: true });
  try {
    const ai = getGemini();
    const prompt = `Act as a financial advisor. Plan for: 
    Income: ${state.monthlyIncome}, Debts: ${JSON.stringify(state.debts)}, Goals: ${JSON.stringify(state.goals)}.
    Provide analysis and recommendations in JSON.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  impact: { type: Type.STRING },
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    updateState({
      analysis: data.analysis,
      recommendations: data.recommendations,
      currentView: View.PLAN,
      isLoading: false
    });
    showNotification("AI Strategy updated.", "success");
  } catch (err) {
    console.error(err);
    updateState({ isLoading: false });
  }
};

// --- Components ---

const NotificationOverlay = () => `
  <div class="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-sm w-full">
    ${state.notifications.map(n => `
      <div class="p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border ${
        n.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
        n.type === 'error' ? 'bg-rose-500 border-rose-400 text-white' :
        'bg-slate-800 border-slate-700 text-white'
      }">
        <i class="fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
        <p class="text-sm font-medium">${n.message}</p>
      </div>
    `).join('')}
  </div>
`;

const Sidebar = () => {
  const items = [
    { view: View.DASHBOARD, icon: 'fa-chart-line', label: 'Overview' },
    { view: View.UPLOADS, icon: 'fa-file-upload', label: 'Upload' },
    { view: View.TRANSACTIONS, icon: 'fa-receipt', label: 'Receipts' },
    { view: View.GOALS, icon: 'fa-bullseye', label: 'Goals' },
    { view: View.DEBTS, icon: 'fa-hand-holding-dollar', label: 'Debts' },
    { view: View.PLAN, icon: 'fa-magic', label: 'AI Strategy' },
  ];

  return `
    <aside class="${state.isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col">
      <div class="p-6 flex items-center gap-3 border-b border-slate-800">
        <div class="bg-emerald-500 p-2 rounded-lg shrink-0">
          <i class="fas fa-brain text-white text-xl"></i>
        </div>
        ${state.isSidebarOpen ? '<span class="font-bold text-xl">MoneyMind</span>' : ''}
      </div>
      <nav class="flex-1 mt-6 px-4 space-y-2">
        ${items.map(item => `
          <button onclick="navigate('${item.view}')" class="w-full flex items-center gap-4 p-3 rounded-xl transition-all ${state.currentView === item.view ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
            <i class="fas ${item.icon} w-6 text-center text-lg"></i>
            ${state.isSidebarOpen ? `<span class="font-medium">${item.label}</span>` : ''}
          </button>
        `).join('')}
      </nav>
      <div class="p-4 border-t border-slate-800">
        <button onclick="logout()" class="w-full flex items-center gap-4 p-3 text-slate-400 hover:text-rose-400">
          <i class="fas fa-sign-out-alt w-6 text-center text-lg"></i>
          ${state.isSidebarOpen ? '<span class="font-medium">Logout</span>' : ''}
        </button>
      </div>
    </aside>
  `;
};

const Header = () => `
  <header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
    <h1 class="text-lg font-bold text-slate-800 capitalize">${state.currentView.toLowerCase()}</h1>
    <button onclick="generatePlan()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm">
      <i class="fas fa-sparkles"></i> Get AI Plan
    </button>
  </header>
`;

const DashboardView = () => {
  const totalIn = state.transactions.filter(t => t.category === 'income').reduce((a, b) => a + b.amount, 0) + state.monthlyIncome;
  const totalOut = state.transactions.filter(t => t.category !== 'income').reduce((a, b) => a + b.amount, 0);
  
  return `
    <div class="space-y-6 animate-fade-in">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        ${StatCard('Income', `$${totalIn.toLocaleString()}`, 'emerald', 'fa-arrow-up')}
        ${StatCard('Expenses', `$${totalOut.toLocaleString()}`, 'rose', 'fa-arrow-down')}
        ${StatCard('Debt', `$${state.debts.reduce((a,b)=>a+b.balance,0).toLocaleString()}`, 'indigo', 'fa-hand-holding-dollar')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 class="text-lg font-bold mb-4">Expense Analysis</h3>
          <canvas id="expenseChart" class="w-full" height="300"></canvas>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 class="text-lg font-bold mb-4">Recent Activity</h3>
          <div class="space-y-4">
            ${state.transactions.slice(0, 5).map(t => `
              <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full flex items-center justify-center ${t.category === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}">
                    <i class="fas ${t.category === 'income' ? 'fa-plus' : 'fa-shopping-cart'}"></i>
                  </div>
                  <div>
                    <p class="font-bold text-slate-800">${t.description}</p>
                    <p class="text-xs text-slate-400 uppercase font-bold">${t.category}</p>
                  </div>
                </div>
                <p class="font-bold ${t.category === 'income' ? 'text-emerald-600' : 'text-slate-900'}">
                  ${t.category === 'income' ? '+' : '-'}$${t.amount.toLocaleString()}
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
};

const StatCard = (label: string, val: string, color: string, icon: string) => `
  <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
    <div class="flex items-center gap-4">
      <div class="p-3 bg-${color}-100 text-${color}-600 rounded-xl">
        <i class="fas ${icon} text-xl"></i>
      </div>
      <div>
        <p class="text-slate-500 text-sm font-medium">${label}</p>
        <h3 class="text-2xl font-bold text-slate-900">${val}</h3>
      </div>
    </div>
  </div>
`;

const UploadView = () => `
  <div class="max-w-2xl mx-auto mt-10 animate-fade-in text-center">
    <h2 class="text-2xl font-bold mb-2">Sync Your Finances</h2>
    <p class="text-slate-500 mb-8">Drop your bank statements, payslips or CSV files here.</p>
    <div 
      onclick="document.getElementById('fileInput').click()"
      class="border-4 border-dashed border-slate-200 bg-white rounded-3xl p-16 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center"
    >
      <i class="fas fa-cloud-upload-alt text-5xl text-slate-300 mb-4"></i>
      <p class="text-xl font-bold text-slate-600">Click or drag files here</p>
      <input type="file" id="fileInput" class="hidden" onchange="handleFile(this)">
    </div>
  </div>
`;

const TransactionsView = () => `
  <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-fade-in">
    <div class="p-6 border-b border-slate-100 flex justify-between items-center">
      <h3 class="text-xl font-bold">History</h3>
      <button class="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold">Add Manual</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>
            <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Category</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${state.transactions.map(t => `
            <tr>
              <td class="px-6 py-4 text-sm text-slate-500">${t.date}</td>
              <td class="px-6 py-4 font-bold text-slate-800">${t.description}</td>
              <td class="px-6 py-4">
                <span class="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">${t.category}</span>
              </td>
              <td class="px-6 py-4 font-bold text-right ${t.category === 'income' ? 'text-emerald-600' : 'text-slate-900'}">
                $${t.amount.toLocaleString()}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
`;

const PlanView = () => `
  <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
    <div class="bg-slate-900 text-white p-8 rounded-3xl shadow-xl">
      <div class="flex items-center gap-4 mb-6">
        <div class="bg-emerald-500 p-3 rounded-2xl">
          <i class="fas fa-robot text-2xl"></i>
        </div>
        <h2 class="text-2xl font-bold">MoneyMind Strategy</h2>
      </div>
      <p class="text-lg leading-relaxed text-slate-300">${state.analysis || 'No analysis generated yet.'}</p>
    </div>
    <div class="grid grid-cols-1 gap-6">
      ${state.recommendations?.map(rec => `
        <div class="bg-white border border-slate-200 rounded-2xl p-6">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h4 class="text-lg font-bold">${rec.title}</h4>
              <p class="text-slate-500">${rec.description}</p>
            </div>
            <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">Impact: ${rec.impact}</span>
          </div>
          <div class="space-y-2">
            ${rec.steps.map((step, i) => `
              <div class="flex gap-3 text-sm">
                <span class="w-6 h-6 bg-slate-100 flex items-center justify-center rounded-full font-bold text-slate-500">${i+1}</span>
                <p class="text-slate-700">${step}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
`;

const LoginView = () => `
  <div class="h-screen w-full flex items-center justify-center bg-slate-900 p-4">
    <div class="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center animate-fade-in">
      <div class="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
        <i class="fas fa-brain text-white text-4xl"></i>
      </div>
      <h1 class="text-3xl font-bold text-slate-900 mb-2">MoneyMind</h1>
      <p class="text-slate-500 mb-8">Your Private AI Financial Agent</p>
      <input id="username" type="text" placeholder="Username" class="w-full p-4 bg-slate-100 rounded-2xl mb-4 outline-none focus:ring-2 focus:ring-emerald-500">
      <input id="password" type="password" placeholder="Password" class="w-full p-4 bg-slate-100 rounded-2xl mb-8 outline-none focus:ring-2 focus:ring-emerald-500">
      <button onclick="handleLogin()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Sign In</button>
    </div>
  </div>
`;

// --- Global Functions (exposed for onclick) ---
(window as any).navigate = (view: View) => updateState({ currentView: view });
(window as any).logout = () => updateState({ user: null, currentView: View.LOGIN });

(window as any).handleLogin = () => {
  const username = (document.getElementById('username') as HTMLInputElement).value;
  if (username.length < 3) return showNotification("Username too short", "error");
  
  const saved = localStorage.getItem(`moneymind_${username}`);
  const userData = saved ? JSON.parse(saved) : {};
  
  updateState({
    user: { username, isLoggedIn: true },
    currentView: View.DASHBOARD,
    ...userData
  });
};

(window as any).handleFile = (input: HTMLInputElement) => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = (e.target?.result as string).split(',')[1];
    analyzeDocument(base64, file.type);
  };
  reader.readAsDataURL(file);
};

(window as any).generatePlan = generatePlan;

// --- Main Render Engine ---
const render = () => {
  const root = document.getElementById('root');
  if (!root) return;

  if (state.currentView === View.LOGIN) {
    root.innerHTML = LoginView();
    return;
  }

  root.innerHTML = `
    <div class="flex h-screen bg-slate-50 overflow-hidden relative">
      ${NotificationOverlay()}
      ${Sidebar()}
      <main class="flex-1 flex flex-col overflow-hidden relative">
        ${state.isLoading ? `
          <div class="absolute inset-0 bg-white/70 backdrop-blur-md z-50 flex flex-col items-center justify-center">
            <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p class="font-bold text-slate-800 animate-pulse text-lg">MoneyMind is thinking...</p>
          </div>
        ` : ''}
        ${Header()}
        <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
          ${state.currentView === View.DASHBOARD ? DashboardView() : ''}
          ${state.currentView === View.UPLOADS ? UploadView() : ''}
          ${state.currentView === View.TRANSACTIONS ? TransactionsView() : ''}
          ${state.currentView === View.PLAN ? PlanView() : ''}
          ${[View.GOALS, View.DEBTS].includes(state.currentView) ? '<div class="text-center py-20 text-slate-400"><i class="fas fa-tools text-4xl mb-4"></i><p>Coming soon...</p></div>' : ''}
        </div>
      </main>
    </div>
  `;

  // Initialize Charts if on Dashboard
  if (state.currentView === View.DASHBOARD) {
    setTimeout(() => {
      const canvas = document.getElementById('expenseChart') as HTMLCanvasElement;
      if (canvas) {
        const cats = state.transactions.filter(t => t.category !== 'income');
        const labels = [...new Set(cats.map(c => c.category))];
        const data = labels.map(l => cats.filter(c => c.category === l).reduce((a, b) => a + b.amount, 0));
        
        new Chart(canvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Expenses by Category',
              data: data,
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
          }
        });
      }
    }, 0);
  }
};

// Initial Render
render();
