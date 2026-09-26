import {
  Product, Category, Warehouse, Location, Receipt,
  Delivery, InternalTransfer, StockAdjustment, StockLedgerEntry,
  DashboardSummary, User
} from '../types';
import {
  INITIAL_CATEGORIES, INITIAL_WAREHOUSES, INITIAL_PRODUCTS,
  INITIAL_RECEIPTS, INITIAL_DELIVERIES, INITIAL_TRANSFERS,
  INITIAL_ADJUSTMENTS, INITIAL_LEDGER, getMockDashboardSummary
} from './mockData';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Local storage or in-memory mutable mock store for rich local experience
class MockStorage {
  categories = [...INITIAL_CATEGORIES];
  warehouses = [...INITIAL_WAREHOUSES];
  products = [...INITIAL_PRODUCTS];
  receipts = [...INITIAL_RECEIPTS];
  deliveries = [...INITIAL_DELIVERIES];
  transfers = [...INITIAL_TRANSFERS];
  adjustments = [...INITIAL_ADJUSTMENTS];
  ledger = [...INITIAL_LEDGER];

  recalcProductStock(productId: number) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;
    const total = prod.stock_levels.reduce((acc, sl) => acc + sl.quantity_on_hand, 0);
    prod.total_stock = total;
    if (total === 0) prod.stock_status = 'OUT_OF_STOCK';
    else if (total <= prod.min_stock_alert) prod.stock_status = 'LOW_STOCK';
    else prod.stock_status = 'IN_STOCK';
  }
}

const mockStore = new MockStorage();

const getAuthHeaders = () => {
  const token = localStorage.getItem('stocksense_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const isNetworkOrTimeoutError = (e: any): boolean => {
  if (!e) return false;
  const name = e.name || '';
  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('NetworkError') ||
    msg.includes('network error')
  );
};

const DEFAULT_TIMEOUT_MS = 10000;

async function apiFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...getAuthHeaders(),
        ...(fetchOptions.headers || {})
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

export const api = {
  // --- Dashboard ---
  async getDashboardSummary(params?: {
    category_id?: number;
    warehouse_id?: number;
    location_id?: number;
    document_type?: string;
    status?: string;
  }): Promise<DashboardSummary> {
    const queryParts: string[] = [];
    if (params?.category_id) queryParts.push(`category_id=${params.category_id}`);
    if (params?.warehouse_id) queryParts.push(`warehouse_id=${params.warehouse_id}`);
    if (params?.location_id) queryParts.push(`location_id=${params.location_id}`);
    if (params?.document_type) queryParts.push(`document_type=${encodeURIComponent(params.document_type)}`);
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    try {
      const res = await apiFetch(`${API_BASE_URL}/dashboard/summary${qs}`);
      if (res.ok) return await res.json();
    } catch {
      // Fallback
    }

    // Dynamic mock summary fallback
    const totalProducts = mockStore.products.length;
    const totalUnits = mockStore.products.reduce((acc, p) => acc + p.total_stock, 0);
    const lowStock = mockStore.products.filter(p => p.stock_status === 'LOW_STOCK');
    const outOfStock = mockStore.products.filter(p => p.stock_status === 'OUT_OF_STOCK');
    const pendingReceipts = mockStore.receipts.filter(r => ['DRAFT', 'READY'].includes(r.status)).length;
    const pendingDeliveries = mockStore.deliveries.filter(d => ['DRAFT', 'WAITING', 'READY', 'PICKING', 'PACKING'].includes(d.status)).length;

    return {
      kpis: {
        total_products: totalProducts,
        total_units_in_stock: totalUnits,
        low_stock_count: lowStock.length,
        out_of_stock_count: outOfStock.length,
        pending_receipts: pendingReceipts,
        pending_deliveries: pendingDeliveries,
        scheduled_transfers: mockStore.transfers.filter(t => t.status === 'SCHEDULED').length,
        receipts_to_receive: pendingReceipts,
        deliveries_to_deliver: pendingDeliveries,
        late_operations: 0,
        waiting_operations: mockStore.deliveries.filter(d => d.status === 'WAITING').length
      },
      low_stock_items: [...lowStock, ...outOfStock],
      category_distribution: mockStore.categories.map(c => {
        const prods = mockStore.products.filter(p => p.category_id === c.id);
        return {
          category_name: c.name,
          product_count: prods.length,
          total_quantity: prods.reduce((sum, p) => sum + p.total_stock, 0)
        };
      }),
      recent_movements: mockStore.ledger.slice(0, 10)
    };
  },

  // --- Products & Categories ---
  async getProducts(): Promise<Product[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/products`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.products;
  },

  async createProduct(productData: any): Promise<Product> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        body: JSON.stringify(productData)
      });
      if (res.ok) return await res.json();
    } catch { }

    const newId = mockStore.products.length + 1;
    const initialQty = Number(productData.initial_stock) || 0;
    const cat = mockStore.categories.find(c => c.id === Number(productData.category_id));

    const newProd: Product = {
      id: newId,
      name: productData.name,
      sku: productData.sku,
      category_id: productData.category_id,
      category_name: cat ? cat.name : 'Uncategorized',
      uom: productData.uom || 'Units',
      unit_price: Number(productData.unit_price) || 0,
      initial_stock: initialQty,
      min_stock_alert: Number(productData.min_stock_alert) || 10,
      reorder_quantity: Number(productData.reorder_quantity) || 50,
      description: productData.description || '',
      total_stock: initialQty,
      stock_status: initialQty === 0 ? 'OUT_OF_STOCK' : (initialQty <= (Number(productData.min_stock_alert) || 10) ? 'LOW_STOCK' : 'IN_STOCK'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stock_levels: productData.initial_location_id ? [{
        id: newId,
        location_id: Number(productData.initial_location_id),
        location_name: 'Assigned Location',
        location_code: 'LOC-INIT',
        quantity_on_hand: initialQty,
        reserved_quantity: 0
      }] : []
    };

    mockStore.products.unshift(newProd);

    if (initialQty > 0 && productData.initial_location_id) {
      mockStore.ledger.unshift({
        id: mockStore.ledger.length + 1,
        timestamp: new Date().toISOString(),
        product_id: newId,
        product_name: newProd.name,
        product_sku: newProd.sku,
        location_id: Number(productData.initial_location_id),
        location_name: 'Assigned Location',
        change_qty: initialQty,
        balance_after: initialQty,
        action_type: 'INITIAL',
        reference_doc_type: 'ProductCreation',
        reference_doc_number: newProd.sku,
        user_email: 'admin@stocksense.io',
        notes: 'Initial stock allocation'
      });
    }

    return newProd;
  },

  async getCategories(): Promise<Category[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/products/categories`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.categories;
  },

  // --- Warehouses & Locations ---
  async getWarehouses(): Promise<Warehouse[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/warehouses`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.warehouses;
  },

  async createWarehouse(data: { name: string; code: string; address?: string }): Promise<Warehouse> {
    const res = await apiFetch(`${API_BASE_URL}/warehouses`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create warehouse' }));
      throw new Error(err.detail || 'Failed to create warehouse');
    }
    return await res.json();
  },

  async updateWarehouse(id: number, data: { name?: string; code?: string; address?: string }): Promise<Warehouse> {
    const res = await apiFetch(`${API_BASE_URL}/warehouses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update warehouse' }));
      throw new Error(err.detail || 'Failed to update warehouse');
    }
    return await res.json();
  },

  async getLocations(warehouseId?: number): Promise<Location[]> {
    const url = warehouseId ? `${API_BASE_URL}/warehouses/locations?warehouse_id=${warehouseId}` : `${API_BASE_URL}/warehouses/locations`;
    try {
      const res = await apiFetch(url);
      if (res.ok) return await res.json();
    } catch { }
    const locs = mockStore.warehouses.flatMap(w => w.locations);
    return warehouseId ? locs.filter(l => l.warehouse_id === warehouseId) : locs;
  },

  async createLocation(data: { warehouse_id: number; name: string; code: string }): Promise<Location> {
    const res = await apiFetch(`${API_BASE_URL}/warehouses/locations`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create location' }));
      throw new Error(err.detail || 'Failed to create location');
    }
    return await res.json();
  },

  async updateLocation(id: number, data: { warehouse_id?: number; name?: string; code?: string }): Promise<Location> {
    const res = await apiFetch(`${API_BASE_URL}/warehouses/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update location' }));
      throw new Error(err.detail || 'Failed to update location');
    }
    return await res.json();
  },

  // --- Receipts ---
  async getReceipts(): Promise<Receipt[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.receipts;
  },

  async getReceipt(receiptId: number): Promise<Receipt> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts/${receiptId}`);
      if (res.ok) return await res.json();
    } catch { }
    const rec = mockStore.receipts.find(r => r.id === receiptId);
    if (!rec) throw new Error('Receipt not found');
    return rec;
  },

  async createReceipt(receiptData: any): Promise<Receipt> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts`, {
        method: 'POST',
        body: JSON.stringify(receiptData)
      });
      if (res.ok) return await res.json();
    } catch { }

    const newId = mockStore.receipts.length + 1;
    const newReceipt: Receipt = {
      id: newId,
      receipt_number: `REC-${new Date().getFullYear()}-${String(newId).padStart(4, '0')}`,
      supplier_name: receiptData.supplier_name,
      status: 'DRAFT',
      receipt_date: receiptData.receipt_date || new Date().toISOString(),
      notes: receiptData.notes || '',
      created_at: new Date().toISOString(),
      items: receiptData.items.map((item: any, idx: number) => {
        const prod = mockStore.products.find(p => p.id === Number(item.product_id));
        return {
          id: idx + 1,
          product_id: Number(item.product_id),
          product_name: prod?.name || '',
          product_sku: prod?.sku || '',
          location_id: Number(item.location_id),
          location_name: 'Designated Location',
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost) || 0
        };
      })
    };
    mockStore.receipts.unshift(newReceipt);
    return newReceipt;
  },

  async validateReceipt(receiptId: number): Promise<Receipt> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts/${receiptId}/validate`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Validation failed');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }

    // Mock fallback: only validate if READY
    const receipt = mockStore.receipts.find(r => r.id === receiptId);
    if (!receipt) throw new Error('Receipt not found');
    if (receipt.status !== 'READY') throw new Error(`Receipt must be READY to validate. Current: ${receipt.status}`);
    receipt.status = 'DONE';
    receipt.validated_at = new Date().toISOString();

    for (const item of receipt.items) {
      const prod = mockStore.products.find(p => p.id === item.product_id);
      if (prod) {
        let level = prod.stock_levels.find(sl => sl.location_id === item.location_id);
        if (!level) {
          level = {
            id: prod.stock_levels.length + 1,
            location_id: item.location_id,
            location_code: 'LOC',
            location_name: item.location_name || 'Warehouse Location',
            quantity_on_hand: 0,
            reserved_quantity: 0
          };
          prod.stock_levels.push(level);
        }
        level.quantity_on_hand += item.quantity;
        mockStore.recalcProductStock(prod.id);

        mockStore.ledger.unshift({
          id: mockStore.ledger.length + 1,
          timestamp: new Date().toISOString(),
          product_id: prod.id,
          product_name: prod.name,
          product_sku: prod.sku,
          location_id: item.location_id,
          location_name: level.location_name,
          change_qty: item.quantity,
          balance_after: level.quantity_on_hand,
          action_type: 'RECEIPT',
          reference_doc_type: 'Receipt',
          reference_doc_number: receipt.receipt_number,
          user_email: 'admin@stocksense.io',
          notes: `Receipt validated from ${receipt.supplier_name}`
        });
      }
    }
    return receipt;
  },

  async markReceiptReady(receiptId: number): Promise<Receipt> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts/${receiptId}/mark_ready`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to mark ready');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }
    // Mock fallback
    const receipt = mockStore.receipts.find(r => r.id === receiptId);
    if (!receipt) throw new Error('Receipt not found');
    if (receipt.status !== 'DRAFT') throw new Error(`Only DRAFT receipts can be marked Ready. Current: ${receipt.status}`);
    receipt.status = 'READY';
    return receipt;
  },

  async cancelReceipt(receiptId: number): Promise<Receipt> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/receipts/${receiptId}/cancel`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to cancel receipt');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }
    // Mock fallback
    const receipt = mockStore.receipts.find(r => r.id === receiptId);
    if (!receipt) throw new Error('Receipt not found');
    if (receipt.status === 'DONE') throw new Error('Cannot cancel a completed receipt');
    receipt.status = 'CANCELLED';
    return receipt;
  },

  // --- Deliveries ---
  async getDeliveries(): Promise<Delivery[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.deliveries;
  },

  async getDelivery(deliveryId: number): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}`);
      if (res.ok) return await res.json();
    } catch { }
    const del = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!del) throw new Error('Delivery not found');
    return del;
  },

  async createDelivery(deliveryData: any): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries`, {
        method: 'POST',
        body: JSON.stringify(deliveryData)
      });
      if (res.ok) return await res.json();
    } catch { }

    const newId = mockStore.deliveries.length + 1;
    const newDelivery: Delivery = {
      id: newId,
      delivery_number: `DEL-${new Date().getFullYear()}-${String(newId).padStart(4, '0')}`,
      customer_name: deliveryData.customer_name,
      status: 'DRAFT',
      delivery_date: deliveryData.delivery_date || new Date().toISOString(),
      shipping_address: deliveryData.shipping_address,
      notes: deliveryData.notes || '',
      created_at: new Date().toISOString(),
      items: deliveryData.items.map((item: any, idx: number) => {
        const prod = mockStore.products.find(p => p.id === Number(item.product_id));
        return {
          id: idx + 1,
          product_id: Number(item.product_id),
          product_name: prod?.name || '',
          product_sku: prod?.sku || '',
          location_id: Number(item.location_id),
          location_name: 'Pick Location',
          quantity: Number(item.quantity)
        };
      })
    };
    mockStore.deliveries.unshift(newDelivery);
    return newDelivery;
  },

  async updateDeliveryStatus(deliveryId: number, status: string): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}/status?new_status=${status}`, {
        method: 'PUT'
      });
      if (res.ok) return await res.json();
    } catch { }

    const delivery = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    delivery.status = status as any;
    return delivery;
  },

  async checkDeliveryAvailability(deliveryId: number): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}/check_availability`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Availability check failed');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }
    // Mock fallback: check if all items have stock
    const delivery = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    let allAvailable = true;
    for (const item of delivery.items) {
      const prod = mockStore.products.find(p => p.id === item.product_id);
      const totalStock = prod?.total_stock ?? 0;
      if (totalStock < item.quantity) { allAvailable = false; break; }
    }
    delivery.status = allAvailable ? 'READY' : 'WAITING';
    return delivery;
  },

  async markDeliveryReady(deliveryId: number): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}/mark_ready`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to mark delivery ready');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }
    // Mock fallback
    const delivery = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    delivery.status = 'READY';
    return delivery;
  },

  async cancelDelivery(deliveryId: number): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}/cancel`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to cancel delivery');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }
    // Mock fallback
    const delivery = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    if (delivery.status === 'DONE') throw new Error('Cannot cancel a completed delivery');
    delivery.status = 'CANCELLED';
    return delivery;
  },

  async validateDelivery(deliveryId: number): Promise<Delivery> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/deliveries/${deliveryId}/validate`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Validation failed');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }

    // Mock fallback: only validate if READY
    const delivery = mockStore.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    if (delivery.status !== 'READY') throw new Error(`Delivery must be READY to validate. Current: ${delivery.status}`);

    for (const item of delivery.items) {
      const prod = mockStore.products.find(p => p.id === item.product_id);
      if (prod) {
        const level = prod.stock_levels.find(sl => sl.location_id === item.location_id);
        if (level) {
          level.quantity_on_hand = Math.max(0, level.quantity_on_hand - item.quantity);
          mockStore.recalcProductStock(prod.id);

          mockStore.ledger.unshift({
            id: mockStore.ledger.length + 1,
            timestamp: new Date().toISOString(),
            product_id: prod.id,
            product_name: prod.name,
            product_sku: prod.sku,
            location_id: item.location_id,
            location_name: level.location_name,
            change_qty: -item.quantity,
            balance_after: level.quantity_on_hand,
            action_type: 'DELIVERY',
            reference_doc_type: 'Delivery',
            reference_doc_number: delivery.delivery_number,
            user_email: 'admin@stocksense.io',
            notes: `Delivery dispatched to ${delivery.customer_name}`
          });
        }
      }
    }

    delivery.status = 'DONE';
    delivery.validated_at = new Date().toISOString();
    return delivery;
  },

  // --- Internal Transfers ---
  async getTransfers(): Promise<InternalTransfer[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/transfers`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.transfers;
  },

  async createTransfer(transferData: any): Promise<InternalTransfer> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/transfers`, {
        method: 'POST',
        body: JSON.stringify(transferData)
      });
      if (res.ok) return await res.json();
    } catch { }

    const newId = mockStore.transfers.length + 1;
    const newTransfer: InternalTransfer = {
      id: newId,
      transfer_number: `TRF-${new Date().getFullYear()}-${String(newId).padStart(4, '0')}`,
      source_location_id: Number(transferData.source_location_id),
      dest_location_id: Number(transferData.dest_location_id),
      status: 'SCHEDULED',
      scheduled_date: transferData.scheduled_date || new Date().toISOString(),
      notes: transferData.notes || '',
      created_at: new Date().toISOString(),
      items: transferData.items.map((item: any, idx: number) => {
        const prod = mockStore.products.find(p => p.id === Number(item.product_id));
        return {
          id: idx + 1,
          product_id: Number(item.product_id),
          product_name: prod?.name || '',
          product_sku: prod?.sku || '',
          quantity: Number(item.quantity)
        };
      })
    };
    mockStore.transfers.unshift(newTransfer);
    return newTransfer;
  },

  async completeTransfer(transferId: number): Promise<InternalTransfer> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/transfers/${transferId}/complete`, {
        method: 'POST'
      });
      if (res.ok) return await res.json();
    } catch { }

    const transfer = mockStore.transfers.find(t => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found');

    for (const item of transfer.items) {
      const prod = mockStore.products.find(p => p.id === item.product_id);
      if (prod) {
        let srcLevel = prod.stock_levels.find(sl => sl.location_id === transfer.source_location_id);
        let destLevel = prod.stock_levels.find(sl => sl.location_id === transfer.dest_location_id);

        if (srcLevel) {
          srcLevel.quantity_on_hand = Math.max(0, srcLevel.quantity_on_hand - item.quantity);
        }
        if (!destLevel) {
          destLevel = {
            id: prod.stock_levels.length + 1,
            location_id: transfer.dest_location_id,
            location_code: 'DEST',
            location_name: 'Destination Location',
            quantity_on_hand: 0,
            reserved_quantity: 0
          };
          prod.stock_levels.push(destLevel);
        }
        destLevel.quantity_on_hand += item.quantity;

        // Invariant: total stock unchanged!
        mockStore.recalcProductStock(prod.id);

        // Ledger Transfer Out
        mockStore.ledger.unshift({
          id: mockStore.ledger.length + 1,
          timestamp: new Date().toISOString(),
          product_id: prod.id,
          product_name: prod.name,
          product_sku: prod.sku,
          location_id: transfer.source_location_id,
          location_name: srcLevel?.location_name || 'Source',
          change_qty: -item.quantity,
          balance_after: srcLevel?.quantity_on_hand || 0,
          action_type: 'TRANSFER_OUT',
          reference_doc_type: 'Transfer',
          reference_doc_number: transfer.transfer_number,
          user_email: 'admin@stocksense.io',
          notes: `Transferred to destination location`
        });

        // Ledger Transfer In
        mockStore.ledger.unshift({
          id: mockStore.ledger.length + 1,
          timestamp: new Date().toISOString(),
          product_id: prod.id,
          product_name: prod.name,
          product_sku: prod.sku,
          location_id: transfer.dest_location_id,
          location_name: destLevel.location_name,
          change_qty: item.quantity,
          balance_after: destLevel.quantity_on_hand,
          action_type: 'TRANSFER_IN',
          reference_doc_type: 'Transfer',
          reference_doc_number: transfer.transfer_number,
          user_email: 'admin@stocksense.io',
          notes: `Transferred from source location`
        });
      }
    }

    transfer.status = 'COMPLETED';
    transfer.completed_at = new Date().toISOString();
    return transfer;
  },

  // --- Adjustments ---
  async getAdjustments(): Promise<StockAdjustment[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/adjustments`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.adjustments;
  },

  async createAdjustment(adjData: any): Promise<StockAdjustment> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/adjustments`, {
        method: 'POST',
        body: JSON.stringify(adjData)
      });
      if (res.ok) return await res.json();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to record adjustment');
      }
    } catch (e: any) {
      if (e && !isNetworkOrTimeoutError(e)) throw e;
    }

    const prod = mockStore.products.find(p => p.id === Number(adjData.product_id));
    let level = prod?.stock_levels.find(sl => sl.location_id === Number(adjData.location_id));
    const recorded = level ? level.quantity_on_hand : 0;
    const counted = Number(adjData.counted_qty);
    const diff = counted - recorded;

    const newId = mockStore.adjustments.length + 1;
    const adjNum = `ADJ-${new Date().getFullYear()}-${String(newId).padStart(4, '0')}`;

    const newAdj: StockAdjustment = {
      id: newId,
      adjustment_number: adjNum,
      product_id: Number(adjData.product_id),
      product_name: prod?.name || '',
      product_sku: prod?.sku || '',
      location_id: Number(adjData.location_id),
      location_name: level?.location_name || 'Storage Zone',
      recorded_qty: recorded,
      counted_qty: counted,
      diff_qty: diff,
      reason: adjData.reason,
      notes: adjData.notes || '',
      adjusted_by: 'Alex Morgan',
      created_at: new Date().toISOString()
    };

    mockStore.adjustments.unshift(newAdj);

    if (prod) {
      if (!level) {
        level = {
          id: prod.stock_levels.length + 1,
          location_id: Number(adjData.location_id),
          location_code: 'ADJ-LOC',
          location_name: 'Storage Zone',
          quantity_on_hand: 0,
          reserved_quantity: 0
        };
        prod.stock_levels.push(level);
      }
      level.quantity_on_hand = counted;
      mockStore.recalcProductStock(prod.id);

      mockStore.ledger.unshift({
        id: mockStore.ledger.length + 1,
        timestamp: new Date().toISOString(),
        product_id: prod.id,
        product_name: prod.name,
        product_sku: prod.sku,
        location_id: Number(adjData.location_id),
        location_name: level.location_name,
        change_qty: diff,
        balance_after: counted,
        action_type: 'ADJUSTMENT',
        reference_doc_type: 'Adjustment',
        reference_doc_number: adjNum,
        user_email: 'admin@stocksense.io',
        notes: `Physical reconciliation (${adjData.reason})`
      });
    }

    return newAdj;
  },

  // --- Stock Ledger ---
  async getLedger(): Promise<StockLedgerEntry[]> {
    try {
      const res = await apiFetch(`${API_BASE_URL}/ledger`);
      if (res.ok) return await res.json();
    } catch { }
    return mockStore.ledger;
  }
};
