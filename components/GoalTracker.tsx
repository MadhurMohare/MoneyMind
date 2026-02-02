
import React, { useState } from 'react';
import { FinancialGoal } from '../types';

interface GoalTrackerProps {
  goals: FinancialGoal[];
  onAdd: (goal: Omit<FinancialGoal, 'id'>) => void;
  onRemove: (id: string) => void;
}

const GoalTracker: React.FC<GoalTrackerProps> = ({ goals, onAdd, onRemove }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    targetAmount: 0,
    currentAmount: 0,
    deadline: '',
    priority: 'medium' as const
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(newGoal);
    setShowAddForm(false);
    setNewGoal({ title: '', targetAmount: 0, currentAmount: 0, deadline: '', priority: 'medium' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-800">Your Financial Goals</h3>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
        >
          {showAddForm ? 'Cancel' : 'Add New Goal'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal Title</label>
              <input 
                required
                className="w-full p-2 border border-slate-300 rounded-lg"
                value={newGoal.title}
                onChange={e => setNewGoal({...newGoal, title: e.target.value})}
                placeholder="e.g. New Car, House Downpayment"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Amount ($)</label>
              <input 
                type="number"
                required
                className="w-full p-2 border border-slate-300 rounded-lg"
                value={newGoal.targetAmount || ''}
                onChange={e => setNewGoal({...newGoal, targetAmount: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Amount ($)</label>
              <input 
                type="number"
                className="w-full p-2 border border-slate-300 rounded-lg"
                value={newGoal.currentAmount || ''}
                onChange={e => setNewGoal({...newGoal, currentAmount: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Date</label>
              <input 
                type="date"
                required
                className="w-full p-2 border border-slate-300 rounded-lg"
                value={newGoal.deadline}
                onChange={e => setNewGoal({...newGoal, deadline: e.target.value})}
              />
            </div>
          </div>
          <button type="submit" className="mt-4 w-full bg-slate-900 text-white py-2 rounded-lg font-medium">Save Goal</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {goals.map(goal => {
          const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
          return (
            <div key={goal.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative">
              <button 
                onClick={() => onRemove(goal.id)}
                className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <i className="fas fa-trash"></i>
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                  <i className="fas fa-bullseye"></i>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{goal.title}</h4>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Target: {goal.deadline}</p>
                </div>
              </div>

              <div className="flex items-end justify-between mb-2">
                <p className="text-sm font-medium text-slate-600">
                  <span className="text-lg font-bold text-slate-900">${goal.currentAmount.toLocaleString()}</span> / ${goal.targetAmount.toLocaleString()}
                </p>
                <p className="text-sm font-bold text-emerald-600">{Math.round(progress)}%</p>
              </div>

              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GoalTracker;
