
import { GoogleGenAI, Type } from "@google/genai";
import { Chart, registerables } from 'chart.js';
import { View, Transaction, FinancialState, User, FinancialGoal, Debt, ProcessedDocument } from './types.ts';

Chart.register(...registerables);

// --- State ---
let state: FinancialState = {
  user: null,
  currentView: View.LOGIN,
  transactions: [],
  goals: [],
  debts: [],
  processedDocuments: [],
  fileHashes: [],
  monthlyIncome: 0,
  isLoading: false,
  isSidebarOpen: true,
  notifications: [],
  searchQuery: '',
  editingTransactionId: null,
  isTransactionModalOpen: false,
  isGoalFormOpen: false,
  isDebtFormOpen: false,
  isRegistering: false
};

const updateState = (patch: Partial<FinancialState>) => {
  state = { ...state, ...patch };
  if (state.user) {
    localStorage.setItem(`moneymind_data_${state.user.username}`, JSON.stringify({
      transactions: state.transactions,
      goals: state.goals,
      debts: state.debts,
      processedDocuments: state.processedDocuments,
      fileHashes: state.fileHashes,
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

// --- Utilities ---
const computeHash = async (base64: string): Promise<string> => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- AI Service ---
const analyzeDocument = async (base64: string, mime: string, fileName: string, fileHash: string) => {
  const docId = Math.random().toString(36).substr(2, 9);
  const newDoc: ProcessedDocument = {
    id: docId,
    name: fileName,
    uploadDate: new Date().toLocaleString(),
    type: mime.split('/')[1]?.toUpperCase() || 'FILE',
    status: 'processing',
    transactionCount: 0,
    hash: fileHash
  };

  updateState({ 
    isLoading: true,
    processedDocuments: [newDoc, ...state.processedDocuments]
  });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    const incomingTransactions = data.transactions || [];
    
    // --- Secondary Deduplication Logic (Transaction level) ---
    const newItems: Transaction[] = [];
    let duplicateCount = 0;

    incomingTransactions.forEach((t: any) => {
      const isDup = state.transactions.some(existing => 
        existing.date === t.date && 
        Math.abs(existing.amount - t.amount) < 0.01 && 
        existing.description.toLowerCase().trim() === t.description.toLowerCase().trim()
      );

      if (!isDup) {
        newItems.push({
          ...t,
          id: Math.random().toString(36).substr(2, 9),
          sourceFile: fileName
        });
      } else {
        duplicateCount++;
      }
    });

    const updatedDocs = state.processedDocuments.map(d => 
      d.id === docId ? { ...d, status: 'success' as const, transactionCount: newItems.length } : d
    );

    updateState({
      transactions: [...newItems, ...state.transactions],
      monthlyIncome: data.monthlyIncome || state.monthlyIncome,
      processedDocuments: updatedDocs,
      fileHashes: [...state.fileHashes, fileHash],
      currentView: View.TRANSACTIONS,
      isLoading: false
    });
    
    const msg = duplicateCount > 0 
      ? `Imported ${newItems.length} new records from ${fileName} (${duplicateCount} existing transactions matched).`
      : `Success! ${newItems.length} transactions imported.`;
    showNotification(msg, "success");
    
  } catch (err) {
    const updatedDocs = state.processedDocuments.map(d => 
      d.id === docId ? { ...d, status: 'error' as const } : d
    );
    updateState({ isLoading: false, processedDocuments: updatedDocs });
    showNotification(`Failed to process ${fileName}.`, "error");
  }
};

const generatePlan = async () => {
  if (state.transactions.length === 0 && state.monthlyIncome === 0) {
    showNotification("Upload documents first to unlock AI analysis.", "warning");
    return;
  }

  updateState({ isLoading: true });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Analyze financial profile: Income $${state.monthlyIncome}, Ledger: ${JSON.stringify(state.transactions.slice(0, 50))}, Debts: ${JSON.stringify(state.debts)}, Goals: ${JSON.stringify(state.goals)}. Give me a strategic summary and actionable recommendations.`;
    
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
          },
          required: ["analysis", "recommendations"]
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
    showNotification("AI Strategy Generated!", "success");
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
        <div class="bg-emerald-500 p-2 rounded-lg flex items-center justify-center w-10 h-10 shrink-0"><i class="fas fa-brain"></i></div>
        ${state.isSidebarOpen ? '<span class="font-bold text-xl overflow-hidden whitespace-nowrap">MoneyMind</span>' : ''}
      </div>
      <nav class="flex-1 mt-6 px-4 space-y-2">
        ${navItems.map(item => `
          <button onclick="window.navigate('${item.id}')" class="w-full flex items-center gap-4 p-3 rounded-xl transition-all ${state.currentView === item.id ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
            <i class="fas ${item.icon} w-6 text-center"></i>
            ${state.isSidebarOpen ? `<span class="whitespace-nowrap">${item.label}</span>` : ''}
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

const DashboardView = () => {
  const totalIncome = state.transactions.filter(t => t.category === 'income').reduce((a, b) => a + b.amount, 0) + state.monthlyIncome;
  const totalExpense = state.transactions.filter(t => t.category !== 'income').reduce((a, b) => a + b.amount, 0);
  
  return `
    <div class="space-y-6 animate-fade-in">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p class="text-slate-500 text-sm font-medium">Est. Monthly Income</p>
          <h3 class="text-2xl font-bold text-emerald-600">$${totalIncome.toLocaleString()}</h3>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p class="text-slate-500 text-sm font-medium">Logged Monthly Expenses</p>
          <h3 class="text-2xl font-bold text-rose-600">$${totalExpense.toLocaleString()}</h3>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p class="text-slate-500 text-sm font-medium">Financial Goals</p>
          <h3 class="text-2xl font-bold text-indigo-600">${state.goals.length}</h3>
        </div>
      </div>
      <div class="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 class="text-lg font-bold mb-4">Spending by Category</h3>
        <div class="h-[300px] w-full"><canvas id="mainChart"></canvas></div>
      </div>
    </div>
  `;
};

const TransactionModal = () => {
  const t = state.editingTransactionId ? state.transactions.find(x => x.id === state.editingTransactionId) : null;
  return `
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in">
        <div class="p-8 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-2xl font-bold text-slate-800">${t ? 'Edit' : 'New'} Transaction</h3>
          <button onclick="window.closeModal()" class="text-slate-400 hover:text-slate-600 transition-colors">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
        <form onsubmit="window.saveTransaction(event)" class="p-8 space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Date</label>
              <input name="date" type="date" required value="${t ? t.date : new Date().toISOString().split('T')[0]}" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Amount ($)</label>
              <input name="amount" type="number" step="0.01" required value="${t ? t.amount : ''}" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Description</label>
            <input name="description" type="text" required value="${t ? t.description : ''}" placeholder="e.g. Starbucks, Rent" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Category</label>
              <select name="category" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="expense" ${t?.category === 'expense' ? 'selected' : ''}>Expense</option>
                <option value="income" ${t?.category === 'income' ? 'selected' : ''}>Income</option>
                <option value="debt_payment" ${t?.category === 'debt_payment' ? 'selected' : ''}>Debt Payment</option>
                <option value="other" ${t?.category === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Type</label>
              <select name="type" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="debit" ${t?.transactionType === 'debit' ? 'selected' : ''}>Debit (-)</option>
                <option value="credit" ${t?.transactionType === 'credit' ? 'selected' : ''}>Credit (+)</option>
              </select>
            </div>
          </div>
          <button type="submit" class="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-emerald-700 transition-all">
            ${t ? 'Update Record' : 'Add Record'}
          </button>
        </form>
      </div>
    </div>
  `;
};

const GoalsView = () => `
  <div class="space-y-8 animate-fade-in">
    <div class="flex items-center justify-between">
      <h2 class="text-3xl font-bold text-slate-900">Financial Goals</h2>
      <button onclick="window.toggleGoalForm()" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all">
        <i class="fas ${state.isGoalFormOpen ? 'fa-times' : 'fa-plus'}"></i>
        ${state.isGoalFormOpen ? 'Cancel' : 'Add Goal'}
      </button>
    </div>

    ${state.isGoalFormOpen ? `
      <div class="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-fade-in">
        <form onsubmit="window.saveGoal(event)" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Goal Title</label>
            <input name="title" type="text" required placeholder="e.g. Emergency Fund" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Target Amount ($)</label>
            <input name="targetAmount" type="number" required class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Current Saved ($)</label>
            <input name="currentAmount" type="number" value="0" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Target Date</label>
            <input name="deadline" type="date" required class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div class="md:col-span-2">
            <button type="submit" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Save Goal</button>
          </div>
        </form>
      </div>
    ` : ''}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${state.goals.length === 0 ? '<div class="col-span-2 bg-white p-16 rounded-[2rem] text-center border-2 border-dashed border-slate-200"><p class="text-slate-400 italic">No goals set yet. Let\'s build your future.</p></div>' : 
        state.goals.map(goal => {
          const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
          return `
            <div class="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
              <button onclick="window.deleteGoal('${goal.id}')" class="absolute top-6 right-6 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <i class="fas fa-trash"></i>
              </button>
              <div class="flex items-center gap-4 mb-6">
                <div class="bg-emerald-100 text-emerald-600 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner"><i class="fas fa-bullseye"></i></div>
                <div>
                  <h4 class="font-bold text-xl text-slate-800">${goal.title}</h4>
                  <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Target: ${goal.deadline}</p>
                </div>
              </div>
              <div class="flex items-end justify-between mb-3">
                <div class="flex items-baseline gap-1">
                  <span class="text-2xl font-bold text-slate-900">$${goal.currentAmount.toLocaleString()}</span>
                  <span class="text-slate-400 font-medium text-sm">/ $${goal.targetAmount.toLocaleString()}</span>
                </div>
                <span class="font-bold text-emerald-600">${Math.round(progress)}%</span>
              </div>
              <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div class="bg-emerald-500 h-full rounded-full transition-all duration-1000" style="width: ${progress}%"></div>
              </div>
            </div>
          `;
        }).join('')}
    </div>
  </div>
`;

const DebtsView = () => `
  <div class="space-y-8 animate-fade-in">
    <div class="flex items-center justify-between">
      <h2 class="text-3xl font-bold text-slate-900">Debt Management</h2>
      <button onclick="window.toggleDebtForm()" class="bg-rose-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-rose-700 transition-all">
        <i class="fas ${state.isDebtFormOpen ? 'fa-times' : 'fa-plus'}"></i>
        ${state.isDebtFormOpen ? 'Cancel' : 'Register Debt'}
      </button>
    </div>

    ${state.isDebtFormOpen ? `
      <div class="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-fade-in">
        <form onsubmit="window.saveDebt(event)" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Lender Name</label>
            <input name="name" type="text" required placeholder="e.g. Visa Credit Card" class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Total Balance ($)</label>
            <input name="balance" type="number" required class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Interest Rate (%)</label>
            <input name="interestRate" type="number" step="0.01" required class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Minimum Payment ($)</label>
            <input name="minimumPayment" type="number" required class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500">
          </div>
          <div class="md:col-span-2">
            <button type="submit" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-slate-800 transition-all">Register Debt</button>
          </div>
        </form>
      </div>
    ` : ''}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${state.debts.length === 0 ? '<div class="col-span-2 bg-white p-16 rounded-[2rem] text-center border-2 border-dashed border-slate-200"><p class="text-slate-400 italic">No debts registered. Freedom is within reach!</p></div>' : 
        state.debts.map(debt => `
          <div class="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
            <button onclick="window.deleteDebt('${debt.id}')" class="absolute top-6 right-6 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <i class="fas fa-trash"></i>
            </button>
            <div class="flex items-center gap-4 mb-6">
              <div class="bg-rose-100 text-rose-600 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner"><i class="fas fa-file-invoice-dollar"></i></div>
              <div>
                <h4 class="font-bold text-xl text-slate-800">${debt.name}</h4>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${debt.interestRate}% Interest</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div>
                <p class="text-xs font-bold text-slate-400 uppercase mb-1">Total Due</p>
                <p class="text-2xl font-bold text-slate-900">$${debt.balance.toLocaleString()}</p>
              </div>
              <div>
                <p class="text-xs font-bold text-slate-400 uppercase mb-1">Min. Pay</p>
                <p class="text-2xl font-bold text-rose-600">$${debt.minimumPayment.toLocaleString()}</p>
              </div>
            </div>
          </div>
        `).join('')}
    </div>
  </div>
`;

const UploadView = () => `
  <div class="max-w-4xl mx-auto mt-10 space-y-10 animate-fade-in">
    <div class="text-center">
      <h2 class="text-3xl font-bold mb-4">Feed Your MoneyMind</h2>
      <p class="text-slate-500 mb-8 text-lg">Upload bank statements or payslips. Our AI fingerprints files to prevent duplicate processing.</p>
      <div onclick="document.getElementById('file-upload').click()" class="border-4 border-dashed border-slate-200 bg-white p-16 rounded-[2.5rem] cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center">
        <i class="fas fa-cloud-upload-alt text-6xl text-slate-200 mb-4"></i>
        <p class="text-xl font-bold text-slate-700">Drop files or click to browse</p>
        <p class="text-slate-400 mt-2 text-sm">PDF, Image, Excel</p>
        <input id="file-upload" type="file" class="hidden" onchange="window.handleFileUpload(this)">
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="p-6 border-b flex justify-between items-center bg-slate-50/50">
        <h3 class="text-lg font-bold text-slate-800">Processing History</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b">
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">File Name</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">New Records</th>
              <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${state.processedDocuments.length === 0 ? '<tr><td colspan="4" class="p-12 text-center text-slate-400 italic">No files processed in this account.</td></tr>' : 
              state.processedDocuments.map(doc => `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-6 py-4 font-bold text-slate-800">${doc.name}</td>
                  <td class="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">${doc.uploadDate}</td>
                  <td class="px-6 py-4 text-sm font-bold">${doc.transactionCount} items</td>
                  <td class="px-6 py-4">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                      doc.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 
                      doc.status === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700 animate-pulse'
                    }">
                      <i class="fas ${doc.status === 'success' ? 'fa-check-circle' : doc.status === 'error' ? 'fa-times-circle' : 'fa-circle-notch fa-spin'}"></i>
                      ${doc.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;

const TransactionsView = () => {
  const filtered = state.transactions.filter(t => t.description.toLowerCase().includes(state.searchQuery.toLowerCase()));
  return `
    <div class="space-y-6 animate-fade-in">
      <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="relative w-full max-w-md">
          <i class="fas fa-search absolute left-4 top-3.5 text-slate-400"></i>
          <input oninput="window.setSearch(this.value)" type="text" placeholder="Search transactions..." value="${state.searchQuery}" class="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500">
        </div>
        <button onclick="window.openModal()" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all whitespace-nowrap">
          <i class="fas fa-plus"></i> Add Transaction
        </button>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b">
                <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
                <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
                <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Amount</th>
                <th class="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${filtered.length === 0 ? '<tr><td colspan="4" class="p-12 text-center text-slate-400 italic">No transactions match your search.</td></tr>' : 
                filtered.map(t => `
                  <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">${t.date}</td>
                    <td class="px-6 py-4">
                      <div class="font-bold text-slate-800">${t.description}</div>
                      <div class="text-[10px] text-slate-400 uppercase">${t.category.replace('_', ' ')}</div>
                    </td>
                    <td class="px-6 py-4 font-bold text-right ${t.category === 'income' ? 'text-emerald-600' : 'text-slate-900'}">$${t.amount.toLocaleString()}</td>
                    <td class="px-6 py-4 text-center">
                      <div class="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="window.openModal('${t.id}')" class="p-2 text-slate-400 hover:text-emerald-500 transition-all"><i class="fas fa-edit"></i></button>
                        <button onclick="window.deleteTransaction('${t.id}')" class="p-2 text-slate-400 hover:text-rose-500 transition-all"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

// --- Global Actions ---
(window as any).updateState = updateState;
(window as any).navigate = (v: View) => updateState({ currentView: v, isGoalFormOpen: false, isDebtFormOpen: false });
(window as any).logout = () => updateState({ user: null, currentView: View.LOGIN });
(window as any).setSearch = (val: string) => updateState({ searchQuery: val });
(window as any).toggleAuth = () => updateState({ isRegistering: !state.isRegistering });
(window as any).openModal = (id: string | null = null) => updateState({ isTransactionModalOpen: true, editingTransactionId: id });
(window as any).closeModal = () => updateState({ isTransactionModalOpen: false, editingTransactionId: null });
(window as any).generatePlan = generatePlan;

(window as any).handleAuth = (e: Event) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const username = (formData.get('username') as string).trim();
  const password = (formData.get('password') as string).trim();

  if (username.length < 3 || password.length < 3) {
    showNotification("Credentials must be 3+ chars.", "error");
    return;
  }

  const users = JSON.parse(localStorage.getItem('moneymind_users') || '{}');
  if (state.isRegistering) {
    if (users[username]) {
      showNotification("Username taken.", "error");
      return;
    }
    users[username] = password;
    localStorage.setItem('moneymind_users', JSON.stringify(users));
  } else {
    if (!users[username] || users[username] !== password) {
      showNotification("Invalid user or password.", "error");
      return;
    }
  }

  const savedData = JSON.parse(localStorage.getItem(`moneymind_data_${username}`) || '{}');
  updateState({ 
    user: { username, isLoggedIn: true }, 
    currentView: View.DASHBOARD,
    transactions: savedData.transactions || [],
    goals: savedData.goals || [],
    debts: savedData.debts || [],
    processedDocuments: savedData.processedDocuments || [],
    fileHashes: savedData.fileHashes || [],
    monthlyIncome: savedData.monthlyIncome || 0,
    analysis: savedData.analysis,
    recommendations: savedData.recommendations
  });
};

(window as any).handleFileUpload = async (input: HTMLInputElement) => {
  const file = input.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = (e.target?.result as string).split(',')[1];
    
    // --- Fingerprinting Check ---
    const hash = await computeHash(base64);
    if (state.fileHashes.includes(hash)) {
      showNotification(`File "${file.name}" has already been processed in your account.`, "warning");
      input.value = ''; // Reset input
      return;
    }
    
    analyzeDocument(base64, file.type, file.name, hash);
  };
  reader.readAsDataURL(file);
};

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
  showNotification("Transaction saved locally", "success");
};

(window as any).deleteTransaction = (id: string) => {
  updateState({ transactions: state.transactions.filter(t => t.id !== id) });
  showNotification("Record removed", "info");
};

(window as any).toggleGoalForm = () => updateState({ isGoalFormOpen: !state.isGoalFormOpen });
(window as any).saveGoal = (e: Event) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const goal: FinancialGoal = {
    id: Math.random().toString(36).substr(2, 9),
    title: formData.get('title') as string,
    targetAmount: Number(formData.get('targetAmount')),
    currentAmount: Number(formData.get('currentAmount') || 0),
    deadline: formData.get('deadline') as string,
    priority: 'medium'
  };
  updateState({ goals: [...state.goals, goal], isGoalFormOpen: false });
  showNotification("New goal tracked!", "success");
};
(window as any).deleteGoal = (id: string) => {
  updateState({ goals: state.goals.filter(g => g.id !== id) });
  showNotification("Goal removed", "info");
};

(window as any).toggleDebtForm = () => updateState({ isDebtFormOpen: !state.isDebtFormOpen });
(window as any).saveDebt = (e: Event) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);
  const debt: Debt = {
    id: Math.random().toString(36).substr(2, 9),
    name: formData.get('name') as string,
    balance: Number(formData.get('balance')),
    interestRate: Number(formData.get('interestRate')),
    minimumPayment: Number(formData.get('minimumPayment'))
  };
  updateState({ debts: [...state.debts, debt], isDebtFormOpen: false });
  showNotification("Debt registered for strategy", "success");
};
(window as any).deleteDebt = (id: string) => {
  updateState({ debts: state.debts.filter(d => d.id !== id) });
  showNotification("Debt record removed", "info");
};

// --- Main Render Logic ---
const render = () => {
  const root = document.getElementById('root');
  if (!root) return;

  if (state.currentView === View.LOGIN) {
    root.innerHTML = `
      <div class="h-screen w-full flex items-center justify-center bg-slate-900 p-4">
        <div class="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center animate-fade-in">
          <div class="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
            <i class="fas fa-brain text-white text-4xl"></i>
          </div>
          <h1 class="text-3xl font-bold text-slate-900 mb-2">MoneyMind AI</h1>
          <p class="text-slate-500 mb-8">${state.isRegistering ? 'Start tracking your wealth' : 'Welcome back, sign in'}</p>
          <form onsubmit="window.handleAuth(event)" class="space-y-4">
            <div class="relative"><i class="fas fa-user absolute left-4 top-4 text-slate-400"></i><input name="username" type="text" placeholder="Username" required class="w-full pl-11 pr-4 py-4 bg-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"></div>
            <div class="relative"><i class="fas fa-lock absolute left-4 top-4 text-slate-400"></i><input name="password" type="password" placeholder="Password" required class="w-full pl-11 pr-4 py-4 bg-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all"></div>
            <button type="submit" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">${state.isRegistering ? 'Create Account' : 'Sign In'}</button>
          </form>
          <div class="mt-8"><button onclick="window.toggleAuth()" class="text-emerald-600 font-bold hover:text-emerald-700 transition-all">${state.isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}</button></div>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="flex h-screen bg-slate-50 overflow-hidden relative">
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
          <button onclick="window.generatePlan()" class="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-emerald-700 whitespace-nowrap">Refresh AI Plan</button>
        </header>

        <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
          ${state.currentView === View.DASHBOARD ? DashboardView() : ''}
          ${state.currentView === View.UPLOADS ? UploadView() : ''}
          ${state.currentView === View.TRANSACTIONS ? TransactionsView() : ''}
          ${state.currentView === View.GOALS ? GoalsView() : ''}
          ${state.currentView === View.DEBTS ? DebtsView() : ''}
          ${state.currentView === View.PLAN ? `
            <div class="max-w-4xl mx-auto space-y-6">
              <div class="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                <h2 class="text-2xl font-bold mb-4 flex items-center gap-3"><i class="fas fa-magic text-emerald-400"></i> AI Analysis</h2>
                <p class="text-slate-300 leading-relaxed text-lg">${state.analysis || 'Process documents to generate insights.'}</p>
              </div>
              <div class="grid grid-cols-1 gap-4">
                ${(state.recommendations || []).map(r => `
                  <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                    <div class="flex justify-between items-start mb-2">
                      <h4 class="font-bold text-xl text-slate-800">${r.title}</h4>
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

  // Chart Rendering
  if (state.currentView === View.DASHBOARD) {
    setTimeout(() => {
      const canvas = document.getElementById('mainChart') as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const cats = state.transactions.filter(t => t.category !== 'income');
        const grouped = cats.reduce((acc: any, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {});
        
        const labels = Object.keys(grouped);
        if (labels.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px Inter';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('No spending data yet.', canvas.width / 2, canvas.height / 2);
            return;
        }

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              data: Object.values(grouped),
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
              borderRadius: 12
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } }
        });
      }
    }, 0);
  }
};

render();
