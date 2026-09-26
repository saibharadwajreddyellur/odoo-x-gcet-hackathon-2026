import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { DashboardSummary, Category, Warehouse, Product } from '../types';
import { StatCard } from '../components/common/StatCard';
import { StockLevelChart } from '../components/dashboard/StockLevelChart';
import { MovementSummary } from '../components/dashboard/MovementSummary';
import { LowStockTable } from '../components/dashboard/LowStockTable';
import { FilterBar } from '../components/dashboard/FilterBar';
import { OperationsOverview } from '../components/dashboard/OperationsOverview';
import { OperationsTable } from '../components/dashboard/OperationsTable';
import { NavTab } from '../components/common/Sidebar';
import { useAuth } from '../context/AuthContext';
import {
  Boxes, AlertTriangle, XCircle, Truck, Send, ArrowLeftRight,
  Plus, Clock, AlertCircle, SlidersHorizontal
} from 'lucide-react';

interface DashboardProps {
  onNavigateTab: (tab: NavTab) => void;
  onQuickReceipt?: (product: Product) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateTab, onQuickReceipt }) => {
  const { isManager } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Filters
  const [selectedDocType, setSelectedDocType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      let warehouse_id: number | undefined;
      let location_id: number | undefined;
      if (selectedWarehouse.startsWith('wh-')) {
        warehouse_id = parseInt(selectedWarehouse.replace('wh-', ''), 10);
      } else if (selectedWarehouse.startsWith('loc-')) {
        location_id = parseInt(selectedWarehouse.replace('loc-', ''), 10);
      }

      const category_id = selectedCategory ? parseInt(selectedCategory, 10) : undefined;

      const [sumData, cats, whs] = await Promise.all([
        api.getDashboardSummary({
          category_id,
          warehouse_id,
          location_id,
          document_type: selectedDocType || undefined,
          status: selectedStatus || undefined
        }),
        api.getCategories(),
        api.getWarehouses()
      ]);
      setSummary(sumData);
      setCategories(cats);
      setWarehouses(whs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDocType, selectedStatus, selectedWarehouse, selectedCategory]);

  const handleResetFilters = () => {
    setSelectedDocType('');
    setSelectedStatus('');
    setSelectedWarehouse('');
    setSelectedCategory('');
  };

  if (loading && !summary) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-500">Loading real-time stock metrics & operational pipeline...</p>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isManager ? 'Executive Stock Overview' : 'Operations Dashboard'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isManager
              ? 'Real-time inventory registry, dynamic operational pipeline & warehouse metrics'
              : 'Warehouse floor operations, transfers, deliveries, shelving and counts'}
          </p>
        </div>

        {/* Quick Operations Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('receipts')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>New Receipt</span>
          </button>
          <button
            onClick={() => onNavigateTab('deliveries')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Dispatch Order</span>
          </button>
          <button
            onClick={() => onNavigateTab('transfers')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg shadow-sm transition-all"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" />
            <span>Internal Transfer</span>
          </button>
          {isManager ? (
            <button
              onClick={() => onNavigateTab('products')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>Add Product</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigateTab('adjustments')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg shadow-sm transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Stock Adjustment</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Filters Bar */}
      <FilterBar
        categories={categories}
        warehouses={warehouses}
        selectedDocType={selectedDocType}
        onDocTypeChange={setSelectedDocType}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        selectedWarehouse={selectedWarehouse}
        onWarehouseChange={setSelectedWarehouse}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        onReset={handleResetFilters}
      />

      {/* Required Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Receipts to Receive"
          value={summary.kpis.receipts_to_receive ?? summary.kpis.pending_receipts}
          subtitle="Inbound shipments pending receipt"
          icon={Truck}
          color="blue"
          badgeText="To Receive"
          badgeType="neutral"
          onClick={() => onNavigateTab('receipts')}
        />
        <StatCard
          title="Deliveries to Deliver"
          value={summary.kpis.deliveries_to_deliver ?? summary.kpis.pending_deliveries}
          subtitle="Outbound orders to dispatch"
          icon={Send}
          color="indigo"
          badgeText="To Deliver"
          badgeType="neutral"
          onClick={() => onNavigateTab('deliveries')}
        />
        <StatCard
          title="Late Operations"
          value={summary.kpis.late_operations ?? 0}
          subtitle="Schedule date passed overdue"
          icon={Clock}
          color="rose"
          badgeText={summary.kpis.late_operations && summary.kpis.late_operations > 0 ? "Past Due" : "All on Time"}
          badgeType={summary.kpis.late_operations && summary.kpis.late_operations > 0 ? "alert" : "success"}
        />
        <StatCard
          title="Waiting Operations"
          value={summary.kpis.waiting_operations ?? 0}
          subtitle="Deliveries waiting for stock"
          icon={AlertCircle}
          color="amber"
          badgeText={summary.kpis.waiting_operations && summary.kpis.waiting_operations > 0 ? "Stock Deficit" : "Available"}
          badgeType={summary.kpis.waiting_operations && summary.kpis.waiting_operations > 0 ? "warning" : "neutral"}
          onClick={() => onNavigateTab('deliveries')}
        />
      </div>

      {/* Core Inventory Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total In Stock"
          value={summary.kpis.total_units_in_stock}
          subtitle={`${summary.kpis.total_products} unique SKUs`}
          icon={Boxes}
          color="emerald"
          badgeText="Active Units"
          badgeType="success"
          onClick={() => onNavigateTab('products')}
        />
        <StatCard
          title="Low-Stock Alert"
          value={summary.kpis.low_stock_count}
          subtitle="Below safety buffer"
          icon={AlertTriangle}
          color="amber"
          badgeText="Restock Soon"
          badgeType="warning"
          onClick={() => onNavigateTab('products')}
        />
        <StatCard
          title="Out of Stock"
          value={summary.kpis.out_of_stock_count}
          subtitle="Zero units on hand"
          icon={XCircle}
          color="rose"
          badgeText={summary.kpis.out_of_stock_count > 0 ? "Critical" : "All Clear"}
          badgeType={summary.kpis.out_of_stock_count > 0 ? "alert" : "neutral"}
          onClick={() => onNavigateTab('products')}
        />
        <StatCard
          title="Scheduled Transfers"
          value={summary.kpis.scheduled_transfers}
          subtitle="Inter-facility routing"
          icon={ArrowLeftRight}
          color="slate"
          badgeText="Internal"
          badgeType="neutral"
          onClick={() => onNavigateTab('transfers')}
        />
      </div>

      {/* Operations Pipeline Summary (Kanban / Cards from Mockup) */}
      <OperationsOverview
        summaries={summary.operation_summaries || []}
        onNavigateTab={onNavigateTab}
      />

      {/* Filtered Document Pipeline Table */}
      <OperationsTable
        documents={summary.operations || []}
        onNavigateTab={onNavigateTab}
      />

      {/* Analytical Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StockLevelChart data={summary.category_distribution} />
        <MovementSummary trends={summary.movement_trends} />
      </div>

      {/* Low Stock Attention & Quick Restock Table */}
      <LowStockTable
        items={summary.low_stock_items}
        onTriggerReceipt={(prod: Product) => {
          onQuickReceipt?.(prod);
          onNavigateTab('receipts');
        }}
      />
    </div>
  );
};
