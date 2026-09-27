import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { Product, Category, Warehouse } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import {
  Package, Plus, Search, MapPin, AlertCircle, CheckCircle, Tag, Boxes, ShieldAlert
} from 'lucide-react';
import { NavTab } from '../../components/common/Sidebar';
import { useAuth } from '../../context/AuthContext';

interface ProductListProps {
  onNavigateTab?: (tab: NavTab) => void;
  externalSearchTerm?: string;
  onSearchChange?: (term: string) => void;
}

export const ProductList: React.FC<ProductListProps> = ({ onNavigateTab, externalSearchTerm, onSearchChange }) => {
  const { isManager } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState(externalSearchTerm || '');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Keep search state synchronized with external search prop
  useEffect(() => {
    if (externalSearchTerm !== undefined) {
      setSearchTerm(externalSearchTerm);
    }
  }, [externalSearchTerm]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    onSearchChange?.(value);
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [uom, setUom] = useState('Units');
  const [unitPrice, setUnitPrice] = useState('0');
  const [initialStock, setInitialStock] = useState('0');
  const [initialLocationId, setInitialLocationId] = useState('');
  const [minAlert, setMinAlert] = useState('10');
  const [reorderQty, setReorderQty] = useState('50');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats, whs] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
        api.getWarehouses()
      ]);
      setProducts(prods);
      setCategories(cats);
      setWarehouses(whs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createProduct({
        name,
        sku,
        category_id: categoryId ? Number(categoryId) : null,
        uom,
        unit_price: Number(unitPrice),
        initial_stock: Number(initialStock),
        initial_location_id: initialLocationId ? Number(initialLocationId) : null,
        min_stock_alert: Number(minAlert),
        reorder_quantity: Number(reorderQty),
        description
      });
      setIsModalOpen(false);
      // Reset form
      setName('');
      setSku('');
      setDescription('');
      setInitialStock('0');
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  // Filter products: case-insensitive, whitespace-tolerant by product name and SKU
  const filteredProducts = useMemo(() => {
    const rawSearch = (searchTerm || '').trim().toLowerCase();
    const normalizedSearch = rawSearch.replace(/\s+/g, ' ');
    const searchTokens = normalizedSearch ? normalizedSearch.split(' ') : [];

    return products.filter((p) => {
      const name = (p.name || '').toLowerCase().replace(/\s+/g, ' ');
      const sku = (p.sku || '').toLowerCase().replace(/\s+/g, ' ');

      let matchesSearch = true;
      if (normalizedSearch) {
        matchesSearch =
          name.includes(normalizedSearch) ||
          sku.includes(normalizedSearch) ||
          (searchTokens.length > 1 && searchTokens.every(tok => name.includes(tok) || sku.includes(tok)));
      }

      const matchesCat = !selectedCategory || p.category_name === selectedCategory;
      const matchesStatus = !selectedStatus || p.stock_status === selectedStatus;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [products, searchTerm, selectedCategory, selectedStatus]);

  // Flattened locations for dropdown
  const allLocations = warehouses.flatMap(w =>
    w.locations.map(l => ({ ...l, warehouse_name: w.name }))
  );

  return (
    <div className="space-y-6">
      {/* RBAC Notice for non-managers */}
      {!isManager && (
        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Operational Catalog View:</strong> SKU registration, pricing, and reorder rule configurations are managed by Inventory Managers.
            </span>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-100 font-semibold text-amber-800">
            STAFF VIEW
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Product Catalog & Reordering</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage SKU profiles, multi-location stock availability, and automated safety buffers
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('stock')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-200"
            >
              <Boxes className="w-4 h-4 text-brand-600" />
              <span>Dedicated Stock View</span>
            </button>
          )}
          {isManager && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Product SKU</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by SKU code or product title..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Stock Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="LOW_STOCK">Low Stock</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Product Name & SKU</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">UoM</th>
                <th className="px-5 py-3 text-right">Unit Price</th>
                <th className="px-5 py-3 text-right">Total On Hand</th>
                <th className="px-5 py-3">Stock by Location</th>
                <th className="px-5 py-3 text-right">Reorder Rule</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">Loading catalog...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">No products match your criteria.</td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-0.5">{p.sku}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        <Tag className="w-3 h-3 text-slate-400" />
                        {p.category_name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{p.uom}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-900">
                      ₹{Number(p.unit_price).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-900 text-sm">
                      {p.total_stock}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1 max-w-xs">
                        {p.stock_levels.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">No assigned location</span>
                        ) : (
                          p.stock_levels.map((sl, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              <span className="text-slate-600 truncate">{sl.location_name || sl.location_code}</span>
                              <span className="font-bold text-slate-800 ml-2">{sl.quantity_on_hand}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="text-[11px] text-slate-500">Alert at &le; <span className="font-semibold text-slate-700">{p.min_stock_alert}</span></div>
                      <div className="text-[11px] text-brand-600 font-medium">Reorder +{p.reorder_quantity}</div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Badge status={p.stock_status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Inventory Product"
        subtitle="Configure SKU identity, initial warehouse allocation, and reordering rules"
        maxWidth="xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Product Title *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wireless Barcode Gun"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">SKU / Code *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="e.g. SS-WAND-002"
                className="w-full font-mono uppercase px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unit of Measure (UoM)</label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="Units">Units (Pcs)</option>
                <option value="Boxes">Boxes</option>
                <option value="Rolls">Rolls</option>
                <option value="Kg">Kilograms (Kg)</option>
                <option value="Liters">Liters</option>
                <option value="Pairs">Pairs</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unit Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Initial Stock Quantity</label>
              <input
                type="number"
                min="0"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Initial Location Storage</label>
              <select
                value={initialLocationId}
                onChange={(e) => setInitialLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select Storage Location</option>
                {allLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.warehouse_name} &rarr; {l.name} ({l.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Minimum Alert Buffer</label>
              <input
                type="number"
                min="0"
                value={minAlert}
                onChange={(e) => setMinAlert(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Triggers low-stock warning when on-hand falls below</p>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Suggested Reorder Quantity</label>
              <input
                type="number"
                min="1"
                value={reorderQty}
                onChange={(e) => setReorderQty(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Default lot size for new purchase receipts</p>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description & Storage Notes</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Keep in humidity-controlled container, fragile glass lens..."
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
              {submitting ? 'Registering...' : 'Save Product & Allocate'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
