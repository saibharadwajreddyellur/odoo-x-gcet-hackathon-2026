export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type MovementAction = 'RECEIPT' | 'DELIVERY' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT' | 'INITIAL';
export type ReceiptStatus = 'DRAFT' | 'READY' | 'DONE' | 'CANCELLED';
export type DeliveryStatus = 'DRAFT' | 'WAITING' | 'READY' | 'DONE' | 'CANCELLED';
export type TransferStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface User {
  id: number;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  avatar_b64?: string | null;
  name_changed_at?: string | null;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
}

export interface Location {
  id: number;
  warehouse_id: number;
  name: string;
  code: string;
  is_active: boolean;
  warehouse_name?: string;
}

export interface Warehouse {
  id: number;
  name: string;
  code: string;
  address?: string;
  is_active: boolean;
  locations: Location[];
}

export interface StockLevel {
  id: number;
  location_id: number;
  location_code?: string;
  location_name?: string;
  warehouse_name?: string;
  quantity_on_hand: number;
  reserved_quantity: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category_id?: number;
  category_name?: string;
  uom: string;
  unit_price: number;
  initial_stock: number;
  min_stock_alert: number;
  reorder_quantity: number;
  description?: string;
  total_stock: number;
  stock_status: StockStatus;
  created_at: string;
  updated_at: string;
  stock_levels: StockLevel[];
}

export interface ReceiptItem {
  id?: number;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  location_id: number;
  location_name?: string;
  quantity: number;
  unit_cost: number;
}

export interface Receipt {
  id: number;
  receipt_number: string;
  supplier_name: string;
  status: ReceiptStatus;
  receipt_date: string;
  scheduled_date?: string;
  responsible_user_id?: number;
  responsible_user_name?: string;
  notes?: string;
  created_at: string;
  validated_at?: string;
  items: ReceiptItem[];
}

export interface DeliveryItem {
  id?: number;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  location_id: number;
  location_name?: string;
  quantity: number;
}

export interface Delivery {
  id: number;
  delivery_number: string;
  customer_name: string;
  status: DeliveryStatus;
  delivery_date: string;
  scheduled_date?: string;
  responsible_user_id?: number;
  responsible_user_name?: string;
  shipping_address?: string;
  notes?: string;
  created_at: string;
  validated_at?: string;
  items: DeliveryItem[];
}

export interface TransferItem {
  id?: number;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  quantity: number;
}

export interface InternalTransfer {
  id: number;
  transfer_number: string;
  source_location_id: number;
  source_location_name?: string;
  dest_location_id: number;
  dest_location_name?: string;
  status: TransferStatus;
  scheduled_date: string;
  notes?: string;
  created_at: string;
  completed_at?: string;
  items: TransferItem[];
}

export interface StockAdjustment {
  id: number;
  adjustment_number: string;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  location_id: number;
  location_name?: string;
  recorded_qty: number;
  counted_qty: number;
  diff_qty: number;
  reason: string;
  notes?: string;
  adjusted_by?: string;
  created_at: string;
}

export interface StockLedgerEntry {
  id: number;
  timestamp: string;
  product_id: number;
  product_name?: string;
  product_sku?: string;
  location_id: number;
  location_name?: string;
  warehouse_name?: string;
  change_qty: number;
  balance_after: number;
  action_type: MovementAction;
  reference_doc_type?: string;
  reference_doc_number?: string;
  user_id?: number;
  user_email?: string;
  notes?: string;
}

export interface DashboardKPI {
  total_products: number;
  total_units_in_stock: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pending_receipts: number;
  pending_deliveries: number;
  scheduled_transfers: number;
  receipts_to_receive?: number;
  deliveries_to_deliver?: number;
  late_operations?: number;
  waiting_operations?: number;
}

export interface CategoryStock {
  category_name: string;
  product_count: number;
  total_quantity: number;
}

export interface MovementTrend {
  date: string;
  receipts: number;
  deliveries: number;
  transfers: number;
}

export interface OperationSummary {
  operation_type: string;
  total_count: number;
  to_process: number;
  late_count: number;
  waiting_count: number;
}

export interface DashboardDocumentItem {
  id: number;
  document_type: string;
  document_number: string;
  status: string;
  partner_or_reference?: string;
  warehouse_id?: number;
  warehouse_name?: string;
  location_id?: number;
  location_name?: string;
  category_id?: number;
  category_name?: string;
  scheduled_date?: string;
  is_late: boolean;
  items_count: number;
  total_quantity: number;
  created_at: string;
}

export interface DashboardSummary {
  kpis: DashboardKPI;
  operation_summaries?: OperationSummary[];
  operations?: DashboardDocumentItem[];
  low_stock_items: Product[];
  category_distribution: CategoryStock[];
  movement_trends?: MovementTrend[];
  recent_movements: StockLedgerEntry[];
}
