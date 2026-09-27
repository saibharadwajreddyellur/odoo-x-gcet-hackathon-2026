import React from 'react';
import { Filter, RefreshCw, FileText, CheckCircle2, Building2, Tag } from 'lucide-react';
import { Category, Warehouse } from '../../types';

interface FilterBarProps {
  categories: Category[];
  warehouses: Warehouse[];
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  selectedWarehouse: string;
  onWarehouseChange: (wh: string) => void;
  selectedDocType: string;
  onDocTypeChange: (docType: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  onReset: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  categories,
  warehouses,
  selectedCategory,
  onCategoryChange,
  selectedWarehouse,
  onWarehouseChange,
  selectedDocType,
  onDocTypeChange,
  selectedStatus,
  onStatusChange,
  onReset
}) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-slate-500 font-medium text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Filters:</span>
        </div>

        {/* 1. Document Type Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
          <select
            value={selectedDocType}
            onChange={(e) => onDocTypeChange(e.target.value)}
            className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer pr-1 text-xs"
            title="Filter by Document Type"
          >
            <option value="">All Document Types</option>
            <option value="receipt">Receipts (Incoming)</option>
            <option value="delivery">Deliveries (Outgoing)</option>
            <option value="internal">Internal Transfers</option>
            <option value="adjustment">Stock Adjustments</option>
          </select>
        </div>

        {/* 2. Status Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
          <CheckCircle2 className="w-3 h-3 text-slate-400 shrink-0" />
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer pr-1 text-xs"
            title="Filter by Status"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="WAITING">Waiting (Stock Required)</option>
            <option value="READY">Ready (Ready to Process)</option>
            <option value="DONE">Done (Completed)</option>
            <option value="CANCELLED">Canceled</option>
          </select>
        </div>

        {/* 3. Warehouse / Location Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
          <select
            value={selectedWarehouse}
            onChange={(e) => onWarehouseChange(e.target.value)}
            className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer pr-1 max-w-[200px] truncate text-xs"
            title="Filter by Warehouse or Location"
          >
            <option value="">All Warehouses & Locations</option>
            {warehouses.map((w) => (
              <optgroup key={`wh-${w.id}`} label={`Warehouse: ${w.name}`}>
                <option value={`wh-${w.id}`}>{w.name} (All Zones)</option>
                {w.locations && w.locations.map((loc) => (
                  <option key={`loc-${loc.id}`} value={`loc-${loc.id}`}>
                    &nbsp;&nbsp;↳ {loc.name} ({loc.code})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 4. Product Category Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
          <Tag className="w-3 h-3 text-slate-400 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer pr-1 text-xs"
            title="Filter by Product Category"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors font-medium border border-slate-200 text-xs"
      >
        <RefreshCw className="w-3 h-3 text-slate-400" />
        <span>Reset Filters</span>
      </button>
    </div>
  );
};
