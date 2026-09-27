import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Warehouse, Location } from '../types';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/common/Modal';
import { InfoBanner } from '../components/common/InfoBanner';
import { Badge } from '../components/common/Badge';
import {
  Warehouse as WarehouseIcon,
  MapPin,
  Layers,
  CheckCircle,
  ShieldAlert,
  Plus,
  Pencil,
  AlertCircle,
  Loader2
} from 'lucide-react';

export const Warehouses: React.FC = () => {
  const { isManager } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Warehouse Modal State
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', code: '', address: '' });

  // Location Modal State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationForm, setLocationForm] = useState({ warehouse_id: 0, name: '', code: '' });

  // Common Modal State
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchWarehouses = async () => {
    try {
      const data = await api.getWarehouses();
      setWarehouses(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  // --- Warehouse Handlers ---
  const handleOpenCreateWarehouse = () => {
    setEditingWarehouse(null);
    setWarehouseForm({ name: '', code: '', address: '' });
    setModalError(null);
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    setWarehouseForm({
      name: wh.name,
      code: wh.code,
      address: wh.address || ''
    });
    setModalError(null);
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseForm.name.trim() || !warehouseForm.code.trim()) {
      setModalError('Warehouse name and code are required.');
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      if (editingWarehouse) {
        await api.updateWarehouse(editingWarehouse.id, {
          name: warehouseForm.name.trim(),
          code: warehouseForm.code.trim().toUpperCase(),
          address: warehouseForm.address.trim() || undefined
        });
      } else {
        await api.createWarehouse({
          name: warehouseForm.name.trim(),
          code: warehouseForm.code.trim().toUpperCase(),
          address: warehouseForm.address.trim() || undefined
        });
      }
      setIsWarehouseModalOpen(false);
      await fetchWarehouses();
    } catch (err: any) {
      setModalError(err.message || 'Operation failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // --- Location Handlers ---
  const handleOpenCreateLocation = (warehouseId: number) => {
    setEditingLocation(null);
    setLocationForm({
      warehouse_id: warehouseId,
      name: '',
      code: ''
    });
    setModalError(null);
    setIsLocationModalOpen(true);
  };

  const handleOpenEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocationForm({
      warehouse_id: loc.warehouse_id,
      name: loc.name,
      code: loc.code
    });
    setModalError(null);
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationForm.name.trim() || !locationForm.code.trim()) {
      setModalError('Location name and code are required.');
      return;
    }
    if (!locationForm.warehouse_id) {
      setModalError('Please select a parent warehouse.');
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      if (editingLocation) {
        await api.updateLocation(editingLocation.id, {
          warehouse_id: locationForm.warehouse_id,
          name: locationForm.name.trim(),
          code: locationForm.code.trim().toUpperCase()
        });
      } else {
        await api.createLocation({
          warehouse_id: locationForm.warehouse_id,
          name: locationForm.name.trim(),
          code: locationForm.code.trim().toUpperCase()
        });
      }
      setIsLocationModalOpen(false);
      await fetchWarehouses();
    } catch (err: any) {
      setModalError(err.message || 'Operation failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* RBAC Notice for non-managers */}
      {!isManager && (
        <InfoBanner
          icon={ShieldAlert}
          title="Read-Only Access"
          description="Warehouse & location topology administration is reserved for Inventory Managers."
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Warehouses & Storage Topologies</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Physical distribution sites, staging docks, bins, and aisle racks
          </p>
        </div>
        {isManager && (
          <button
            onClick={handleOpenCreateWarehouse}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Warehouse</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Warehouses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            <span>Loading storage facilities...</span>
          </div>
        ) : warehouses.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-xs text-slate-400 bg-white rounded-lg border border-slate-200">
            No warehouses registered. {isManager && 'Click "New Warehouse" to add one.'}
          </div>
        ) : (
          warehouses.map((wh) => (
            <div key={wh.id} className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] p-4 space-y-3.5">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 text-slate-600 rounded border border-slate-200/60">
                    <WarehouseIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{wh.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                      <span className="font-mono font-medium text-slate-700">{wh.code}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {wh.address || 'No physical address specified'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status="ACTIVE" label="Active Hub" />
                  {isManager && (
                    <button
                      onClick={() => handleOpenEditWarehouse(wh)}
                      title="Edit Warehouse"
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>Configured Storage Locations & Zones ({wh.locations?.length || 0})</span>
                  </h4>
                  {isManager && (
                    <button
                      onClick={() => handleOpenCreateLocation(wh.id)}
                      className="text-xs text-brand-700 hover:text-brand-800 hover:bg-brand-50 font-medium px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Location</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {(!wh.locations || wh.locations.length === 0) ? (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded border border-dashed border-slate-200">
                      No storage locations configured for this hub yet.
                    </div>
                  ) : (
                    wh.locations.map((loc: Location) => (
                      <div
                        key={loc.id}
                        className="flex items-center justify-between p-2 bg-slate-50/70 rounded-md border border-slate-200/80 hover:border-slate-300 transition-colors text-xs"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{loc.name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{loc.code}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                            Operational
                          </span>
                          {isManager && (
                            <button
                              onClick={() => handleOpenEditLocation(loc)}
                              title="Edit Location"
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Warehouse Create / Edit Modal */}
      <Modal
        isOpen={isWarehouseModalOpen}
        onClose={() => !saving && setIsWarehouseModalOpen(false)}
        title={editingWarehouse ? 'Edit Warehouse' : 'New Warehouse'}
        subtitle={editingWarehouse ? `Update details for ${editingWarehouse.name}` : 'Register a new distribution center or warehouse facility'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveWarehouse} className="space-y-4 mt-2">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Warehouse Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={warehouseForm.name}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
              placeholder="e.g. Central Fulfillment Hub"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Warehouse Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={warehouseForm.code}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
              placeholder="e.g. WH-CENTRAL-01"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs font-mono uppercase focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">Unique identifier code used in routing and transfers.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Physical Address
            </label>
            <textarea
              rows={2}
              value={warehouseForm.address}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
              placeholder="e.g. 100 Logistics Blvd, Suite 200, Austin, TX 78701"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => setIsWarehouseModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingWarehouse ? 'Save Changes' : 'Create Warehouse'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Location Create / Edit Modal */}
      <Modal
        isOpen={isLocationModalOpen}
        onClose={() => !saving && setIsLocationModalOpen(false)}
        title={editingLocation ? 'Edit Storage Location' : 'New Storage Location'}
        subtitle={editingLocation ? `Update parameters for ${editingLocation.name}` : 'Configure a designated bin, rack, dock, or zone'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveLocation} className="space-y-4 mt-2">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Parent Warehouse <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={locationForm.warehouse_id}
              onChange={(e) => setLocationForm({ ...locationForm, warehouse_id: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none bg-white"
            >
              <option value={0} disabled>Select warehouse...</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Location Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={locationForm.name}
              onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
              placeholder="e.g. Zone B - Rack 04 - Bin 12"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Location Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={locationForm.code}
              onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
              placeholder="e.g. ZB-R04-B12"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs font-mono uppercase focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">Unique internal code mapped to barcodes or pick lists.</p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => setIsLocationModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingLocation ? 'Save Changes' : 'Create Location'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
