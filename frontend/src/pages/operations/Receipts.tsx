import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Receipt, Product, Warehouse } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { InfoBanner } from '../../components/common/InfoBanner';
import { KanbanBoardContainer } from '../../components/common/KanbanBoardContainer';
import { PrintDocumentModal } from '../../components/operations/PrintDocumentModal';
import {
  Truck, Plus, CheckCircle2, Calendar, FileText, Trash2, XCircle,
  PackageCheck, Search, LayoutList, Kanban, ArrowLeft, Printer,
  Clock, User as UserIcon, Building2, ChevronRight, Eye, Pencil
} from 'lucide-react';

interface ReceiptsProps {
  initialProductToReceive?: Product | null;
}

export const Receipts: React.FC<ReceiptsProps> = ({ initialProductToReceive }) => {
  const { user, isManager } = useAuth();
  const hasHandledInitialProduct = useRef(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  // Dedicated Detail View
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null);

  // Print Modal
  const [printReceipt, setPrintReceipt] = useState<Receipt | null>(null);

  // Receipt Modal State (Create & Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; location_id: string; quantity: string; unit_cost: string }>>([
    { product_id: '', location_id: '', quantity: '50', unit_cost: '0' }
  ]);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recs, prods, whs] = await Promise.all([
        api.getReceipts(),
        api.getProducts(),
        api.getWarehouses()
      ]);
      setReceipts(recs);
      setProducts(prods);
      setWarehouses(whs);

      // If opened with preselected product from low stock table (only once)
      if (initialProductToReceive && !hasHandledInitialProduct.current) {
        hasHandledInitialProduct.current = true;
        setEditingReceipt(null);
        setIsModalOpen(true);
        setItems([{
          product_id: String(initialProductToReceive.id),
          location_id: String(whs[0]?.locations[0]?.id || ''),
          quantity: String(initialProductToReceive.reorder_quantity || 50),
          unit_cost: String(initialProductToReceive.unit_price || 0)
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItemRow = () => {
    setItems([...items, { product_id: '', location_id: '', quantity: '10', unit_cost: '0' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleOpenCreateReceipt = () => {
    if (!isManager) {
      setErrorMsg('Only Inventory Managers can create procurement receipts.');
      return;
    }
    setEditingReceipt(null);
    setSupplierName('');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setScheduledDate(now.toISOString().slice(0, 16));
    setNotes('');
    setItems([{ product_id: '', location_id: '', quantity: '50', unit_cost: '0' }]);
    setIsModalOpen(true);
  };

  const handleOpenEditReceipt = (rec: Receipt) => {
    if (!isManager) {
      setErrorMsg('Only Inventory Managers can edit procurement receipt details.');
      return;
    }
    if (rec.status !== 'DRAFT') {
      setErrorMsg('Only Draft receipts can be edited.');
      return;
    }
    setEditingReceipt(rec);
    setSupplierName(rec.supplier_name);
    if (rec.scheduled_date) {
      try {
        const d = new Date(rec.scheduled_date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        setScheduledDate(d.toISOString().slice(0, 16));
      } catch {
        setScheduledDate('');
      }
    } else {
      setScheduledDate('');
    }
    setNotes(rec.notes || '');
    if (rec.items && rec.items.length > 0) {
      setItems(rec.items.map(it => ({
        product_id: String(it.product_id),
        location_id: String(it.location_id),
        quantity: String(it.quantity),
        unit_cost: String(it.unit_cost || 0)
      })));
    } else {
      setItems([{ product_id: '', location_id: '', quantity: '50', unit_cost: '0' }]);
    }
    setIsModalOpen(true);
  };

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        supplier_name: supplierName,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
        responsible_user_id: user?.id,
        notes,
        items: items.map(i => ({
          product_id: Number(i.product_id),
          location_id: Number(i.location_id),
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost)
        }))
      };

      if (editingReceipt) {
        await api.updateReceipt(editingReceipt.id, payload);
      } else {
        await api.createReceipt(payload);
      }
      setIsModalOpen(false);
      setEditingReceipt(null);
      setSupplierName('');
      setNotes('');
      setItems([{ product_id: '', location_id: '', quantity: '50', unit_cost: '0' }]);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || (editingReceipt ? 'Failed to update receipt' : 'Failed to create receipt'));
    } finally {
      setSubmitting(false);
    }
  };

  /** READY → DONE: validates receipt and credits stock to inventory */
  const handleValidateReceipt = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.validateReceipt(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Validation failed');
    } finally {
      setProcessingId(null);
    }
  };

  /** Cancel: allowed from DRAFT or READY, no stock rollback needed */
  const handleCancelReceipt = async (id: number) => {
    if (!isManager) {
      setErrorMsg('Only Inventory Managers can cancel receipts.');
      return;
    }
    if (!window.confirm('Cancel this receipt? This cannot be undone.')) return;
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.cancelReceipt(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel receipt');
    } finally {
      setProcessingId(null);
    }
  };

  const allLocations = warehouses.flatMap(w =>
    w.locations.map(l => ({ ...l, warehouse_name: w.name }))
  );

  // Filter receipts by search query
  const filteredReceipts = receipts.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchNum = r.receipt_number.toLowerCase().includes(q);
    const matchSupplier = r.supplier_name.toLowerCase().includes(q);
    const matchResponsible = r.responsible_user_name?.toLowerCase().includes(q) || false;
    const matchNotes = r.notes?.toLowerCase().includes(q) || false;
    const matchItems = r.items?.some(it =>
      it.product_name?.toLowerCase().includes(q) ||
      it.product_sku?.toLowerCase().includes(q) ||
      it.location_name?.toLowerCase().includes(q)
    ) || false;
    return matchNum || matchSupplier || matchResponsible || matchNotes || matchItems;
  });

  const selectedReceipt = selectedReceiptId ? receipts.find(r => r.id === selectedReceiptId) : null;

  const isLate = (rec: Receipt) => {
    if (!rec.scheduled_date) return false;
    if (rec.status === 'DONE' || rec.status === 'CANCELLED') return false;
    return new Date(rec.scheduled_date) < new Date();
  };

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

  // ==========================================
  // DEDICATED RECEIPT DETAIL VIEW
  // ==========================================
  if (selectedReceipt) {
    const late = isLate(selectedReceipt);
    const totalQty = selectedReceipt.items.reduce((s, it) => s + it.quantity, 0);
    const totalCost = selectedReceipt.items.reduce((s, it) => s + (it.quantity * Number(it.unit_cost || 0)), 0);

    return (
      <div className="space-y-6">
        {/* Navigation & Action Bar */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReceiptId(null)}
              className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
              title="Back to Receipt List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-base font-bold text-slate-900">{selectedReceipt.receipt_number}</span>
                <Badge status={selectedReceipt.status} size="md" />
                {late && (
                  <Badge status="LATE" size="md" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Created on {formatDate(selectedReceipt.created_at)}
                {selectedReceipt.responsible_user_name && (
                  <span> · Handled by <strong className="text-slate-700">{selectedReceipt.responsible_user_name}</strong></span>
                )}
              </p>
            </div>
          </div>

          {/* Workflow Status Progression & Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status progression indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600">
              <span className={selectedReceipt.status === 'DRAFT' ? 'font-bold text-slate-900' : 'text-slate-400'}>Draft</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={selectedReceipt.status === 'DONE' ? 'font-bold text-emerald-700' : 'text-slate-300'}>Received (Done)</span>
            </div>

            {/* Action buttons matching status */}
            {selectedReceipt.status === 'DRAFT' && (
              <>
                {isManager && (
                  <button
                    onClick={() => handleOpenEditReceipt(selectedReceipt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Receipt</span>
                  </button>
                )}
                <button
                  onClick={() => handleValidateReceipt(selectedReceipt.id)}
                  disabled={processingId === selectedReceipt.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{processingId === selectedReceipt.id ? 'Updating Stock...' : 'Receive & Validate'}</span>
                </button>
                {isManager && (
                  <button
                    onClick={() => handleCancelReceipt(selectedReceipt.id)}
                    disabled={processingId === selectedReceipt.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel Receipt</span>
                  </button>
                )}
              </>
            )}

            {selectedReceipt.status === 'READY' && (
              <>
                <button
                  onClick={() => handleValidateReceipt(selectedReceipt.id)}
                  disabled={processingId === selectedReceipt.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{processingId === selectedReceipt.id ? 'Updating Stock...' : 'Receive & Validate'}</span>
                </button>
                {isManager && (
                  <button
                    onClick={() => handleCancelReceipt(selectedReceipt.id)}
                    disabled={processingId === selectedReceipt.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel Receipt</span>
                  </button>
                )}
              </>
            )}

            {selectedReceipt.status === 'DONE' && (
              <button
                onClick={() => setPrintReceipt(selectedReceipt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Goods Receipt</span>
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-auto text-rose-400 hover:text-rose-600">✕</button>
          </div>
        )}

        {/* Metadata Details Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Receive From (Supplier)</span>
            <span className="text-sm font-semibold text-slate-900">{selectedReceipt.supplier_name}</span>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Scheduled Date</span>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className={`text-sm font-semibold ${late ? 'text-rose-600' : 'text-slate-800'}`}>
                {formatDate(selectedReceipt.scheduled_date)}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Responsible User</span>
            <div className="flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-800">
                {selectedReceipt.responsible_user_name || user?.full_name || 'Alex Morgan'}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Receipt Date / Validation</span>
            <span className="text-xs text-slate-700 block">
              Logged: {formatDate(selectedReceipt.receipt_date)}
            </span>
            {selectedReceipt.validated_at && (
              <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
                Validated: {formatDate(selectedReceipt.validated_at)}
              </span>
            )}
          </div>
        </div>

        {selectedReceipt.notes && (
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs text-slate-700">
            <strong className="font-semibold text-slate-800">Notes / Order Reference:</strong> <span className="text-slate-600">{selectedReceipt.notes}</span>
          </div>
        )}

        {/* Product Line Items */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Received Line Items ({selectedReceipt.items.length})</h3>
            <span className="text-xs font-medium text-slate-500">Total Units: <strong className="text-slate-800">{totalQty}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Product / Item</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Target Storage Location</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {selectedReceipt.items.map((item, idx) => {
                  const subtotal = item.quantity * Number(item.unit_cost || 0);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{item.product_name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px]">{item.product_sku}</td>
                      <td className="py-2.5 px-4 text-slate-600">{item.location_name || 'Designated Warehouse Location'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">+{item.quantity}</td>
                      <td className="py-2.5 px-4 text-right text-slate-600">₹{Number(item.unit_cost || 0).toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-slate-900">₹{subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/80 font-semibold border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="py-2.5 px-4 text-right uppercase text-[10px] text-slate-500 font-medium">Totals:</td>
                  <td className="py-2.5 px-4 text-right text-slate-900 font-bold">{totalQty} units</td>
                  <td className="py-2.5 px-4"></td>
                  <td className="py-2.5 px-4 text-right text-brand-700 text-xs font-bold">₹{totalCost.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Print Modal */}
        <PrintDocumentModal
          isOpen={!!printReceipt}
          onClose={() => setPrintReceipt(null)}
          document={printReceipt}
          type="receipt"
        />
      </div>
    );
  }

  // ==========================================
  // LIST / KANBAN VIEW
  // ==========================================
  return (
    <div className="space-y-6">
      {/* RBAC Notice for non-managers */}
      {!isManager && (
        <InfoBanner
          icon={Truck}
          title="Warehouse Receiving Floor"
          description="Warehouse Staff verify physical deliveries and receive goods into stock. Purchase order creation, pricing, and supplier contract details are managed by Inventory Managers."
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Inbound Receipts (Procurement)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log shipments from suppliers.
          </p>
        </div>
        {isManager && (
          <button
            onClick={handleOpenCreateReceipt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-md shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Inbound Receipt</span>
          </button>
        )}
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      {/* Search Bar & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search receipts by reference, supplier, contact, item..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-slate-800 transition-colors"
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
          <span className="text-xs text-slate-500 font-medium">View:</span>
          <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: List vs Kanban */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
          Loading receipts...
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
          {searchQuery ? 'No receipts match your search query.' : 'No receipts recorded yet. Click "New Inbound Receipt" to create one.'}
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Receipt Ref</th>
                  <th className="py-2.5 px-3">Receive From (Supplier)</th>
                  <th className="py-2.5 px-3">Scheduled Date</th>
                  <th className="py-2.5 px-3">Responsible</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Items / Qty</th>
                  <th className="py-2.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredReceipts.map((rec) => {
                  const late = isLate(rec);
                  const totalUnits = rec.items.reduce((s, it) => s + it.quantity, 0);

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setSelectedReceiptId(rec.id)}
                          className="hover:text-brand-600 hover:underline text-left inline-flex items-center gap-1.5"
                        >
                          <span>{rec.receipt_number}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-800">
                        {rec.supplier_name}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(rec.scheduled_date)}</span>
                          {late && <Badge status="LATE" />}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {rec.responsible_user_name || 'Staff'}
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge status={rec.status} />
                      </td>
                      <td className="py-3.5 px-3 text-right font-medium text-slate-900">
                        <span>{totalUnits}</span>
                        <span className="text-slate-400 text-[10px] ml-1">({rec.items.length} {rec.items.length === 1 ? 'item' : 'items'})</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {rec.status === 'DRAFT' && (
                            <>
                              {isManager && (
                                <button
                                  onClick={() => handleOpenEditReceipt(rec)}
                                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1 cursor-pointer"
                                  title="Edit Draft Receipt"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleValidateReceipt(rec.id)}
                                disabled={processingId === rec.id}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-1 cursor-pointer"
                                title="Validate and receive goods into inventory"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{processingId === rec.id ? 'Receiving...' : 'Receive'}</span>
                              </button>
                            </>
                          )}
                          {rec.status === 'READY' && (
                            <button
                              onClick={() => handleValidateReceipt(rec.id)}
                              disabled={processingId === rec.id}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{processingId === rec.id ? 'Receiving...' : 'Receive'}</span>
                            </button>
                          )}
                          {rec.status === 'DONE' && (
                            <button
                              onClick={() => setPrintReceipt(rec)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1 cursor-pointer"
                              title="Print Goods Receipt"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedReceiptId(rec.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* KANBAN VIEW */
        <KanbanBoardContainer className="w-full">
          <div className="grid grid-cols-3 gap-4 lg:gap-5 w-full min-w-[860px] items-start px-0.5 sm:px-1">
            {(['DRAFT', 'DONE', 'CANCELLED'] as const).map((colStatus) => {
              const colReceipts = filteredReceipts.filter(r => r.status === colStatus);
              const colLabels = {
                DRAFT: 'Draft',
                DONE: 'Received (Done)',
                CANCELLED: 'Canceled'
              };
              const colUnits = colReceipts.reduce((sum, r) => sum + r.items.reduce((s, it) => s + it.quantity, 0), 0);

              return (
                <div key={colStatus} className="w-full bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 sm:p-4 flex flex-col space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        {colLabels[colStatus]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 leading-none">
                        {colReceipts.length}
                      </span>
                    </div>
                    {colReceipts.length > 0 && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        {colUnits} {colUnits === 1 ? 'unit' : 'units'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[140px] pr-0.5">
                    {colReceipts.length === 0 ? (
                      <div className="py-8 px-4 text-center text-xs text-slate-400 italic bg-white/60 rounded-lg border border-dashed border-slate-200">
                        No {colLabels[colStatus].toLowerCase()} receipts
                      </div>
                    ) : (
                      colReceipts.map((rec) => {
                        const late = isLate(rec);
                        const totalUnits = rec.items.reduce((s, it) => s + it.quantity, 0);

                        return (
                          <div
                            key={rec.id}
                            className="bg-white rounded-xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs hover:shadow-sm transition-all space-y-3"
                          >
                            {/* Top row: Reference + Late Tag + Status Badge */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={() => setSelectedReceiptId(rec.id)}
                                  className="font-mono text-xs font-bold text-slate-900 hover:text-brand-600 hover:underline text-left truncate cursor-pointer"
                                  title={rec.receipt_number}
                                >
                                  {rec.receipt_number}
                                </button>
                                {late && <Badge status="LATE" />}
                              </div>
                              <div className="shrink-0">
                                <Badge status={rec.status} />
                              </div>
                            </div>

                            {/* Supplier & Optional Notes/Ref */}
                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block tracking-wider">Supplier</span>
                                <span className="text-xs font-bold text-slate-800 truncate block" title={rec.supplier_name}>
                                  {rec.supplier_name}
                                </span>
                              </div>
                              {rec.notes && (
                                <div className="text-[11px] text-slate-500 truncate max-w-[200px] italic" title={rec.notes}>
                                  {rec.notes}
                                </div>
                              )}
                            </div>

                            {/* Details Row: Scheduled Date, Responsible User, Units Count */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate" title={`Scheduled: ${formatDate(rec.scheduled_date)}`}>
                                  {formatDate(rec.scheduled_date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate" title={`Responsible: ${rec.responsible_user_name || 'Staff'}`}>
                                  {rec.responsible_user_name || 'Staff'}
                                </span>
                              </div>
                              <div className="flex items-center justify-start sm:justify-end gap-1 col-span-2 sm:col-span-1">
                                <span className="font-semibold text-slate-900">{totalUnits} units</span>
                                <span className="text-[10px] text-slate-400">({rec.items.length} {rec.items.length === 1 ? 'sku' : 'skus'})</span>
                              </div>
                            </div>

                            {/* Card Actions Row */}
                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                              <button
                                onClick={() => setSelectedReceiptId(rec.id)}
                                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Details</span>
                              </button>

                              <div className="flex items-center gap-1.5">
                                {rec.status === 'DRAFT' && (
                                  <>
                                    {isManager && (
                                      <button
                                        onClick={() => handleOpenEditReceipt(rec)}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleValidateReceipt(rec.id)}
                                      disabled={processingId === rec.id}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Receive</span>
                                    </button>
                                  </>
                                )}

                                {rec.status === 'DONE' && (
                                  <button
                                    onClick={() => setPrintReceipt(rec)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Printer className="w-3 h-3" />
                                    <span>Print</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </KanbanBoardContainer>
      )}

      {/* Receipt Modal (Create & Edit) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReceipt(null);
        }}
        title={editingReceipt ? `Edit Receipt (${editingReceipt.receipt_number})` : 'Create Inbound Receipt'}
        subtitle={
          editingReceipt
            ? 'Update supplier, scheduled date, notes or product quantities before receiving.'
            : 'Specify vendor and items to be received into warehouse locations'
        }
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveReceipt} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Name *</label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Acme Industrial Corp"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Scheduled Date *</label>
              <input
                type="datetime-local"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-700"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Responsible User</label>
              <input
                type="text"
                disabled
                value={user?.full_name || 'Alex Morgan (Admin)'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Receipt Notes / Tracking Reference</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. PO-84920 / High priority restock"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-semibold text-slate-700">Receipt Line Items *</label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item Line</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((row, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200/80">
                  <div className="flex-1 w-full sm:w-auto">
                    <select
                      required
                      value={row.product_id}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].product_id = e.target.value;
                        const prod = products.find(p => p.id === Number(e.target.value));
                        if (prod) newItems[idx].unit_cost = String(prod.unit_price || 0);
                        setItems(newItems);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                    >
                      <option value="">Select Product *</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 w-full sm:w-auto">
                    <select
                      required
                      value={row.location_id}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].location_id = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                    >
                      <option value="">Target Storage Location *</option>
                      {allLocations.map(l => (
                        <option key={l.id} value={l.id}>{l.warehouse_name} → {l.name} ({l.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      required
                      value={row.quantity}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].quantity = e.target.value;
                        setItems(newItems);
                      }}
                      placeholder="Qty"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-right"
                    />
                  </div>

                  <div className="w-24">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.unit_cost}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].unit_cost = e.target.value;
                        setItems(newItems);
                      }}
                      placeholder="Cost ₹"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-right"
                    />
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setEditingReceipt(null);
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {submitting
                ? editingReceipt
                  ? 'Saving Changes...'
                  : 'Creating Receipt...'
                : editingReceipt
                ? 'Save Changes'
                : 'Save Draft Receipt'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Print Modal */}
      <PrintDocumentModal
        isOpen={!!printReceipt}
        onClose={() => setPrintReceipt(null)}
        document={printReceipt}
        type="receipt"
      />
    </div>
  );
};
