
import React, { useState } from 'react';
import { Debt } from '../types';

interface DebtTrackerProps {
  debts: Debt[];
  onAdd: (debt: Omit<Debt, 'id'>) => void;
  onRemove: (id: string) => void;
}

const DebtTracker: React.FC<DebtTrackerProps> = ({ debts, onAdd, onRemove }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDebt, setNewDebt] = useState({
    name: '',
    balance: 0,
    interestRate: 0,
    minimumPayment: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(newDebt);
    setShowAddForm(false);
    setNewDebt({ name: '', balance: 0, interestRate: 0, minimumPayment: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-800">Outstanding Debts</h3>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
        >
          <i className={`fas fa-${showAddForm ? 'times' : 'plus'}`}></i>
          {showAddForm ? 'Cancel' : 'Add Debt Manually'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Debt Name</label>
              <input 
                required
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                value={newDebt.name}
                onChange={e => setNewDebt({...newDebt, name: e.target.value})}
                placeholder="e.g. Credit Card, Mortgage"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Balance ($)</label>
              <input 
                type="number"
                required
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                value={newDebt.balance || ''}
                onChange={e => setNewDebt({...newDebt, balance: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
              <input 
                type="number"
                step="0.01"
                required
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                value={newDebt.interestRate || ''}
                onChange={e => setNewDebt({...newDebt, interestRate: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Minimum Payment ($)</label>
              <input 
                type="number"
                required
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                value={newDebt.minimumPayment || ''}
                onChange={e => setNewDebt({...newDebt, minimumPayment: Number(e.target.value)})}
              />
            </div>
          </div>
          <button type="submit" className="mt-4 w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors">
            Register Debt
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {debts.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <i className="fas fa-hand-holding-dollar text-4xl text-slate-200 mb-3"></i>
            <p className="text-slate-500 font-medium">No debts registered. Great job!</p>
          </div>
        ) : (
          debts.map(debt => (
            <div key={debt.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
              <button 
                onClick={() => onRemove(debt.id)}
                className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <i className="fas fa-trash"></i>
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                  <i className="fas fa-file-invoice-dollar"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{debt.name}</h4>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">{debt.interestRate}% Interest</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-tight">Remaining</p>
                  <p className="text-xl font-bold text-slate-900">${debt.balance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-tight">Min. Monthly</p>
                  <p className="text-xl font-bold text-rose-600">${debt.minimumPayment.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Last updated just now</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase">Verified</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebtTracker;
