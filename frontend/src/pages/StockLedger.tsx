import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { StockLedgerEntry } from '../types';
import { Badge } from '../components/common/Badge';
import { Search, Filter } from 'lucide-react';

export const StockLedger: React.FC = () => {
  const [entries, setEntries] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getLedger();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredEntries = entries.filter((e) => {
    const matchesSearch =
      (e.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (e.product_sku?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (e.reference_doc_number?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (e.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesAction = !selectedAction || e.action_type === selectedAction;
    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Stock Movement Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-grade double-entry transaction history. Every receipt, delivery, transfer, and adjustment is recorded.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by SKU, product name, document #, or audit notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-brand-600 text-xs"
          >
            <option value="">All Action Types</option>
            <option value="RECEIPT">Receipt (Inbound +)</option>
            <option value="DELIVERY">Delivery (Outbound -)</option>
            <option value="TRANSFER_IN">Transfer In (+)</option>
            <option value="TRANSFER_OUT">Transfer Out (-)</option>
            <option value="ADJUSTMENT">Stock Adjustment (&Delta;)</option>
            <option value="INITIAL">Initial Balance Allocation</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 text-[10px]">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Action Type</th>
                <th className="px-4 py-2.5">Product / SKU</th>
                <th className="px-4 py-2.5">Warehouse / Location</th>
                <th className="px-4 py-2.5 text-right">Quantity Change</th>
                <th className="px-4 py-2.5 text-right">Balance After</th>
                <th className="px-4 py-2.5">Reference Document</th>
                <th className="px-4 py-2.5">Auditor / User</th>
                <th className="px-4 py-2.5">Notes & Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading ledger entries...</td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">No movement entries match your criteria.</td>
                </tr>
              ) : (
                filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Badge status={e.action_type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{e.product_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{e.product_sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <div>{e.warehouse_name || 'Warehouse'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{e.location_name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-medium ${
                          e.change_qty > 0
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                            : e.change_qty < 0
                            ? 'text-rose-700 bg-rose-50 border border-rose-200/60'
                            : 'text-slate-600 bg-slate-50 border border-slate-200/60'
                        }`}
                      >
                        {e.change_qty > 0 ? `+${e.change_qty}` : e.change_qty}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-900 font-mono">
                      {e.balance_after}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-700 font-medium">
                      {e.reference_doc_number || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 font-medium">
                      {e.user_email || 'System / Batch'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={e.notes || ''}>
                      {e.notes || '—'}
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
