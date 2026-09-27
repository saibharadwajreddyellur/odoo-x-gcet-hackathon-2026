import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, Warehouse, Category, StockAdjustment } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { InfoBanner } from '../../components/common/InfoBanner';
import {
  Boxes, Search, Filter, SlidersHorizontal, RefreshCw,
  ArrowUpDown, AlertTriangle, CheckCircle, MapPin, Tag,
  IndianRupee, PackageCheck, ShieldAlert, Plus, Sparkles
} from 'lucide-react';
import { NavTab } from '../../components/common/Sidebar';
import { calculateStockAlerts, useStockAlerts } from '../../context/StockAlertContext';

interface StockRow {
  key: string;
  productId: number;
  productName: string;
  sku: string;
  categoryName: string;
  unitPrice: number;
  locationId?: number;
  locationName: string;
  locationCode?: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  freeToUse: number;
  uom: string;
  minStockAlert: number;
  stockStatus: string;
}

export type StockStatusFilter = 'ALL' | 'ATTENTION' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'IN_STOCK' | 'RESERVED';

interface StockViewProps {
  onNavigateTab?: (tab: NavTab) => void;
  externalSearchTerm?: string;
  onSearchChange?: (term: string) => void;
  initialStatusFilter?: StockStatusFilter;
  onStatusFilterChange?: (filter: StockStatusFilter) => void;
}

export const StockView: React.FC<StockViewProps> = ({
  onNavigateTab,
  externalSearchTerm,
  onSearchChange,
  initialStatusFilter,
  onStatusFilterChange
}) => {
  const { refreshStockAlerts } = useStockAlerts();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState(externalSearchTerm || '');

  useEffect(() => {
    if (externalSearchTerm !== undefined) {
      setSearchTerm(externalSearchTerm);
    }
  }, [externalSearchTerm]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilterState] = useState<StockStatusFilter>(
    initialStatusFilter || 'ALL'
  );

  const setStatusFilter = (val: StockStatusFilter) => {
    setStatusFilterState(val);
    onStatusFilterChange?.(val);
  };

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilterState(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const [sortBy, setSortBy] = useState<'name' | 'onHand' | 'freeToUse' | 'cost'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [currentRecordedQty, setCurrentRecordedQty] = useState<number>(0);
  const [countedQty, setCountedQty] = useState<string>('0');
  const [reason, setReason] = useState<string>('Routine Physical Audit');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);
  const [adjustmentFeedback, setAdjustmentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Fetch initial data
  const loadData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const [prods, whs, cats] = await Promise.all([
        api.getProducts(),
        api.getWarehouses(),
        api.getCategories()
      ]);
      setProducts(prods);
      setWarehouses(whs);
      setCategories(cats);
    } catch (err: any) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Flattened locations for dropdowns
  const allLocations = useMemo(() => {
    return warehouses.flatMap(w =>
      (w.locations || []).map(l => ({
        ...l,
        warehouse_name: w.name,
        displayLabel: `${w.name} → ${l.name} (${l.code})`
      }))
    );
  }, [warehouses]);

  // Build stock rows (one per product-location combination)
  const stockRows = useMemo(() => {
    const rows: StockRow[] = [];

    products.forEach((p) => {
      if (p.stock_levels && p.stock_levels.length > 0) {
        p.stock_levels.forEach((sl) => {
          const onHand = Number(sl.quantity_on_hand) || 0;
          const reserved = Number(sl.reserved_quantity) || 0;
          const freeToUse = Math.max(0, onHand - reserved);

          let rowStatus = 'IN_STOCK';
          if (onHand === 0) rowStatus = 'OUT_OF_STOCK';
          else if (onHand <= p.min_stock_alert) rowStatus = 'LOW_STOCK';

          rows.push({
            key: `${p.id}-${sl.location_id}`,
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            categoryName: p.category_name || 'Uncategorized',
            unitPrice: Number(p.unit_price) || 0,
            locationId: sl.location_id,
            locationName: sl.location_name || 'Standard Location',
            locationCode: sl.location_code || '',
            warehouseName: sl.warehouse_name || 'Main Warehouse',
            onHand,
            reserved,
            freeToUse,
            uom: p.uom || 'Units',
            minStockAlert: p.min_stock_alert,
            stockStatus: rowStatus
          });
        });
      } else {
        // Product has no assigned stock level
        const onHand = Number(p.total_stock) || 0;
        const reserved = 0;
        const freeToUse = onHand;

        rows.push({
          key: `${p.id}-unassigned`,
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          categoryName: p.category_name || 'Uncategorized',
          unitPrice: Number(p.unit_price) || 0,
          locationId: undefined,
          locationName: 'Unassigned Location',
          locationCode: 'NONE',
          warehouseName: 'Unassigned',
          onHand,
          reserved,
          freeToUse,
          uom: p.uom || 'Units',
          minStockAlert: p.min_stock_alert,
          stockStatus: onHand === 0 ? 'OUT_OF_STOCK' : (onHand <= p.min_stock_alert ? 'LOW_STOCK' : 'IN_STOCK')
        });
      }
    });

    return rows;
  }, [products]);

  // Filtered & Sorted stock rows
  const filteredRows = useMemo(() => {
    return stockRows
      .filter((row) => {
        // Search filter
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !term ||
          row.productName.toLowerCase().includes(term) ||
          row.sku.toLowerCase().includes(term) ||
          row.categoryName.toLowerCase().includes(term) ||
          row.warehouseName.toLowerCase().includes(term) ||
          row.locationName.toLowerCase().includes(term) ||
          (row.locationCode && row.locationCode.toLowerCase().includes(term));

        // Category filter
        const matchesCategory = !categoryFilter || row.categoryName === categoryFilter;

        // Location / Warehouse filter
        const matchesLocation =
          !locationFilter ||
          (locationFilter.startsWith('wh:')
            ? row.warehouseName === locationFilter.replace('wh:', '')
            : row.locationId === Number(locationFilter));

        // Status filter
        let matchesStatus = true;
        if (statusFilter === 'ATTENTION') matchesStatus = row.onHand <= row.minStockAlert;
        else if (statusFilter === 'IN_STOCK') matchesStatus = row.onHand > 0;
        else if (statusFilter === 'LOW_STOCK') matchesStatus = row.onHand > 0 && row.onHand <= row.minStockAlert;
        else if (statusFilter === 'OUT_OF_STOCK') matchesStatus = row.onHand === 0;
        else if (statusFilter === 'RESERVED') matchesStatus = row.reserved > 0;

        return matchesSearch && matchesCategory && matchesLocation && matchesStatus;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortBy === 'name') comp = a.productName.localeCompare(b.productName);
        else if (sortBy === 'onHand') comp = a.onHand - b.onHand;
        else if (sortBy === 'freeToUse') comp = a.freeToUse - b.freeToUse;
        else if (sortBy === 'cost') comp = a.unitPrice - b.unitPrice;
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [stockRows, searchTerm, categoryFilter, locationFilter, statusFilter, sortBy, sortOrder]);

  // Aggregate Metrics using the shared single source of truth logic
  const metrics = useMemo(() => {
    const totalOnHand = stockRows.reduce((acc, r) => acc + r.onHand, 0);
    const totalFreeToUse = stockRows.reduce((acc, r) => acc + r.freeToUse, 0);
    const totalReserved = stockRows.reduce((acc, r) => acc + r.reserved, 0);
    const totalValuation = stockRows.reduce((acc, r) => acc + r.onHand * r.unitPrice, 0);
    const { lowStockCount, outOfStockCount, totalAttentionCount } = calculateStockAlerts(products);

    return {
      totalOnHand,
      totalFreeToUse,
      totalReserved,
      totalValuation,
      lowStockCount,
      outOfStockCount,
      totalAttentionCount,
      totalPositions: stockRows.length
    };
  }, [stockRows, products]);

  // Open adjustment modal prefilled for a specific row
  const handleOpenRowAdjustment = (row: StockRow) => {
    const prod = products.find(p => p.id === row.productId) || null;
    setTargetProduct(prod);
    setSelectedProductId(String(row.productId));

    // If location is unassigned, pick first available location or leave empty
    if (row.locationId) {
      setSelectedLocationId(String(row.locationId));
      setCurrentRecordedQty(row.onHand);
      setCountedQty(String(row.onHand));
    } else {
      const defaultLoc = allLocations[0]?.id ? String(allLocations[0].id) : '';
      setSelectedLocationId(defaultLoc);
      setCurrentRecordedQty(0);
      setCountedQty('0');
    }

    setReason('Routine Physical Audit');
    setCustomReason('');
    setNotes('');
    setIsAdjustModalOpen(true);
  };

  // Open adjustment modal from header button
  const handleOpenGenericAdjustment = () => {
    const firstProd = products[0];
    setTargetProduct(firstProd || null);
    setSelectedProductId(firstProd ? String(firstProd.id) : '');

    const firstLoc = firstProd?.stock_levels?.[0]?.location_id || allLocations[0]?.id;
    if (firstLoc) {
      setSelectedLocationId(String(firstLoc));
      const sl = firstProd?.stock_levels?.find(s => s.location_id === firstLoc);
      const onHand = sl ? sl.quantity_on_hand : 0;
      setCurrentRecordedQty(onHand);
      setCountedQty(String(onHand));
    } else {
      setSelectedLocationId('');
      setCurrentRecordedQty(0);
      setCountedQty('0');
    }

    setReason('Routine Physical Audit');
    setCustomReason('');
    setNotes('');
    setIsAdjustModalOpen(true);
  };

  // Update recorded qty dynamically when product or location changes in modal
  useEffect(() => {
    if (!isAdjustModalOpen) return;

    const prod = products.find(p => p.id === Number(selectedProductId));
    setTargetProduct(prod || null);

    if (prod && selectedLocationId) {
      const level = prod.stock_levels?.find(sl => sl.location_id === Number(selectedLocationId));
      const onHand = level ? level.quantity_on_hand : 0;
      setCurrentRecordedQty(onHand);
      // Only set counted qty if not manually edited yet or on initial load
      setCountedQty(String(onHand));
    }
  }, [selectedProductId, selectedLocationId, products, isAdjustModalOpen]);

  // Execute Adjustment via API
  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedLocationId) {
      alert('Please select both a product and a warehouse location.');
      return;
    }

    const count = parseInt(countedQty, 10);
    if (isNaN(count) || count < 0) {
      alert('Counted quantity must be a non-negative integer.');
      return;
    }

    const finalReason = reason === 'Other' && customReason.trim() ? customReason.trim() : reason;

    setSubmittingAdjustment(true);
    setAdjustmentFeedback(null);

    try {
      const adjResult = await api.createAdjustment({
        product_id: Number(selectedProductId),
        location_id: Number(selectedLocationId),
        counted_qty: count,
        reason: finalReason,
        notes: notes.trim() || undefined
      });

      // Show success feedback
      setAdjustmentFeedback({
        type: 'success',
        message: `Adjustment Recorded (${adjResult.adjustment_number || 'ADJ'})`,
        details: `Stock updated to ${count} units. An immutable entry was added to the Stock Movement Ledger.`
      });

      // Reload data to reflect new stock on hand and ledger
      await loadData(false);
      await refreshStockAlerts();
      setIsAdjustModalOpen(false);

      // Auto-clear toast after 6 seconds
      setTimeout(() => {
        setAdjustmentFeedback(null);
      }, 6000);
    } catch (err: any) {
      console.error('Adjustment failed:', err);
      setAdjustmentFeedback({
        type: 'error',
        message: 'Adjustment Failed',
        details: err.message || 'Unable to record adjustment. Please check inputs and try again.'
      });
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  const calculatedDifference = (parseInt(countedQty, 10) || 0) - currentRecordedQty;
  const unitPriceForModal = targetProduct ? Number(targetProduct.unit_price) || 0 : 0;
  const financialVariance = calculatedDifference * unitPriceForModal;

  return (
    <div className="space-y-6">
      {/* Toast Alert Feedback */}
      {adjustmentFeedback && (
        <div
          className={`flex items-start justify-between p-3.5 rounded-lg border shadow-xs transition-colors ${
            adjustmentFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {adjustmentFeedback.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold">{adjustmentFeedback.message}</p>
              {adjustmentFeedback.details && (
                <p className="text-xs text-slate-600 mt-0.5">{adjustmentFeedback.details}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setAdjustmentFeedback(null)}
            className="text-xs font-semibold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Stock View & Inventory Availability</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time multi-location availability, physical on-hand tracking, free-to-use dispatch quantities, and ledger-backed adjustment audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition-colors border border-slate-200 shadow-xs"
            title="Refresh stock levels"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleOpenGenericAdjustment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-md shadow-xs transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Update / Adjust Stock</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Total Physical On Hand</span>
            <span className="p-1.5 rounded border border-blue-200/60 bg-blue-50 text-blue-700">
              <Boxes className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 tracking-tight">{metrics.totalOnHand.toLocaleString()}</span>
            <span className="text-xs text-slate-500">units in warehouses</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Across {metrics.totalPositions} active stock positions</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Free to Use (Available)</span>
            <span className="p-1.5 rounded border border-emerald-200/60 bg-emerald-50 text-emerald-700">
              <PackageCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 tracking-tight">{metrics.totalFreeToUse.toLocaleString()}</span>
            <span className="text-xs text-slate-500">units unreserved</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {metrics.totalReserved > 0 ? `${metrics.totalReserved} units committed to orders` : '100% available to promise'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Inventory Valuation</span>
            <span className="p-1.5 rounded border border-indigo-200/60 bg-indigo-50 text-indigo-700">
              <IndianRupee className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 tracking-tight">
              ₹{metrics.totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">At active per-unit cost bases</p>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'ATTENTION' ? 'ALL' : 'ATTENTION')}
          className={`p-4 rounded-lg border shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] cursor-pointer transition-all ${
            statusFilter === 'ATTENTION'
              ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          title="Click to toggle filter for all stock attention alerts"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Stock Attention Alerts</span>
            <span className="p-1.5 rounded border border-amber-200/60 bg-amber-50 text-amber-700">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 tracking-tight">{metrics.totalAttentionCount}</span>
            <span className="text-xs text-slate-500">SKU locations</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={metrics.outOfStockCount > 0 ? "font-medium text-rose-600" : ""}>
              {metrics.outOfStockCount} depleted
            </span>
            <span className="text-slate-300">&bull;</span>
            <span className={metrics.lowStockCount > 0 ? "font-medium text-amber-700" : ""}>
              {metrics.lowStockCount} below buffer threshold
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Product Name, SKU, Category, Warehouse, or Location..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-slate-800 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          {/* Category Filter */}
          <div className="w-full md:w-48">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-md focus:outline-none focus:border-brand-600 text-slate-700"
            >
              <option value="">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse / Location Filter */}
          <div className="w-full md:w-56">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-md focus:outline-none focus:border-brand-600 text-slate-700"
            >
              <option value="">All Warehouses & Locations</option>
              {warehouses.map((wh) => (
                <optgroup key={wh.id} label={`Warehouse: ${wh.name}`}>
                  <option value={`wh:${wh.name}`}>All in {wh.name}</option>
                  {(wh.locations || []).map((loc) => (
                    <option key={loc.id} value={String(loc.id)}>
                      &nbsp;&nbsp;&bull; {loc.name} ({loc.code})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full md:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 text-slate-700 transition-colors"
            >
              <option value="ALL">All Stock Statuses ({stockRows.length})</option>
              <option value="ATTENTION">Stock Alerts ({metrics.totalAttentionCount})</option>
              <option value="LOW_STOCK">Below Buffer ({metrics.lowStockCount})</option>
              <option value="OUT_OF_STOCK">Depleted (0 units) ({metrics.outOfStockCount})</option>
              <option value="IN_STOCK">In Stock (&gt; 0)</option>
              <option value="RESERVED">Has Reserved Stock</option>
            </select>
          </div>
        </div>

        {/* Filter Pills / Counters */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span>Showing <strong className="text-slate-800">{filteredRows.length}</strong> of {stockRows.length} stock positions</span>
            {(searchTerm || categoryFilter || locationFilter || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('');
                  setLocationFilter('');
                  setStatusFilter('ALL');
                }}
                className="text-brand-600 hover:text-brand-700 font-medium underline ml-1"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Sorting controls */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px]">Sort by:</span>
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
              <button
                onClick={() => {
                  if (sortBy === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('name'); setSortOrder('asc'); }
                }}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  sortBy === 'name' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => {
                  if (sortBy === 'onHand') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('onHand'); setSortOrder('desc'); }
                }}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  sortBy === 'onHand' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                On Hand {sortBy === 'onHand' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => {
                  if (sortBy === 'freeToUse') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('freeToUse'); setSortOrder('desc'); }
                }}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  sortBy === 'freeToUse' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Free to Use {sortBy === 'freeToUse' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button
                onClick={() => {
                  if (sortBy === 'cost') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('cost'); setSortOrder('desc'); }
                }}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  sortBy === 'cost' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Cost {sortBy === 'cost' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Stock Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 text-[10px]">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Warehouse / Location</th>
                <th className="px-4 py-2.5 text-right">Per-Unit Cost</th>
                <th className="px-4 py-2.5 text-right">On Hand</th>
                <th className="px-4 py-2.5 text-right">Free to Use</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Stock Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-brand-600" />
                      <span>Loading real-time stock positions...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Boxes className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-semibold text-slate-700">No stock entries matched your query</p>
                      <p className="text-[11px] text-slate-400">
                        Try resetting your search filters or check your inventory category parameters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const hasReservation = row.reserved > 0;
                  const isDepleted = row.onHand === 0;
                  const isLow = row.onHand > 0 && row.onHand <= row.minStockAlert;

                  return (
                    <tr
                      key={row.key}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isDepleted ? 'bg-rose-50/20' : (isLow ? 'bg-amber-50/20' : '')
                      }`}
                    >
                      {/* Product Name */}
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{row.productName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Buffer: &le; {row.minStockAlert} {row.uom}</div>
                      </td>

                      {/* SKU */}
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/80 font-normal">
                          {row.sku}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-2.5 text-slate-600">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100/70 text-slate-600 text-[11px] border border-slate-200/50">
                          <Tag className="w-3 h-3 text-slate-400" />
                          {row.categoryName}
                        </span>
                      </td>

                      {/* Warehouse / Location */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-medium text-slate-800">{row.warehouseName}</div>
                            <div className="text-[11px] text-slate-500">
                              {row.locationName} {row.locationCode ? `(${row.locationCode})` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Per-Unit Cost */}
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                        ₹{row.unitPrice.toFixed(2)}
                      </td>

                      {/* On Hand */}
                      <td className="px-4 py-2.5 text-right">
                        <div className="font-semibold text-slate-900">
                          {row.onHand.toLocaleString()} <span className="text-[11px] font-normal text-slate-400">{row.uom}</span>
                        </div>
                        {hasReservation && (
                          <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                            ({row.reserved} reserved)
                          </div>
                        )}
                      </td>

                      {/* Free to Use */}
                      <td className="px-4 py-2.5 text-right">
                        <div className={`font-semibold ${
                          row.freeToUse === 0
                            ? 'text-rose-600'
                            : (row.freeToUse <= row.minStockAlert ? 'text-amber-600' : 'text-emerald-700')
                        }`}>
                          {row.freeToUse.toLocaleString()} <span className="text-[11px] font-normal text-slate-400">{row.uom}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Available
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2.5 text-center">
                        <Badge status={row.stockStatus} />
                      </td>

                      {/* Action */}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleOpenRowAdjustment(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded border border-slate-200 text-xs shadow-xs transition-colors"
                          title="Audit physical count & log adjustment"
                        >
                          <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                          <span>Update</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Workflow Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => !submittingAdjustment && setIsAdjustModalOpen(false)}
        title="Stock Adjustment & Count Reconciliation"
        subtitle="Perform physical cycle audit, recalculate availability, and log immutable ledger record"
        maxWidth="lg"
      >
        <form onSubmit={handleExecuteAdjustment} className="space-y-4 text-xs">
          {/* Product & Location Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Product Item *</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={submittingAdjustment}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
              {targetProduct && (
                <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
                  <span>Category: {targetProduct.category_name}</span>
                  <span>&bull;</span>
                  <span>Cost: ₹{Number(targetProduct.unit_price).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Warehouse Location *</label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={submittingAdjustment}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-xs"
              >
                {allLocations.length === 0 ? (
                  <option value="">No locations defined</option>
                ) : (
                  allLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.displayLabel}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                Audit location target for recorded stock level
              </div>
            </div>
          </div>

          {/* Current Stock vs Counted Stock */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-900 text-white rounded-xl">
            <div>
              <span className="block text-[11px] text-slate-400 font-medium uppercase tracking-wider">Recorded System Level</span>
              <span className="text-xl font-bold font-mono mt-0.5 block">{currentRecordedQty}</span>
              <span className="text-[10px] text-slate-400">Current on hand</span>
            </div>

            <div>
              <span className="block text-[11px] text-slate-400 font-medium uppercase tracking-wider">New Counted Level</span>
              <span className="text-xl font-bold font-mono mt-0.5 block text-brand-300">
                {parseInt(countedQty, 10) || 0}
              </span>
              <span className="text-[10px] text-slate-400">Physical count</span>
            </div>

            <div>
              <span className="block text-[11px] text-slate-400 font-medium uppercase tracking-wider">Stock Variance</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-xl font-bold font-mono ${
                  calculatedDifference > 0 ? 'text-emerald-400' : (calculatedDifference < 0 ? 'text-rose-400' : 'text-slate-300')
                }`}>
                  {calculatedDifference > 0 ? `+${calculatedDifference}` : calculatedDifference}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                {calculatedDifference !== 0 && targetProduct ? (
                  `₹${Math.abs(financialVariance).toFixed(2)} impact`
                ) : 'Zero variance'}
              </span>
            </div>
          </div>

          {/* Physical Count Input */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Physically Counted Quantity *
            </label>
            <input
              type="number"
              min="0"
              required
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              disabled={submittingAdjustment}
              placeholder="e.g. 50"
              className="w-full px-3.5 py-2.5 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Enter the exact physical quantity counted on shelf/bin. The system will set location on-hand to this count.
            </p>
          </div>

          {/* Reason Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Reason for Adjustment *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submittingAdjustment}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium text-xs"
            >
              <option value="Routine Physical Audit">Routine Physical Audit / Re-count</option>
              <option value="Cycle Count Discrepancy">Cycle Count Discrepancy</option>
              <option value="Damaged / Spoiled Goods">Damaged / Broken / Spoiled Goods</option>
              <option value="Theft or Loss Discrepancy">Theft / Unaccounted Shrinkage</option>
              <option value="Supplier Delivery Discrepancy">Vendor / Inbound Receiving Discrepancy</option>
              <option value="Restock / Customer Return">Customer Return Restocked to Shelf</option>
              <option value="Initial Calibration">Initial Warehouse Inventory Calibration</option>
              <option value="Other">Other (Specify Below)</option>
            </select>
          </div>

          {reason === 'Other' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Specify Custom Reason *</label>
              <input
                type="text"
                required
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="e.g. Water damage in Section 4"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-xs"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Audit Notes / Supporting Info</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submittingAdjustment}
              placeholder="e.g. Verified by supervisor during monthly inventory check..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-xs"
            />
          </div>

          {/* Ledger Compliance Banner */}
          <InfoBanner
            icon={ShieldAlert}
            title="Audit Ledger Policy"
            description={
              <>
                This operation creates a verifiable stock adjustment record and logs a permanent entry in the <strong className="font-semibold text-slate-800">Stock Movement Ledger</strong> with timestamp, staff identity, and before/after balances.
              </>
            }
          />

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={submittingAdjustment}
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-3.5 py-1.5 border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 font-medium transition-colors text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingAdjustment}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-md shadow-xs disabled:opacity-50 transition-colors text-xs cursor-pointer"
            >
              {submittingAdjustment ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Adjustment...</span>
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Confirm Adjustment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
