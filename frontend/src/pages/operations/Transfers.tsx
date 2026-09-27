import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { InternalTransfer, Product, Warehouse } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import {
  ArrowLeftRight, Plus, CheckCircle2, ShieldCheck, Trash2, Calendar,
  Search, LayoutList, Kanban, Eye, XCircle, ArrowRight, ChevronRight,
  AlertCircle, RefreshCw, Check
} from 'lucide-react';

export const Transfers: React.FC = () => {
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  // Details Modal
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null);

  // New Transfer Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceLocId, setSourceLocId] = useState('');
  const [destLocId, setDestLocId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [createStatus, setCreateStatus] = useState<'DRAFT' | 'SCHEDULED'>('DRAFT');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; quantity: string }>>([
    { product_id: '', quantity: '5' }
  ]);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [trfs, prods, whs] = await Promise.all([
        api.getTransfers(),
        api.getProducts(),
        api.getWarehouses()
      ]);
      setTransfers(trfs);
      setProducts(prods);
      setWarehouses(whs);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load transfer data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItemRow = () => {
    setItems([...items, { product_id: '', quantity: '1' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceLocId === destLocId) {
      alert('Source and destination locations cannot be the same!');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.createTransfer({
        source_location_id: Number(sourceLocId),
        dest_location_id: Number(destLocId),
        status: createStatus,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
        notes,
        items: items.map(i => ({
          product_id: Number(i.product_id),
          quantity: Number(i.quantity)
        }))
      });
      setIsModalOpen(false);
      setSourceLocId('');
      setDestLocId('');
      setNotes('');
      setCreateStatus('DRAFT');
      setItems([{ product_id: '', quantity: '5' }]);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create internal transfer');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * DRAFT → SCHEDULED: Confirm transfer intent and schedule execution
   */
  const handleScheduleTransfer = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.scheduleTransfer(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to schedule transfer');
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * SCHEDULED → COMPLETED: Atomically move inventory from source to destination
   * Dual StockLedger audit records logged; company total quantity strictly invariant
   */
  const handleCompleteTransfer = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.completeTransfer(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Transfer execution failed');
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Cancel transfer from DRAFT or SCHEDULED
   * Completed transfers are strictly immutable
   */
  const handleCancelTransfer = async (id: number) => {
    const target = transfers.find(t => t.id === id);
    if (!target) return;
    if (target.status === 'COMPLETED') {
      setErrorMsg('Cannot cancel a completed transfer — inventory has already been moved.');
      return;
    }
    if (target.status === 'CANCELLED') {
      setErrorMsg('Transfer is already cancelled.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to cancel internal transfer ${target.transfer_number}? This cannot be undone.`
    );
    if (!confirmed) return;

    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.cancelTransfer(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel transfer');
    } finally {
      setProcessingId(null);
    }
  };

  const allLocations = warehouses.flatMap(w =>
    w.locations.map(l => ({ ...l, warehouse_name: w.name }))
  );

  // Filter transfers based on search query
  const filteredTransfers = transfers.filter(trf => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchNum = trf.transfer_number.toLowerCase().includes(q);
    const matchSource = (trf.source_location_name || '').toLowerCase().includes(q);
    const matchDest = (trf.dest_location_name || '').toLowerCase().includes(q);
    const matchNotes = (trf.notes || '').toLowerCase().includes(q);
    const matchItems = trf.items.some(it =>
      (it.product_name || '').toLowerCase().includes(q) ||
      (it.product_sku || '').toLowerCase().includes(q)
    );
    return matchNum || matchSource || matchDest || matchNotes || matchItems;
  });

  const selectedTransfer = selectedTransferId ? transfers.find(t => t.id === selectedTransferId) : null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Internal Stock Transfers</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Relocate stock across bins, racks, and branch facilities. Workflow: <span className="font-semibold text-slate-700">Draft &rarr; Scheduled &rarr; Completed</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold transition-colors"
            title="Refresh Transfers"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Internal Transfer</span>
          </button>
        </div>
      </div>

      {/* Conservation Invariant Banner */}
      <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <span className="font-bold">Inventory Integrity Protected:</span> Internal stock transfers relocate physical items atomically between warehouses, strictly conserving total inventory with dual ledger auditing.
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      {/* Search Bar & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transfers by reference, location, item SKU..."
            className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">View:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: List vs Kanban */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
          Loading transfers...
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
          {searchQuery ? 'No internal transfers match your search query.' : 'No internal transfers recorded. Click "New Internal Transfer" to initiate one.'}
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="space-y-4">
          {filteredTransfers.map((trf) => (
            <div key={trf.id} className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                    <ArrowLeftRight className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{trf.transfer_number}</span>
                      <Badge status={trf.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                      <span className="font-medium text-slate-800">{trf.source_location_name || `Location #${trf.source_location_id}`}</span>
                      <span className="text-slate-400">&rarr;</span>
                      <span className="font-medium text-slate-800">{trf.dest_location_name || `Location #${trf.dest_location_id}`}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-slate-400 mr-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(trf.scheduled_date)}</span>
                  </div>

                  {/* Workflow Action Buttons */}
                  {trf.status === 'DRAFT' && (
                    <>
                      <button
                        onClick={() => handleCancelTransfer(trf.id)}
                        disabled={processingId === trf.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                        title="Cancel Transfer"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Cancel</span>
                      </button>
                      <button
                        onClick={() => handleScheduleTransfer(trf.id)}
                        disabled={processingId === trf.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all disabled:opacity-60"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{processingId === trf.id ? 'Scheduling...' : 'Schedule / Confirm'}</span>
                      </button>
                    </>
                  )}

                  {trf.status === 'SCHEDULED' && (
                    <>
                      <button
                        onClick={() => handleCancelTransfer(trf.id)}
                        disabled={processingId === trf.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                        title="Cancel Transfer"
                      >
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Cancel</span>
                      </button>
                      <button
                        onClick={() => handleCompleteTransfer(trf.id)}
                        disabled={processingId === trf.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-all disabled:opacity-60"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{processingId === trf.id ? 'Transferring...' : 'Execute & Complete'}</span>
                      </button>
                    </>
                  )}

                  {trf.status === 'COMPLETED' && (
                    <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      Completed & Audited
                    </span>
                  )}

                  {trf.status === 'CANCELLED' && (
                    <span className="text-[11px] text-rose-700 font-medium bg-rose-50 px-2 py-1 rounded border border-rose-200">
                      Cancelled
                    </span>
                  )}

                  {/* Details View Button */}
                  <button
                    onClick={() => setSelectedTransferId(trf.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors ml-1"
                    title="View Transfer Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Items in Transfer */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Item Name / SKU</th>
                      <th className="px-3 py-2 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trf.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {item.product_name} <span className="font-mono text-slate-400 text-[10px]">({item.product_sku})</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{item.quantity} Units</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {trf.notes && (
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="font-semibold text-slate-600">Notes:</span> {trf.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* KANBAN VIEW */
        <div className="w-full overflow-x-auto pb-6 pt-1">
          <div className="flex gap-4 items-start min-w-max">
            {(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const).map((colStatus) => {
              const colTransfers = filteredTransfers.filter(t => t.status === colStatus);
              const colLabels = {
                DRAFT: 'Draft Transfers',
                SCHEDULED: 'Scheduled / In Transit',
                COMPLETED: 'Completed (Audited)',
                CANCELLED: 'Cancelled'
              };

              return (
                <div
                  key={colStatus}
                  className="w-[300px] min-w-[300px] shrink-0 bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 flex flex-col space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                        {colLabels[colStatus]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shadow-xs">
                        {colTransfers.length}
                      </span>
                    </div>
                  </div>

                  {colTransfers.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No transfers
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {colTransfers.map((trf) => (
                        <div
                          key={trf.id}
                          className="bg-white rounded-lg border border-slate-200/80 p-3 shadow-xs space-y-2.5 hover:border-slate-300 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-slate-900">{trf.transfer_number}</span>
                            <button
                              onClick={() => setSelectedTransferId(trf.id)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-600 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">From:</span>
                              <span className="font-medium text-slate-800 truncate">{trf.source_location_name || `Loc #${trf.source_location_id}`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">To:</span>
                              <span className="font-medium text-slate-800 truncate">{trf.dest_location_name || `Loc #${trf.dest_location_id}`}</span>
                            </div>
                          </div>

                          <div className="text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100">
                            <span className="font-medium text-slate-700">{trf.items.length} item{trf.items.length !== 1 ? 's' : ''}: </span>
                            <span className="text-slate-500">
                              {trf.items.slice(0, 2).map(it => `${it.product_sku || it.product_name} (${it.quantity})`).join(', ')}
                              {trf.items.length > 2 && '...'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                            <span>{formatDate(trf.scheduled_date)}</span>

                            {/* Kanban Action Buttons */}
                            <div className="flex items-center gap-1.5">
                              {trf.status === 'DRAFT' && (
                                <>
                                  <button
                                    onClick={() => handleCancelTransfer(trf.id)}
                                    disabled={processingId === trf.id}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                    title="Cancel"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleScheduleTransfer(trf.id)}
                                    disabled={processingId === trf.id}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-[10px] shadow-xs"
                                  >
                                    {processingId === trf.id ? '...' : 'Schedule'}
                                  </button>
                                </>
                              )}

                              {trf.status === 'SCHEDULED' && (
                                <>
                                  <button
                                    onClick={() => handleCancelTransfer(trf.id)}
                                    disabled={processingId === trf.id}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                    title="Cancel"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleCompleteTransfer(trf.id)}
                                    disabled={processingId === trf.id}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[10px] shadow-xs"
                                  >
                                    {processingId === trf.id ? '...' : 'Execute'}
                                  </button>
                                </>
                              )}

                              {trf.status === 'COMPLETED' && (
                                <span className="text-[10px] text-emerald-700 font-semibold">Done</span>
                              )}

                              {trf.status === 'CANCELLED' && (
                                <span className="text-[10px] text-rose-600 font-semibold">Cancelled</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Details View Modal */}
      {selectedTransfer && (
        <Modal
          isOpen={!!selectedTransfer}
          onClose={() => setSelectedTransferId(null)}
          title={`Transfer Details: ${selectedTransfer.transfer_number}`}
          subtitle={`Internal movement between warehouse locations`}
          maxWidth="2xl"
        >
          <div className="space-y-5 text-xs">
            {/* Header & Status Progression Tracker */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">{selectedTransfer.transfer_number}</span>
                  <Badge status={selectedTransfer.status} size="md" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Created on {formatDate(selectedTransfer.created_at)}
                  {selectedTransfer.completed_at && (
                    <span> · Completed on {formatDate(selectedTransfer.completed_at)}</span>
                  )}
                </p>
              </div>

              {/* Status progression indicator */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-600">
                <span className={selectedTransfer.status === 'DRAFT' ? 'font-bold text-slate-900' : 'text-slate-400'}>Draft</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className={selectedTransfer.status === 'SCHEDULED' ? 'font-bold text-amber-700' : selectedTransfer.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-300'}>Scheduled</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className={selectedTransfer.status === 'COMPLETED' ? 'font-bold text-emerald-700' : 'text-slate-300'}>Completed</span>
              </div>
            </div>

            {/* Locations Route */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white rounded-xl border border-slate-200">
              <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Origin (Source)</div>
                <div className="font-semibold text-slate-800 text-sm">{selectedTransfer.source_location_name || `Location #${selectedTransfer.source_location_id}`}</div>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Destination (Target)</div>
                <div className="font-semibold text-slate-800 text-sm">{selectedTransfer.dest_location_name || `Location #${selectedTransfer.dest_location_id}`}</div>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <div className="font-semibold text-slate-800 mb-2">Relocated Items ({selectedTransfer.items.length})</div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Item Name</th>
                      <th className="px-3 py-2.5">SKU</th>
                      <th className="px-3 py-2.5 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransfer.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-medium text-slate-800">{item.product_name}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{item.product_sku}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">{item.quantity} Units</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedTransfer.notes && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-700">Purpose / Notes: </span>
                <span className="text-slate-600">{selectedTransfer.notes}</span>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedTransferId(null)}
                className="px-3.5 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {selectedTransfer.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => {
                        handleCancelTransfer(selectedTransfer.id);
                        setSelectedTransferId(null);
                      }}
                      disabled={processingId === selectedTransfer.id}
                      className="px-3.5 py-2 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-semibold transition-all disabled:opacity-60"
                    >
                      Cancel Transfer
                    </button>
                    <button
                      onClick={async () => {
                        await handleScheduleTransfer(selectedTransfer.id);
                        setSelectedTransferId(null);
                      }}
                      disabled={processingId === selectedTransfer.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{processingId === selectedTransfer.id ? 'Scheduling...' : 'Schedule / Confirm'}</span>
                    </button>
                  </>
                )}

                {selectedTransfer.status === 'SCHEDULED' && (
                  <>
                    <button
                      onClick={() => {
                        handleCancelTransfer(selectedTransfer.id);
                        setSelectedTransferId(null);
                      }}
                      disabled={processingId === selectedTransfer.id}
                      className="px-3.5 py-2 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-semibold transition-all disabled:opacity-60"
                    >
                      Cancel Transfer
                    </button>
                    <button
                      onClick={async () => {
                        await handleCompleteTransfer(selectedTransfer.id);
                        setSelectedTransferId(null);
                      }}
                      disabled={processingId === selectedTransfer.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-all disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{processingId === selectedTransfer.id ? 'Executing...' : 'Execute & Complete'}</span>
                    </button>
                  </>
                )}

                {selectedTransfer.status === 'COMPLETED' && (
                  <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    Transfer is completed & immutable
                  </span>
                )}

                {selectedTransfer.status === 'CANCELLED' && (
                  <span className="text-xs text-rose-700 font-semibold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                    Transfer is cancelled
                  </span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* New Transfer Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Internal Stock Transfer"
        subtitle="Transfer physical inventory between warehouse locations"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Source Location (From) *</label>
              <select
                required
                value={sourceLocId}
                onChange={(e) => setSourceLocId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select Origin Location</option>
                {allLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.warehouse_name} &rarr; {l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Destination Location (To) *</label>
              <select
                required
                value={destLocId}
                onChange={(e) => setDestLocId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select Destination Location</option>
                {allLocations.map((l) => (
                  <option key={l.id} value={l.id} disabled={String(l.id) === sourceLocId}>
                    {l.warehouse_name} &rarr; {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Scheduled Date</label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Initial Status</label>
              <select
                value={createStatus}
                onChange={(e) => setCreateStatus(e.target.value as 'DRAFT' | 'SCHEDULED')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="DRAFT">Draft (Staged for review)</option>
                <option value="SCHEDULED">Scheduled (Ready for transfer execution)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-semibold text-slate-700">Products to Relocate *</label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-brand-600 hover:text-brand-700 font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item Line</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex-1">
                    <select
                      required
                      value={row.product_id}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].product_id = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Select Product SKU</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-28">
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].quantity = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-right font-bold focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Transfer Purpose / Reason</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Balancing stock for assembly requirements"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold shadow-sm transition-all"
            >
              {submitting ? 'Creating...' : createStatus === 'DRAFT' ? 'Save as Draft' : 'Create & Schedule Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
