# StockSense — Enterprise Inventory & Warehouse Management System

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat&logo=react)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![SQLAlchemy](https://img.shields.io/badge/ORM-SQLAlchemy%202.0-D71F00?style=flat)](https://www.sqlalchemy.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)

**StockSense** replaces manual registers and spreadsheet errors with a centralized, enterprise-grade Inventory Management System. It features real-time stock balance tracking across multi-facility warehouse hierarchies, pick-and-pack fulfillment flows, physical audit reconciliations, and an immutable double-entry stock ledger.

---

## 🌟 Key Modules & Features

### 1. Authentication & Security
- User Sign up, Login, and Session management.
- **OTP-based password reset** workflow with code verification.
- Direct redirection to the executive dashboard upon authentication.
- Demo login shortcut for instant hackathon evaluation.

### 2. Executive Dashboard
- **6 Core KPI Metric Cards**:
  - Total Products in Stock
  - Low-Stock items (operating below safety thresholds)
  - Out-of-Stock items (zero units available)
  - Pending Inbound Receipts
  - Pending Outbound Deliveries
  - Scheduled Internal Transfers
- **Analytical Charts**:
  - *Inventory by Category* Bar Chart (Recharts)
  - *Movement Velocity* Area Chart (Inbound Receipts vs Outbound Deliveries)
- **Active Filters**: Filter across document type, status, warehouse/location, and category.
- **Critical Stock & Reorder Alerts Table**: Direct one-click "Create Receipt" action for low stock items.

### 3. Product Catalog & Reordering
- Manage product names, SKU codes, categories, units of measure (Units, Boxes, Kg, etc.), and unit costs.
- Initial stock allocation to specific warehouse locations during creation.
- Multi-location stock availability view.
- Automated reorder rules: **Minimum Alert Buffer** and **Suggested Reorder Quantity**.

### 4. Inbound Receipts (Procurement)
- Create draft receipts with supplier information and line items.
- Target designated warehouse racks or staging docks.
- **Validate Receipt Action**: Atomically credits inventory to the target location and writes double-entry records to the stock ledger.

### 5. Outbound Deliveries & Fulfillment
- Customer shipment orders with delivery address and line items.
- Stage-based fulfillment workflow: **Draft &rarr; Picking &rarr; Packing &rarr; Validated/Dispatched**.
- **Automated Stock Deduction**: Validating a delivery verifies inventory availability and deducts quantities.

### 6. Internal Warehouse Transfers
- Move physical inventory between distinct warehouses, zones, or aisle racks.
- **Stock Conservation Invariant**: $\Delta\text{Source} = -Q, \Delta\text{Destination} = +Q \implies \Delta\text{TotalCompanyStock} = 0$.
- Simultaneously logs `TRANSFER_OUT` and `TRANSFER_IN` audit records.

### 7. Physical Stock Adjustments
- Select product and storage location to inspect recorded system quantity.
- Enter physical cycle count with automatic discrepancy calculation ($\Delta = \text{Counted} - \text{Recorded}$).
- Updates stock level immediately and logs variance reasons (e.g. Damage, Found Stock, Shrinkage).

### 8. Immutable Stock Ledger
- Complete transaction log tracking every unit movement with:
  - Timestamp, Product Name & SKU, Location & Warehouse, Quantity Change (+/-), Balance After, Action Type, Reference Document #, and User.
  - Multi-criteria search and filter by Action Type (Receipt, Delivery, Transfer In/Out, Adjustment, Initial).

### 9. Warehouses & Locations
- Multi-facility hierarchy showing warehouses, codes, addresses, and individual storage locations/bays.

---

## 🏗️ System Architecture

```plaintext
React (Vite + TypeScript + Tailwind)
        │
        ▼ (REST API / JSON / JWT)
FastAPI Backend (Python 3.10+)
        │
        ▼ (Atomic Transactions & Ledger Logging)
SQLAlchemy 2.0 ORM Models
        │
        ▼ (Connection Pooling / SSL)
Supabase (PostgreSQL 15+)
```

---

## 🚀 Quickstart — Running Locally

### Prerequisites
- **Node.js** (v18+)
- **Python** (v3.10+)

---

### Step 1: Clone or Navigate to the Project

```bash
cd stocksense
```

---

### Step 2: Configure Environment Variables

StockSense includes `.env.example` templates at root, backend, and frontend.

1. **Root Configuration**:
   ```bash
   cp .env.example .env
   ```
2. **Backend Configuration**:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. **Frontend Configuration**:
   ```bash
   cp frontend/.env.example frontend/.env
   ```

> **Note on Database**:
> - If you have a **Supabase PostgreSQL** instance, set `DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`.
> - If PostgreSQL is not yet configured or offline, StockSense **automatically falls back to a local SQLite database (`stocksense.db`)**, seeding demo data and working out-of-the-box!

---

### Step 3: Start the Backend (FastAPI)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows PowerShell:
venv\Scripts\Activate.ps1
# Or Windows CMD:
# venv\Scripts\activate.bat
# Or Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive Swagger API Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

### Step 4: Start the Frontend (React + Vite)

In a separate terminal:

```bash
cd frontend

# Install frontend packages (Tailwind, Lucide, Recharts)
npm install

# Start Vite development server
npm run dev
```

Open your browser at: **`http://localhost:5173`**

---

## 🔑 Default Credentials for Testing

- **Email**: `admin@stocksense.io`
- **Password**: `admin123`
- *Alternatively, click the **"Quick Demo Login"** button on the sign-in screen.*

---

## 🗄️ Database Tables Overview

| Table | Purpose |
|---|---|
| `users` | User credentials, roles, and profiles |
| `categories` | Product grouping classifications |
| `warehouses` | Distribution centers and facility branches |
| `locations` | Specific racks, aisles, docks, or cold storage bays |
| `products` | SKU master data, UoM, alert thresholds, reorder amounts |
| `stock_levels` | Quantity on hand & reserved quantity per product & location |
| `receipts` | Inbound vendor shipments |
| `receipt_items` | Individual line items and costs for inbound receipts |
| `deliveries` | Customer outbound delivery orders with pick/pack stages |
| `delivery_items` | Products and quantities dispatched |
| `internal_transfers` | Inter-location stock movements |
| `transfer_items` | Products and quantities moved between locations |
| `stock_adjustments` | Physical count audit variances and reasons |
| `stock_ledger` | Immutable audit trail of every stock modification |

---
