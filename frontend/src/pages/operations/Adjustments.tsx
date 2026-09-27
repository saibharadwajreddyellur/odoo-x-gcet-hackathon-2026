import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { StockAdjustment, Product, Warehouse } from '../../types';
import { Modal } from '../../components/common/Modal';
import { SlidersHorizontal, Plus, AlertCircle, FileSpreadsheet, Check } from 'lucide-react';

export const Adjustments: React.FC = () => {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // New Adjustment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [recordedQty, setRecordedQty] = useState(0);
  const [countedQty, setCountedQty] = useState('0');
  const [reason, setReason] = useState('Cycle Count Discrepancy');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adjs, prods, whs] = await Promise.all([
        api.getAdjustments(),
        api.getProducts(),
        api.getWarehouses()
      ]);
      setAdjustments(adjs);
      setProducts(prods);
      setWarehouses(whs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update recorded stock dynamically when product & location are selected
  useEffect(() => {
    if (selectedProductId && selectedLocationId) {
      const prod = products.find(p => p.id === Number(selectedProductId));
      const level = prod?.stock_levels.find(sl => sl.location_id === Number(selectedLocationId));
      const onHand = level ? level.quantity_on_hand : 0;
      setRecordedQty(onHand);
      setCountedQty(String(onHand));
    }
  }, [selectedProductId, selectedLocationId, products]);

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createAdjustment({
        product_id: Number(selectedProductId),
        location_id: Number(selectedLocationId),
        counted_qty: Number(countedQty),
        reason,
        notes
      });
      setIsModalOpen(false);
      setSelectedProductId('');
      setSelectedLocationId('');
      setNotes('');
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const allLocations = warehouses.flatMap(w =>
    w.locations.map(l => ({ ...l, warehouse_name: w.name }))
  );

  const diff = Number(countedQty) - recordedQty;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Stock Adjustments & Physical Audits</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reconcile physical inventory counts against registered system levels with instant variance logging.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Stock Count Adjustment</span>
        </button>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 text-[10px]">
              <tr>
                <th className="px-4 py-2.5">Adjustment #</th>
                <th className="px-4 py-2.5">Product Name & SKU</th>
                <th className="px-4 py-2.5">Audited Location</th>
                <th className="px-4 py-2.5 text-right">System Recorded</th>
                <th className="px-4 py-2.5 text-right">Physical Count</th>
                <th className="px-4 py-2.5 text-right">Discrepancy (&Delta;)</th>
                <th className="px-4 py-2.5">Reason / Justification</th>
                <th className="px-4 py-2.5 text-right">Auditor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading adjustments...</td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No physical count adjustments recorded yet.
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-700 font-semibold">{adj.adjustment_number}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900">{adj.product_name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{adj.product_sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{adj.location_name || 'Warehouse Zone'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-600">{adj.recorded_qty}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{adj.counted_qty}</td>
                    <td className="px-4 py-2.5 text-right font-bold">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                          adj.diff_qty > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : adj.diff_qty < 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {adj.diff_qty > 0 ? `+${adj.diff_qty}` : adj.diff_qty}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      <div>{adj.reason}</div>
                      {adj.notes && <div className="text-[11px] text-slate-400">{adj.notes}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500 font-medium">
                      {adj.adjusted_by || 'Alex Morgan'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Adjustment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Physical Inventory Adjustment"
        subtitle="Select product, verify recorded inventory against physical count, and record discrepancy"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateAdjustment} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Product *</label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Choose item to audit...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Storage Location *</label>
            <select
              required
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Choose audited location...</option>
              {allLocations.map(l => (
                <option key={l.id} value={l.id}>{l.warehouse_name} &rarr; {l.name} ({l.code})</option>
              ))}
            </select>
          </div>

          {/* Real-time Delta Visualizer */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">System Recorded</span>
              <p className="text-xl font-bold text-slate-700 mt-1">{recordedQty}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-700">Physical Count</span>
              <input
                type="number"
                min="0"
                required
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                className="w-full text-center font-bold text-xl py-1 mt-1 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 text-slate-900"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-500">Calculated Variance</span>
              <p className={`text-xl font-bold mt-1 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                {diff > 0 ? `+${diff}` : diff}
              </p>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Adjustment Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="Cycle Count Discrepancy">Cycle Count Discrepancy</option>
              <option value="Damaged Stock Write-off">Damaged Stock Write-off</option>
              <option value="Found Unregistered Inventory">Found Unregistered Inventory</option>
              <option value="Packaging Leakage / Loss">Packaging Leakage / Loss</option>
              <option value="Theft or Unaccounted Shrinkage">Theft or Unaccounted Shrinkage</option>
              <option value="Manufacturer Return">Manufacturer Return</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Audit Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Recounted by Shift Supervisor, verified pallet seal intact."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold shadow-xs transition-all"
            >
              {submitting ? 'Applying Adjustment...' : 'Apply Count & Write to Ledger'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
