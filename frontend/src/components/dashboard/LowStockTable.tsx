import React from 'react';
import { Product } from '../../types';
import { Badge } from '../common/Badge';
import { AlertCircle, Plus } from 'lucide-react';

interface LowStockTableProps {
  items: Product[];
  onTriggerReceipt?: (product: Product) => void;
}

export const LowStockTable: React.FC<LowStockTableProps> = ({ items, onTriggerReceipt }) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Critical Stock & Reorder Alerts</h4>
            <p className="text-xs text-slate-500">Products operating below safety buffer</p>
          </div>
        </div>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          {items.length} {items.length === 1 ? 'Item Needs Attention' : 'Items Need Attention'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 text-[10px]">
            <tr>
              <th className="px-4 py-2.5">Product / SKU</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5 text-right">Available Stock</th>
              <th className="px-4 py-2.5 text-right">Min Alert Level</th>
              <th className="px-4 py-2.5 text-right">Suggested Reorder</th>
              <th className="px-4 py-2.5 text-center">Status</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  All inventory items are currently above safety thresholds.
                </td>
              </tr>
            ) : (
              items.map((prod) => (
                <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{prod.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{prod.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{prod.category_name}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {prod.total_stock} <span className="font-normal text-slate-500 text-[11px]">{prod.uom}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{prod.min_stock_alert}</td>
                  <td className="px-4 py-3 text-right text-brand-700 font-medium">
                    +{prod.reorder_quantity} {prod.uom}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge status={prod.stock_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onTriggerReceipt?.(prod)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded text-xs transition-colors shadow-xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create Receipt</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
