import React, { useState } from 'react';
import { Transaction } from '../types.ts';

interface TransactionManagerProps {
  transactions: Transaction[];
  onAdd: (t: Omit<Transaction, 'id'>) => void;
  onUpdate: (t: Transaction) => void;
  onDelete: (id: string) => void;
}

const TransactionManager: React.FC<TransactionManagerProps> = ({ transactions, onAdd, onUpdate, onDelete }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
    category: 'expense',
    transactionType: 'debit',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      onUpdate({ ...formData, id: editingId });
      setEditingId(null);
    } else {
      onAdd(formData);
    }
    setShowForm(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: 0,
      category: 'expense',
      transactionType: 'debit',
    });
  };

  const handleEdit = (t: Transaction) => {
    setFormData({
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: t.category,
      transactionType: t.transactionType,
      sourceAccount: t.sourceAccount,
      destinationAccount: t.destinationAccount,
      referenceNumber: t.referenceNumber,
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <i className="fas fa-search absolute left-4 top-3 text-slate-400"></i>
          <input 
            type="text"
            placeholder="Search transactions..."
            className="w-full pl-11 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }}
          className="bg-slate-900 text-white px-6 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors"
        >
          <i className="fas fa-plus"></i> Add Transaction
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">{editingId ? 'Edit Transaction' : 'New Transaction'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                  <input 
                    type="date" required
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Amount ($)</label>
                  <input 
                    type="number" step="0.01" required
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.amount || ''}
                    onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <input 
                  type="text" required
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="e.g. Starbucks, Rent Payment"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                  <select 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value as any})}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="debt_payment">Debt Payment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Type</label>
                  <select 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.transactionType}
                    onChange={e => setFormData({...formData, transactionType: e.target.value as any})}
                  >
                    <option value="debit">Debit (-)</option>
                    <option value="credit">Credit (+)</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-100">
                {editingId ? 'Update Record' : 'Add Record'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center">
                      <i className="fas fa-inbox text-3xl mb-2"></i>
                      <p>No transactions found matching your criteria.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-800">{t.description}</p>
                      {t.referenceNumber && <p className="text-[10px] text-slate-400 font-mono">#{t.referenceNumber}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-tighter ${
                        t.category === 'income' ? 'bg-emerald-100 text-emerald-700' :
                        t.category === 'debt_payment' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {t.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-right ${
                      t.category === 'income' || t.transactionType === 'credit' ? 'text-emerald-600' : 'text-slate-900'
                    }`}>
                      {t.category === 'income' || t.transactionType === 'credit' ? '+' : '-'}${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(t)} className="p-2 text-slate-400 hover:text-emerald-500 transition-colors">
                          <i className="fas fa-edit"></i>
                        </button>
                        <button onClick={() => onDelete(t.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransactionManager;
