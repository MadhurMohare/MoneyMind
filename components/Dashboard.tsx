import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FinancialState } from '../types.ts';

interface DashboardProps {
  state: FinancialState;
}

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  const totalIncome = useMemo(() => {
    return state.transactions
      .filter(t => t.category === 'income')
      .reduce((sum, t) => sum + t.amount, 0) + (state.monthlyIncome || 0);
  }, [state]);

  const totalExpenses = useMemo(() => {
    return state.transactions
      .filter(t => t.category === 'expense' || t.category === 'debt_payment')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [state]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    state.transactions.forEach(t => {
      if (t.category !== 'income') {
        counts[t.category] = (counts[t.category] || 0) + t.amount;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [state.transactions]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
              <i className="fas fa-arrow-up text-xl"></i>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Monthly Income</p>
              <h3 className="text-2xl font-bold text-slate-900">${totalIncome.toLocaleString()}</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-full"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
              <i className="fas fa-arrow-down text-xl"></i>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Total Expenses</p>
              <h3 className="text-2xl font-bold text-slate-900">${totalExpenses.toLocaleString()}</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-rose-500 h-full w-2/3"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
              <i className="fas fa-hand-holding-usd text-xl"></i>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Total Debt</p>
              <h3 className="text-2xl font-bold text-slate-900">${state.debts.reduce((s, d) => s + d.balance, 0).toLocaleString()}</h3>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full w-1/4"></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Spending Analysis</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {state.transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <i className="fas fa-receipt text-4xl mb-3"></i>
                <p>No transactions found. Upload a statement.</p>
              </div>
            ) : (
              state.transactions.slice(-6).reverse().map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      t.category === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <i className={`fas fa-${t.category === 'income' ? 'plus' : 'shopping-cart'}`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{t.description}</p>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">{t.category}</p>
                    </div>
                  </div>
                  <p className={`font-semibold ${t.category === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {t.category === 'income' ? '+' : '-'}${t.amount.toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
