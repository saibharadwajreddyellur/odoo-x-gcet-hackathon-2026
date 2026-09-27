import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Delivery, Product, Warehouse } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { InfoBanner } from '../../components/common/InfoBanner';
import { KanbanBoardContainer } from '../../components/common/KanbanBoardContainer';
import { PrintDocumentModal } from '../../components/operations/PrintDocumentModal';
import {
  Send, Plus, CheckCircle, PackageCheck, Truck, Trash2, Calendar,
  MapPin, Clock, XCircle, Search, LayoutList, Kanban, ArrowLeft,
  Printer, User as UserIcon, AlertCircle, ChevronRight, Eye
} from 'lucide-react';

export const Deliveries: React.FC = () => {
  const { user, isManager } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  // Dedicated Detail View
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);

  // Print Modal
  const [printDelivery, setPrintDelivery] = useState<Delivery | null>(null);

  // New Delivery Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; location_id: string; quantity: string }>>([
    { product_id: '', location_id: '', quantity: '1' }
  ]);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [delivs, prods, whs] = await Promise.all([
        api.getDeliveries(),
        api.getProducts(),
        api.getWarehouses()
      ]);
      setDeliveries(delivs);
      setProducts(prods);
      setWarehouses(whs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItemRow = () => {
    setItems([...items, { product_id: '', location_id: '', quantity: '1' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) {
      setErrorMsg('Only Inventory Managers can create delivery orders.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.createDelivery({
        customer_name: customerName,
        shipping_address: shippingAddress,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
        responsible_user_id: user?.id,
        notes,
        items: items.map(i => ({
          product_id: Number(i.product_id),
          location_id: Number(i.location_id),
          quantity: Number(i.quantity)
        }))
      });
      setIsModalOpen(false);
      setCustomerName('');
      setShippingAddress('');
      setNotes('');
      setItems([{ product_id: '', location_id: '', quantity: '1' }]);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create delivery');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * DRAFT → check stock:
   *   - All stock available → READY
   *   - Any item short      → WAITING
   */
  const handleCheckAvailability = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.checkDeliveryAvailability(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Availability check failed');
    } finally {
      setProcessingId(null);
    }
  };

  /** WAITING → READY: re-checks that stock is now available */
  const handleMarkReady = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.markDeliveryReady(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Insufficient stock — cannot mark as Ready');
    } finally {
      setProcessingId(null);
    }
  };

  /** READY → DONE: validates and deducts inventory (stock changes exactly once) */
  const handleValidateDelivery = async (id: number) => {
    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.validateDelivery(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Validation failed');
    } finally {
      setProcessingId(null);
    }
  };

  /** Cancel: allowed from DRAFT, WAITING, or READY with confirmation */
  const handleCancelDelivery = async (id: number) => {
    if (!isManager) {
      setErrorMsg('Only Inventory Managers can cancel delivery orders.');
      return;
    }
    const target = deliveries.find(d => d.id === id);
    if (!target) return;
    if (target.status === 'DONE') {
      setErrorMsg('Cannot cancel a completed delivery — stock has already been deducted.');
      return;
    }
    if (target.status === 'CANCELLED') {
      setErrorMsg('Delivery order is already cancelled.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to cancel delivery order ${target.delivery_number}? This cannot be undone.`
    );
    if (!confirmed) return;

    setProcessingId(id);
    setErrorMsg(null);
    try {
      await api.cancelDelivery(id);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel delivery');
    } finally {
      setProcessingId(null);
    }
  };

  const allLocations = warehouses.flatMap(w =>
    w.locations.map(l => ({ ...l, warehouse_name: w.name }))
  );

  // Filter deliveries by search query
  const filteredDeliveries = deliveries.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchNum = d.delivery_number.toLowerCase().includes(q);
    const matchCustomer = d.customer_name.toLowerCase().includes(q);
    const matchResponsible = d.responsible_user_name?.toLowerCase().includes(q) || false;
    const matchAddress = d.shipping_address?.toLowerCase().includes(q) || false;
    const matchNotes = d.notes?.toLowerCase().includes(q) || false;
    const matchItems = d.items?.some(it =>
      it.product_name?.toLowerCase().includes(q) ||
      it.product_sku?.toLowerCase().includes(q) ||
      it.location_name?.toLowerCase().includes(q)
    ) || false;
    return matchNum || matchCustomer || matchResponsible || matchAddress || matchNotes || matchItems;
  });

  const selectedDelivery = selectedDeliveryId ? deliveries.find(d => d.id === selectedDeliveryId) : null;

  const isLate = (deliv: Delivery) => {
    if (!deliv.scheduled_date) return false;
    if (deliv.status === 'DONE' || deliv.status === 'CANCELLED') return false;
    return new Date(deliv.scheduled_date) < new Date();
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
  // DEDICATED DELIVERY DETAIL VIEW
  // ==========================================
  if (selectedDelivery) {
    const late = isLate(selectedDelivery);
    const totalUnits = selectedDelivery.items.reduce((s, it) => s + it.quantity, 0);

    return (
      <div className="space-y-6">
        {/* Navigation & Action Bar */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedDeliveryId(null)}
              className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
              title="Back to Delivery List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-base font-bold text-slate-900">{selectedDelivery.delivery_number}</span>
                <Badge status={selectedDelivery.status} size="md" label={selectedDelivery.status === 'WAITING' ? 'Waiting for Stock' : undefined} />
                {late && (
                  <Badge status="LATE" size="md" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Created on {formatDate(selectedDelivery.created_at)}
                {selectedDelivery.responsible_user_name && (
                  <span> · Handled by <strong className="text-slate-700">{selectedDelivery.responsible_user_name}</strong></span>
                )}
              </p>
            </div>
          </div>

          {/* Workflow Status Progression & Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status progression indicator */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600">
              <span className={selectedDelivery.status === 'DRAFT' ? 'font-bold text-slate-900' : 'text-slate-400'}>Draft</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={selectedDelivery.status === 'WAITING' ? 'font-bold text-amber-700' : selectedDelivery.status === 'READY' || selectedDelivery.status === 'DONE' ? 'text-slate-400' : 'text-slate-300'}>Waiting</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={selectedDelivery.status === 'READY' ? 'font-bold text-blue-700' : selectedDelivery.status === 'DONE' ? 'text-slate-500' : 'text-slate-300'}>Ready</span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={selectedDelivery.status === 'DONE' ? 'font-bold text-emerald-700' : 'text-slate-300'}>Done</span>
            </div>

            {/* Action buttons matching status */}
            {selectedDelivery.status === 'DRAFT' && (
              <>
                {isManager && (
                  <button
                    onClick={() => handleCancelDelivery(selectedDelivery.id)}
                    disabled={processingId === selectedDelivery.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 shadow-xs"
                  >
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Cancel Delivery</span>
                  </button>
                )}
                <button
                  onClick={() => handleCheckAvailability(selectedDelivery.id)}
                  disabled={processingId === selectedDelivery.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>{processingId === selectedDelivery.id ? 'Checking...' : 'Check Availability'}</span>
                </button>
              </>
            )}

            {selectedDelivery.status === 'WAITING' && (
              <>
                {isManager && (
                  <button
                    onClick={() => handleCancelDelivery(selectedDelivery.id)}
                    disabled={processingId === selectedDelivery.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Cancel Delivery</span>
                  </button>
                )}
                <button
                  onClick={() => handleMarkReady(selectedDelivery.id)}
                  disabled={processingId === selectedDelivery.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>{processingId === selectedDelivery.id ? 'Rechecking...' : 'Recheck Stock & Mark Ready'}</span>
                </button>
              </>
            )}

            {selectedDelivery.status === 'READY' && (
              <>
                {isManager && (
                  <button
                    onClick={() => handleCancelDelivery(selectedDelivery.id)}
                    disabled={processingId === selectedDelivery.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Cancel Delivery</span>
                  </button>
                )}
                <button
                  onClick={() => handleValidateDelivery(selectedDelivery.id)}
                  disabled={processingId === selectedDelivery.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{processingId === selectedDelivery.id ? 'Validating...' : 'Validate & Dispatch'}</span>
                </button>
              </>
            )}

            {selectedDelivery.status === 'DONE' && (
              <button
                onClick={() => setPrintDelivery(selectedDelivery)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-md text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Delivery Slip</span>
              </button>
            )}

            {selectedDelivery.status === 'CANCELLED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-md text-xs font-medium border border-rose-200">
                <XCircle className="w-3.5 h-3.5" />
                <span>Delivery Order Cancelled</span>
              </span>
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
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Customer / Consignee</span>
            <span className="text-sm font-semibold text-slate-900">{selectedDelivery.customer_name}</span>
            {selectedDelivery.shipping_address && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">{selectedDelivery.shipping_address}</span>
              </div>
            )}
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Scheduled Date</span>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className={`text-sm font-semibold ${late ? 'text-rose-600' : 'text-slate-800'}`}>
                {formatDate(selectedDelivery.scheduled_date)}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Responsible Staff</span>
            <div className="flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm font-semibold text-slate-800">
                {selectedDelivery.responsible_user_name || user?.full_name || 'Alex Morgan'}
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Delivery Status / Validation</span>
            <span className="text-xs text-slate-700 block">
              Logged: {formatDate(selectedDelivery.delivery_date)}
            </span>
            {selectedDelivery.validated_at && (
              <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
                Dispatched: {formatDate(selectedDelivery.validated_at)}
              </span>
            )}
          </div>
        </div>

        {selectedDelivery.notes && (
          <div className="bg-slate-100 border border-slate-200 p-3 rounded-lg text-xs text-slate-700">
            <strong>Notes / Dispatch Instructions:</strong> {selectedDelivery.notes}
          </div>
        )}

        {/* Product Line Items */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Items to Deliver ({selectedDelivery.items.length})</h3>
            <span className="text-xs font-medium text-slate-500">Total Units: <strong className="text-slate-800">{totalUnits}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">#</th>
                  <th className="py-2.5 px-4">Product / Item</th>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Storage / Pick Location</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                  <th className="py-2.5 px-4 text-center">Stock Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {selectedDelivery.items.map((item, idx) => {
                  const prod = products.find(p => p.id === item.product_id);
                  const inStock = prod ? prod.total_stock >= item.quantity : true;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{item.product_name}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px]">{item.product_sku}</td>
                      <td className="py-2.5 px-4 text-slate-600">{item.location_name || 'Designated Warehouse Location'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">-{item.quantity}</td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex justify-center">
                          {selectedDelivery.status === 'DONE' ? (
                            <Badge status="DISPATCHED" />
                          ) : inStock ? (
                            <Badge status="IN_STOCK" label="Available" />
                          ) : (
                            <Badge status="LOW_STOCK" label="Insufficient" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/80 font-semibold border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="py-2.5 px-4 text-right uppercase text-[10px] text-slate-500 font-medium">Total Units to Dispatch:</td>
                  <td className="py-2.5 px-4 text-right text-slate-900 font-bold">{totalUnits} units</td>
                  <td className="py-3 px-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Print Modal */}
        <PrintDocumentModal
          isOpen={!!printDelivery}
          onClose={() => setPrintDelivery(null)}
          document={printDelivery}
          type="delivery"
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
          icon={Send}
          title="Warehouse Fulfillment Operations"
          description="Warehouse Staff check stock, pick items, pack shipments, and validate dispatches. Delivery order generation and cancellation are managed by Inventory Managers."
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Outgoing Deliveries (Fulfillment)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Process outbound customer orders.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Delivery Order</span>
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
            placeholder="Search deliveries by reference, customer, address, item..."
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

      {/* Main Content: List vs Kanban */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
          Loading deliveries...
        </div>
      ) : filteredDeliveries.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
          {searchQuery ? 'No deliveries match your search query.' : 'No delivery orders recorded yet. Click "New Delivery Order" to create one.'}
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Delivery Ref</th>
                  <th className="py-2.5 px-3">Customer / Destination</th>
                  <th className="py-2.5 px-3">Scheduled Date</th>
                  <th className="py-2.5 px-3">Responsible</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-3.5 px-3 text-right">Items / Qty</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDeliveries.map((deliv) => {
                  const late = isLate(deliv);
                  const totalUnits = deliv.items.reduce((s, it) => s + it.quantity, 0);

                  return (
                    <tr key={deliv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setSelectedDeliveryId(deliv.id)}
                          className="hover:text-brand-600 hover:underline text-left inline-flex items-center gap-1.5"
                        >
                          <span>{deliv.delivery_number}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-slate-800">
                        <div>{deliv.customer_name}</div>
                        {deliv.shipping_address && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{deliv.shipping_address}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(deliv.scheduled_date)}</span>
                          {late && <Badge status="LATE" />}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {deliv.responsible_user_name || 'Staff'}
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge status={deliv.status} />
                      </td>
                      <td className="py-3.5 px-3 text-right font-medium text-slate-900">
                        <span>{totalUnits}</span>
                        <span className="text-slate-400 text-[10px] ml-1">({deliv.items.length} {deliv.items.length === 1 ? 'item' : 'items'})</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isManager && deliv.status !== 'DONE' && deliv.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancelDelivery(deliv.id)}
                              disabled={processingId === deliv.id}
                              className="px-2.5 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded text-[11px] font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-1"
                              title="Cancel Delivery Order"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Cancel</span>
                            </button>
                          )}
                          {deliv.status === 'DRAFT' && (
                            <button
                              onClick={() => handleCheckAvailability(deliv.id)}
                              disabled={processingId === deliv.id}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                            >
                              Check Stock
                            </button>
                          )}
                          {deliv.status === 'WAITING' && (
                            <button
                              onClick={() => handleMarkReady(deliv.id)}
                              disabled={processingId === deliv.id}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                            >
                              Mark Ready
                            </button>
                          )}
                          {deliv.status === 'READY' && (
                            <button
                              onClick={() => handleValidateDelivery(deliv.id)}
                              disabled={processingId === deliv.id}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                            >
                              Validate
                            </button>
                          )}
                          {deliv.status === 'DONE' && (
                            <button
                              onClick={() => setPrintDelivery(deliv)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedDeliveryId(deliv.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
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
        <KanbanBoardContainer>
          <div className="flex gap-4 items-start min-w-max px-2 sm:px-4">
            {(['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELLED'] as const).map((colStatus) => {
              const colDeliveries = filteredDeliveries.filter(d => d.status === colStatus);
              const colLabels = {
                DRAFT: 'Draft',
                WAITING: 'Waiting Stock',
                READY: 'Ready to Deliver',
                DONE: 'Delivered (Done)',
                CANCELLED: 'Canceled'
              };

              return (
                <div
                  key={colStatus}
                  className="w-[280px] min-w-[280px] shrink-0 bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 flex flex-col space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                        {colLabels[colStatus]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-[3px] text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 leading-none">
                        {colDeliveries.length}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {colDeliveries.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-slate-400 italic">
                        No {colLabels[colStatus].toLowerCase()} orders
                      </div>
                    ) : (
                      colDeliveries.map((deliv) => {
                        const late = isLate(deliv);
                        const totalUnits = deliv.items.reduce((s, it) => s + it.quantity, 0);

                        return (
                          <div
                            key={deliv.id}
                            className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs hover:shadow-sm transition-shadow space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <button
                                onClick={() => setSelectedDeliveryId(deliv.id)}
                                className="font-mono text-xs font-bold text-slate-900 hover:text-brand-600 hover:underline text-left"
                              >
                                {deliv.delivery_number}
                              </button>
                              <Badge status={deliv.status} />
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Customer</span>
                              <span className="text-xs font-bold text-slate-800 line-clamp-1">{deliv.customer_name}</span>
                            </div>

                            <div className="text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-100">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{formatDate(deliv.scheduled_date)}</span>
                                </span>
                                {late && <Badge status="LATE" />}
                              </div>
                              <div className="flex items-center justify-between text-slate-600">
                                <span className="truncate max-w-[130px]" title={deliv.responsible_user_name || 'Staff'}>
                                  Resp: {deliv.responsible_user_name || 'Staff'}
                                </span>
                                <strong className="text-slate-900 shrink-0">{totalUnits} units</strong>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                              <button
                                onClick={() => setSelectedDeliveryId(deliv.id)}
                                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Details</span>
                              </button>

                              <div className="flex items-center gap-1.5">
                                {isManager && deliv.status !== 'DONE' && deliv.status !== 'CANCELLED' && (
                                  <button
                                    onClick={() => handleCancelDelivery(deliv.id)}
                                    disabled={processingId === deliv.id}
                                    className="px-2.5 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded text-[11px] font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-1"
                                    title="Cancel Delivery Order"
                                  >
                                    <XCircle className="w-3 h-3 text-rose-600" />
                                    <span>Cancel</span>
                                  </button>
                                )}

                                {deliv.status === 'DRAFT' && (
                                  <button
                                    onClick={() => handleCheckAvailability(deliv.id)}
                                    disabled={processingId === deliv.id}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                                  >
                                    Check
                                  </button>
                                )}

                                {deliv.status === 'WAITING' && (
                                  <button
                                    onClick={() => handleMarkReady(deliv.id)}
                                    disabled={processingId === deliv.id}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                                  >
                                    Ready
                                  </button>
                                )}

                                {deliv.status === 'READY' && (
                                  <button
                                    onClick={() => handleValidateDelivery(deliv.id)}
                                    disabled={processingId === deliv.id}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-all disabled:opacity-60"
                                  >
                                    Validate
                                  </button>
                                )}

                                {deliv.status === 'DONE' && (
                                  <button
                                    onClick={() => setPrintDelivery(deliv)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium transition-all inline-flex items-center gap-1"
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

      {/* New Delivery Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Outgoing Delivery Order"
        subtitle="Specify customer, scheduled date, and line items to dispatch"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateDelivery} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer / Consignee *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Apex Retailers Corp"
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
              <label className="block font-semibold text-slate-700 mb-1">Responsible Staff</label>
              <input
                type="text"
                disabled
                value={user?.full_name || 'Alex Morgan (Admin)'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shipping Address</label>
              <input
                type="text"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="e.g. 742 Evergreen Terrace, Springfield"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Dispatch Notes / Reference</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Fragile glass packing / Urgent delivery"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-semibold text-slate-700">Delivery Line Items *</label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"
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
                        setItems(newItems);
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                    >
                      <option value="">Select Product *</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) — Stock: {p.total_stock}
                        </option>
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
                      <option value="">Storage / Pick Location *</option>
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

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
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
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold shadow-sm disabled:opacity-60"
            >
              {submitting ? 'Creating Order...' : 'Save Draft Delivery'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Print Modal */}
      <PrintDocumentModal
        isOpen={!!printDelivery}
        onClose={() => setPrintDelivery(null)}
        document={printDelivery}
        type="delivery"
      />
    </div>
  );
};
