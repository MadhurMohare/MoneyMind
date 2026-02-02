
import React from 'react';
import { FinancialState } from '../types';

interface PlanDisplayProps {
  state: FinancialState;
}

const PlanDisplay: React.FC<PlanDisplayProps> = ({ state }) => {
  if (!state.analysis && !state.recommendations) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200">
        <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6">
          <i className="fas fa-magic text-3xl"></i>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">No Plan Generated Yet</h3>
        <p className="text-slate-500 text-center max-w-md px-6">Click "Refresh AI Plan" to let MoneyMind analyze your data and create a custom strategy for your goals.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900 text-white p-8 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-emerald-500 p-3 rounded-2xl">
            <i className="fas fa-robot text-2xl"></i>
          </div>
          <div>
            <h2 className="text-2xl font-bold">MoneyMind Strategy</h2>
            <p className="text-indigo-200">Personalized Financial Blueprint</p>
          </div>
        </div>
        <div className="prose prose-invert max-w-none">
          <p className="text-lg leading-relaxed text-indigo-50">
            {state.analysis}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <i className="fas fa-tasks text-emerald-500"></i>
          Actionable Steps
        </h3>
        {state.recommendations?.map((rec, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">{rec.title}</h4>
                <p className="text-slate-500">{rec.description}</p>
              </div>
              <div className="bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-sm font-bold self-start">
                Impact: {rec.impact}
              </div>
            </div>
            
            <div className="space-y-3">
              {rec.steps.map((step, sIdx) => (
                <div key={sIdx} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 mt-0.5">
                    {sIdx + 1}
                  </div>
                  <p className="text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-6">
        <div className="bg-emerald-500 text-white w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-emerald-200">
          <i className="fas fa-lightbulb"></i>
        </div>
        <div>
          <h4 className="font-bold text-emerald-900">Pro Tip</h4>
          <p className="text-emerald-700 text-sm">Our AI recommends the <b>Debt Avalanche</b> method for your current debt profile to save approximately $1,240 in interest over the next 12 months.</p>
        </div>
      </div>
    </div>
  );
};

export default PlanDisplay;
