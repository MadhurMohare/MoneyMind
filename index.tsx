import { GoogleGenAI, Type } from "@google/genai";
import { Chart, registerables } from 'chart.js';
import { View, Transaction, FinancialState, User } from './types.ts';

Chart.register(...registerables);

// --- State ---
let state: FinancialState = {
  user: null,
  currentView: View.LOGIN,
  transactions: [],
  goals: [],
  debts: [],
  monthlyIncome: 0,
  isLoading: false,
  isSidebarOpen: true,
  notifications: [],
  searchQuery: '',
  editingTransactionId: null,
  isTransactionModalOpen: false
};

const updateState = (patch: Partial<FinancialState>) => {
  state = { ...state, ...patch };
  if (state.user) {
    localStorage.setItem(`moneymind_data_${state.user.username}`, JSON.stringify({
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
  updateState({ notifications: [...state.notifications, { id, message, type }] });
  setTimeout(() => {
    updateState({ notifications: state.notifications.filter(n => n.id !== id) });
  }, 4000);
};

// --- AI Service ---
const analyzeDocument = async (base64: string, mime: string) => {
  updateState({ isLoading: true });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { 
        parts: [
          { inlineData: { data: base64, mimeType: mime } },
          { text: "Extract financial data into JSON. Dates as YYYY-MM-DD. Categories: income, expense, debt_payment, other. Types: debit, credit." }
        ] 
      },
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
                },
                required: ["date", "description", "amount", "transactionType"]
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    const newItems = (data.transactions || []).map((t: any) => ({
      ...t,
      id: Math.random().toString(36).substr(2, 9)
    }));

    updateState({
      transactions: [...newItems, ...state.transactions],
      monthlyIncome: data.monthlyIncome || state.monthlyIncome,
      currentView: View.TRANSACTIONS,
      isLoading: false
    });
    showNotification(`Imported ${newItems.length} transactions.`, "success");
  } catch (err) {
    updateState({ isLoading: false });
    showNotification("Failed to process document.", "error");
  }
};

const generatePlan = async () => {
  updateState({ isLoading: true });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const prompt = `Based on these transactions: ${JSON.stringify(state.transactions.slice(0, 20))}. Current Income: ${state.monthlyIncome}. Create a financial plan.`;
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
  } catch (err) {
    updateState({ isLoading: false });
    showNotification("AI failed to generate plan.", "error");
  }
};

// --- Component Template Functions ---

const Sidebar = () => {
  const navItems = [
    { id: View.DASHBOARD, icon: 'fa-chart-line', label: 'Dashboard' },
    { id: View.UPLOADS, icon: 'fa-file-upload', label: 'Upload' },
    { id: View.TRANSACTIONS, icon: 'fa-receipt', label: 'Transactions' },
    { id: View.GOALS, icon: 'fa-bullseye', label: 'Goals' },
    { id: View.DEBTS, icon: 'fa-hand-holding-dollar', label: 'Debts' },
    { id: View.PLAN, icon: 'fa-magic', label: 'AI Plan' },
  ];

  return `
    <aside class="${state.isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col shrink-0">
      <div class="p-6 flex items-center gap-3 border-b border-slate-800">
        <div class="bg-emerald-500 p-2 rounded-lg"><i class="fas fa-brain"></i></div>
        ${state.isSidebarOpen ? '<span class="font-bold text-xl">MoneyMind</span>' : ''}
      </div>
      <nav class="flex-1 mt-6 px-4 space-y-2">
        ${navItems.map(item => `
          <button onclick="window.navigate('${item.id}')" class="w-full flex items-center gap-4 p-3 rounded-xl transition-all ${state.currentView === item.id ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
            <i class="fas ${item.icon} w-6 text-center"></i>
            ${state.isSidebarOpen ? `<span>${item.label}</span>` : ''}
          </button>
        `).join('')}
      </nav>
      <div class="p-4 border-t border-slate-800">
        <button onclick="window.logout()" class="w-full flex items-center gap-4 p-3 text-slate-400 hover:text-rose-400">
          <i class="fas fa-sign-out-alt w-6"></i>
          ${state.isSidebarOpen ? '<span>Logout</span>' : ''}
        </button>
      </div>
    </aside>
  `;
};

const DashboardView = () => `
  <div class="space-y-6 animate-fade-in">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <p class="text-slate-500 text-sm">Monthly Income</p>
        <h3 class="text-2xl font-bold text-emerald-600">$${(state.transactions.filter(t=>t.category==='income').reduce((a,b)=>a+b.amount,0) + state.monthlyIncome).toLocaleString()}</h3>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <p class="text-slate-500 text-sm">Monthly Expenses</p>
        <h3 class="text-2xl font-bold text-rose-600">$${state.transactions.filter(t=>t.category!=='income').reduce((a,b)=>a+b.amount,0).toLocaleString()}</h3>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <p class="text-slate-500 text-sm">Active Goals</p>
        <h3 class="text-2xl font-bold text-indigo-600">${state.goals.length}</h3>
      </div>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200">
      <h3 class="text-lg font-bold mb-4">Spending by Category</h3>
      <div class="h-[300px] w-full"><canvas id="mainChart"></canvas></div>
    </div>
  </div>
`;

const TransactionModal = () => {
  const t = state.editingTransactionId ? state.transactions.find(x => x.id === state.editingTransactionId) : null;
  return `
    <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 modal-backdrop animate-fade-in">
      <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div class="p-6 border-b flex justify-between items-center">
          <h3 class="text-xl font-bold">${t ? 'Edit' : 'Add'} Transaction</h3>
          <button onclick="window.closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="window.saveTransaction(event)" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <input type="date" name="date" required value="${t?.date || new Date().toISOString().split('T')[0]}" class="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500">
            <input type="number" name="amount" step="0.01" required placeholder="Amount" value="${t?.amount || ''}" class="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <input type="text" name="description" required placeholder="Merchant / Description" value="${t?.description || ''}" class="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500">
          <div class="grid grid-cols-2 gap-4">
            <select name="category" class="p-3 border rounded-xl outline-none">
              <option value="expense" ${t?.category==='expense'?'selected':''}>Expense</option>
              <option value="income" ${t?.category==='income'?'selected':''}>Income</option>
              <option value="debt_payment" ${t?.category==='debt_payment'?'selected':''}>Debt Payment</option>
              <option value="other" ${t?.category==='other'?'selected':''}>Other</option>
            </select>
            <select name="type" class="p-3 border rounded-xl outline-none">
              <option value="debit" ${t?.transactionType==='debit'?'selected':''}>Debit (-)</option>
              <option value="credit" ${t?.transactionType==='credit'?'selected':''}>Credit (+)</option>
            </select>
          </div>
          <button type="submit" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800">Save Transaction</button>
        </form>
      </div>
    </div>
  `;
};

const TransactionsView = () => {
  const filtered = state.transactions.filter(t => t.description.toLowerCase().includes(state.searchQuery.toLowerCase()));
  return `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="relative w-full max-w-md">
          <i class="fas fa-search absolute left-4 top-3.5 text-slate-400"></i>
          <input oninput="window.setSearch(this.value)" type="text" placeholder="Search transactions..." value="${state.searchQuery}" class="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
        </div>
        <button onclick="window.openModal()" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all">
          <i class="fas fa-plus"></i> Add Transaction
        </button>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50 border-b">
            <tr>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Category</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Amount</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filtered.length === 0 ? '<tr><td colspan="5" class="p-12 text-center text-slate-400 italic">No transactions found.</td></tr>' : 
              filtered.map(t => `
                <tr class="hover:bg-slate-50 transition-colors group">
                  <td class="px-6 py-4 text-sm text-slate-500">${t.date}</td>
                  <td class="px-6 py-4 font-bold text-slate-800">${t.description}</td>
                  <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">${t.category}</span></td>
                  <td class="px-6 py-4 font-bold text-right ${t.category === 'income' ? 'text-emerald-600' : 'text-slate-900'}">$${t.amount.toLocaleString()}</td>
                  <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onclick="window.openModal('${t.id}')" class="p-2 text-slate-400 hover:text-emerald-500"><i class="fas fa-edit"></i></button>
                      <button onclick="window.deleteTransaction('${t.id}')" class="p-2 text-slate-400 hover:text-rose-500"><i class="fas fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

const UploadView = () => `
  <div class="max-w-2xl mx-auto mt-10 text-center animate-fade-in">
    <h2 class="text-3xl font-bold mb-4">Feed Your MoneyMind</h2>
    <p class="text-slate-500 mb-8 text-lg">Upload bank statements or payslips. Our AI handles the rest.</p>
    <div onclick="document.getElementById('file-upload').click()" class="border-4 border-dashed border-slate-200 bg-white p-16 rounded-[2.5rem] cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center">
      <i class="fas fa-cloud-upload-alt text-6xl text-slate-200 mb-4"></i>
      <p class="text-xl font-bold text-slate-700">Drop files or click to browse</p>
      <input id="file-upload" type="file" class="hidden" onchange="window.handleFileUpload(this)">
    </div>
  </div>
`;

// --- Global Actions ---
(window as any).navigate = (v: View) => updateState({ currentView: v });
(window as any).logout = () => updateState({ user: null, currentView: View.LOGIN });
(window as any).setSearch = (val: string) => updateState({ searchQuery: val });
(window as any).openModal = (id: string | null = null) => updateState({ isTransactionModalOpen: true, editingTransactionId: id });
(window as any).closeModal = () => updateState({ isTransactionModalOpen: false, editingTransactionId: null });

(window as any).saveTransaction = (e: Event) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const data: Transaction = {
    id: state.editingTransactionId || Math.random().toString(36).substr(2, 9),
    date: formData.get('date') as string,
    description: formData.get('description') as string,
    amount: Number(formData.get('amount')),
    category: formData.get('category') as any,
    transactionType: formData.get('type') as any,
  };

  const newTransactions = state.editingTransactionId 
    ? state.transactions.map(t => t.id === state.editingTransactionId ? data : t)
    : [data, ...state.transactions];

  updateState({ transactions: newTransactions, isTransactionModalOpen: false, editingTransactionId: null });
  showNotification("Transaction saved", "success");
};

(window as any).deleteTransaction = (id: string) => {
  updateState({ transactions: state.transactions.filter(t => t.id !== id) });
  showNotification("Transaction deleted", "info");
};

(window as any).handleFileUpload = (input: HTMLInputElement) => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = (e.target?.result as string).split(',')[1];
    analyzeDocument(base64, file.type);
  };
  reader.readAsDataURL(file);
};

(window as any).handleLogin = () => {
  const userInput = document.getElementById('username') as HTMLInputElement;
  const username = userInput.value.trim();
  if (username.length < 3) return showNotification("Username too short", "error");
  
  const saved = localStorage.getItem(`moneymind_data_${username}`);
  const data = saved ? JSON.parse(saved) : {};
  updateState({ 
    user: { username, isLoggedIn: true }, 
    currentView: View.DASHBOARD,
    ...data
  });
};

// --- Main Render Logic ---
const render = () => {
  const root = document.getElementById('root');
  if (!root) return;

  if (state.currentView === View.LOGIN) {
    root.innerHTML = `
      <div class="h-screen w-full flex items-center justify-center bg-slate-900 p-4">
        <div class="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-10 text-center animate-fade-in">
          <div class="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
            <i class="fas fa-brain text-white text-4xl"></i>
          </div>
          <h1 class="text-3xl font-bold text-slate-900 mb-2">MoneyMind AI</h1>
          <p class="text-slate-500 mb-8">Secure, Private Financial Agent</p>
          <input id="username" type="text" placeholder="Username" class="w-full p-4 bg-slate-100 rounded-2xl mb-4 outline-none focus:ring-2 focus:ring-emerald-500">
          <button onclick="window.handleLogin()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Continue</button>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="flex h-screen bg-slate-50 overflow-hidden relative">
      <!-- Notifications -->
      <div class="fixed top-6 right-6 z-[120] flex flex-col gap-3 max-w-sm w-full">
        ${state.notifications.map(n => `
          <div class="p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border ${
            n.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
            n.type === 'error' ? 'bg-rose-500 border-rose-400 text-white' : 'bg-slate-800 border-slate-700 text-white'
          }">
            <i class="fas ${n.type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
            <p class="text-sm font-medium">${n.message}</p>
          </div>
        `).join('')}
      </div>

      ${state.isTransactionModalOpen ? TransactionModal() : ''}
      ${Sidebar()}

      <main class="flex-1 flex flex-col overflow-hidden">
        ${state.isLoading ? `
          <div class="absolute inset-0 bg-white/70 backdrop-blur-md z-[200] flex flex-col items-center justify-center">
            <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p class="font-bold text-slate-800 animate-pulse">MoneyMind AI is processing...</p>
          </div>
        ` : ''}

        <header class="h-16 bg-white border-b flex items-center justify-between px-8 shrink-0">
          <div class="flex items-center gap-3">
             <button onclick="window.updateState({isSidebarOpen: !state.isSidebarOpen})" class="text-slate-400 hover:text-slate-600"><i class="fas fa-bars"></i></button>
             <h1 class="text-lg font-bold text-slate-800 capitalize">${state.currentView.toLowerCase()}</h1>
          </div>
          <button onclick="window.generatePlan()" class="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-700">Refresh AI Plan</button>
        </header>

        <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
          ${state.currentView === View.DASHBOARD ? DashboardView() : ''}
          ${state.currentView === View.UPLOADS ? UploadView() : ''}
          ${state.currentView === View.TRANSACTIONS ? TransactionsView() : ''}
          ${state.currentView === View.PLAN ? `
            <div class="max-w-4xl mx-auto space-y-6">
              <div class="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                <h2 class="text-2xl font-bold mb-4 flex items-center gap-3"><i class="fas fa-magic text-emerald-400"></i> AI Insights</h2>
                <p class="text-slate-300 leading-relaxed text-lg">${state.analysis || 'Upload documents to generate an AI strategy.'}</p>
              </div>
              <div class="grid grid-cols-1 gap-4">
                ${state.recommendations?.map(r => `
                  <div class="bg-white border p-6 rounded-2xl">
                    <div class="flex justify-between items-start mb-2">
                      <h4 class="font-bold text-xl">${r.title}</h4>
                      <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">Impact: ${r.impact}</span>
                    </div>
                    <p class="text-slate-500 mb-4">${r.description}</p>
                    <div class="space-y-2">
                      ${r.steps.map(s => `<div class="flex gap-2 text-sm text-slate-700"><i class="fas fa-check text-emerald-500 mt-1"></i><p>${s}</p></div>`).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </main>
    </div>
  `;

  // Initialize Charts
  if (state.currentView === View.DASHBOARD) {
    const ctx = (document.getElementById('mainChart') as HTMLCanvasElement)?.getContext('2d');
    if (ctx) {
      const cats = state.transactions.filter(t => t.category !== 'income');
      const grouped = cats.reduce((acc: any, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});
      
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: Object.keys(grouped),
          datasets: [{
            data: Object.values(grouped),
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderRadius: 8
          }]
        },
        options: { 
          responsive: true, maintainAspectRatio: false, 
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
        }
      });
    }
  }
};

render();
