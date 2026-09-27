# StockSense — Modern Inventory & Warehouse Management

StockSense is an intuitive, enterprise-grade inventory management platform designed to replace manual tracking and spreadsheets with a single, reliable system. It gives businesses real-time visibility and control over stock levels, warehouse facilities, procurement receiving, customer order fulfillment, and internal inventory movements.

---

## 🌟 Why StockSense?

- **Real-Time Accuracy**: Always know exactly how many units you have, where they are stored, and what is reserved for orders.
- **Multi-Warehouse Control**: Manage multiple distribution depots, warehouses, zones, and individual storage racks seamlessly.
- **Guided Workflows**: Clear, step-by-step progress tracking for incoming shipments, customer deliveries, and inter-facility transfers.
- **Stock Integrity & Traceability**: Every single stock movement is permanently recorded in a comprehensive audit log.
- **Role-Based Access**: Specialized interfaces and permissions for Inventory Managers and Warehouse Staff.
- **Reorder & Safety Alerts**: Automated notifications when inventory levels dip below minimum thresholds, with one-click purchase replenishment.

---

## 👥 User Roles & Permissions

StockSense provides tailored experiences based on operational responsibilities:

| Role | Key Capabilities |
| :--- | :--- |
| **Inventory Manager** | Full access to product master data (creating SKUs, pricing, reorder rules), warehouse configuration, stock adjustments, executive KPI analytics, and complete operational oversight. |
| **Warehouse Staff** | Focused on day-to-day warehouse operations: receiving inbound shipments, picking and fulfilling customer delivery orders, scheduling and executing internal transfers, shelf counts, and checking stock availability. |

---

## 📦 Key Platform Features

### 1. Account Access & Password Recovery
- **Secure Authentication**: Simple and fast login for team members.
- **Self-Service Password Reset**: Secure 6-digit verification code (OTP) sent directly to your registered email to reset forgotten passwords without administrator intervention.
- **Active User Profile**: View account details, assigned organizational role, and session status anytime.

### 2. Operations & Executive Dashboard
- **Instant Health Metrics**: At-a-glance cards showing Total Products, Low-Stock items, Out-of-Stock warnings, Pending Inbound Receipts, Pending Customer Deliveries, and Scheduled Internal Transfers.
- **Visual Analytics**: Interactive charts showing stock breakdown by product category and movement velocity trends over time.
- **Critical Stock Table**: Direct overview of products requiring attention, featuring one-click shortcuts to initiate vendor replenishment.

### 3. Product Catalog Management
- **Centralized SKU Database**: Maintain standardized product codes, descriptions, categories, units of measure (Units, Boxes, Kilograms, Liters, etc.), and unit prices.
- **Safety Stock Rules**: Set minimum alert buffers and recommended reorder quantities per product to prevent stockouts.
- **Multi-Location Availability**: View stock distribution across warehouses and specific racks for each catalog item.
- **Fast Search**: Instant, case-insensitive search by product title or SKU, combined with category and stock status filters (`In Stock`, `Low Stock`, `Out of Stock`).

### 4. Dedicated Stock View
- **Facility-Wide Inventory Visibility**: Browse detailed stock rows showing On Hand, Reserved, and Free-to-Use inventory for every product-location pairing.
- **Smart Sorting & Filtering**: Sort by product name, available quantity, or inventory valuation. Filter by warehouse facility, category, or stock condition.
- **Quick Adjustment Shortcut**: Initiate physical cycle counts directly from any stock line.

### 5. Warehouse & Storage Zones
- **Multi-Facility Hierarchy**: Organize operations across central logistics hubs, regional depots, and fulfillment centers.
- **Granular Storage Locations**: Define specific storage zones, high-velocity racks, receiving docks, bulk storage bays, outbound dispatch areas, and sensitive storage locations.
- **Facility Metadata**: Keep track of warehouse codes, physical addresses, and active storage capacities.

### 6. Inbound Receipts (Receiving Goods)
- **Supplier Shipments**: Log purchase receipts with vendor details, expected delivery dates, and designated receiving bays.
- **Structured Receiving Workflow**:
  - `Draft`: Staged for review or pending vendor dispatch.
  - `Ready`: Goods arrived at the dock, ready for physical receiving inspection.
  - `Done`: Quantities verified, stock credited to inventory, and ledger updated.
- **List & Kanban Views**: Toggle between compact tables and drag-friendly visual pipeline boards.
- **Printable Receiving Documents**: Generate standardized receiving slips for paperless or physical verification.

### 7. Outbound Deliveries (Fulfillment & Shipping)
- **Customer Orders**: Track sales orders with customer names, delivery destinations, and ordered line items.
- **Automated Availability Checking**: The system automatically checks stock levels before fulfillment:
  - If all items are on hand, orders advance to `Ready`.
  - If any item is insufficient, orders move to `Waiting for Stock` so procurement can replenish.
- **Fulfillment Workflow**: `Draft` &rarr; `Waiting` &rarr; `Ready to Deliver` &rarr; `Done (Dispatched)`.
- **Accurate Stock Deduction**: Dispatched deliveries deduct inventory directly from designated pick locations.
- **Printable Packing Lists**: One-click generation of professional customer delivery notes.

### 8. Internal Stock Transfers
- **Relocating Goods**: Move products between warehouses, aisles, or racks to balance inventory or prepare for assembly.
- **Guaranteed Conservation**: Moving items from Location A to Location B updates balances atomically, ensuring company-wide stock totals remain strictly conserved.
- **Clear Transfer Lifecycle**:
  - `Draft`: Prepared transfer pending scheduling.
  - `Scheduled`: Staged for transit or scheduled for a specific date.
  - `Completed`: Goods relocated, source debited, destination credited, and ledger audited.
- **Flexible Management**: Cancel planned transfers before execution if needs change. Completed transfers remain locked and immutable.
- **List & Kanban Boards**: Visualize planned moves across visual columns with quick actions on each card.

### 9. Stock Adjustments & Physical Audits
- **Cycle Counts**: Reconcile actual physical shelf counts with system numbers.
- **Automatic Variance Calculation**: Enter physical counts to instantly view the calculated difference ($\Delta = \text{Counted} - \text{Recorded}$).
- **Audit Reasons**: Record standardized reasons for count changes (e.g., Routine Shelf Audit, Damaged Goods, Found Stock, Inventory Shrinkage).
- **Immediate Rebalancing**: Approved adjustments update on-hand quantities immediately and post an audit record.

### 10. Immutable Stock Movement Ledger
- **Digital Audit Trail**: A complete, unalterable log of every single unit added, deducted, or moved.
- **Comprehensive Details**: Each entry logs timestamp, product name, SKU, warehouse location, quantity change (+/-), balance after change, action type, reference document number, and responsible team member.
- **Multi-Filter Inspection**: Filter history by action type (`Receipt`, `Delivery`, `Transfer In`, `Transfer Out`, `Adjustment`) or search by document reference.

---

## 🧭 How to Use StockSense: Common Workflows

### Scenario A: Receiving New Inventory from a Supplier
1. Navigate to **Receipts (Inbound)** from the sidebar menu.
2. Click **New Inbound Receipt** and enter the supplier name, expected date, and storage location.
3. Add the incoming items and quantities, then click **Save Receipt**.
4. When the shipment arrives at your dock, open the receipt and click **Mark as Ready**.
5. Once inspected and unloaded, click **Validate & Receive Goods**. The items are immediately added to available inventory.

### Scenario B: Fulfilling a Customer Order
1. Navigate to **Deliveries (Outbound)**.
2. Click **New Delivery Order** and fill in customer information and items requested.
3. Click **Check Availability**. StockSense verifies whether all items are in stock.
4. When stock is confirmed, click **Validate & Dispatch**. Quantities are deducted from inventory, and a packing note is ready to print.

### Scenario C: Moving Stock Between Warehouses
1. Navigate to **Internal Transfers**.
2. Click **New Internal Transfer**, select the origin location and target location, and add the items to relocate.
3. Save as **Draft** or **Schedule** for an upcoming shift.
4. When physical goods have been transported to the new location, click **Execute & Complete**.

### Scenario D: Performing a Shelf Count Audit
1. Navigate to **Stock Adjustments**.
2. Click **New Stock Adjustment**, select the product and the specific warehouse location.
3. The system shows the currently recorded stock. Enter the actual physical count you observed on the shelf.
4. Choose an audit reason (e.g., "Routine Physical Audit") and click **Submit Adjustment**.

---

## 💻 Technology Stack

StockSense is built with modern, dependable web technologies:

- **Frontend Interface**: React, TypeScript, Vite, Tailwind CSS, Lucide Icons, and Recharts.
- **Backend Application**: Python FastAPI delivering high-speed, transactional REST services.
- **Data & Storage**: Relational database (PostgreSQL / SQLite) with transactional ACID guarantees and relational data integrity.

---
