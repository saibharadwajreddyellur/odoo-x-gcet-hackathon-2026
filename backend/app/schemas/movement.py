from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from decimal import Decimal


# --- Receipts ---
class ReceiptItemCreate(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    unit_cost: Optional[Decimal] = Decimal("0.00")


class ReceiptItemOut(ReceiptItemCreate):
    id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    location_name: Optional[str] = None

    class Config:
        from_attributes = True


class ReceiptCreate(BaseModel):
    supplier_name: str
    receipt_date: Optional[datetime] = None
    scheduled_date: Optional[datetime] = None
    responsible_user_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[ReceiptItemCreate]


class ReceiptUpdate(BaseModel):
    supplier_name: Optional[str] = None
    receipt_date: Optional[datetime] = None
    scheduled_date: Optional[datetime] = None
    responsible_user_id: Optional[int] = None
    notes: Optional[str] = None
    items: Optional[List[ReceiptItemCreate]] = None


class ReceiptOut(BaseModel):
    id: int
    receipt_number: str
    supplier_name: str
    status: str
    receipt_date: datetime
    scheduled_date: Optional[datetime] = None
    responsible_user_id: Optional[int] = None
    responsible_user_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    validated_at: Optional[datetime] = None
    items: List[ReceiptItemOut] = []

    class Config:
        from_attributes = True


# --- Deliveries ---
class DeliveryItemCreate(BaseModel):
    product_id: int
    location_id: int
    quantity: int


class DeliveryItemOut(DeliveryItemCreate):
    id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    location_name: Optional[str] = None

    class Config:
        from_attributes = True


class DeliveryCreate(BaseModel):
    customer_name: str
    delivery_date: Optional[datetime] = None
    scheduled_date: Optional[datetime] = None
    responsible_user_id: Optional[int] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    items: List[DeliveryItemCreate]


class DeliveryOut(BaseModel):
    id: int
    delivery_number: str
    customer_name: str
    status: str
    delivery_date: datetime
    scheduled_date: Optional[datetime] = None
    responsible_user_id: Optional[int] = None
    responsible_user_name: Optional[str] = None
    shipping_address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    validated_at: Optional[datetime] = None
    items: List[DeliveryItemOut] = []

    class Config:
        from_attributes = True


# --- Internal Transfers ---
class TransferItemCreate(BaseModel):
    product_id: int
    quantity: int


class TransferItemOut(TransferItemCreate):
    id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None

    class Config:
        from_attributes = True


class TransferCreate(BaseModel):
    source_location_id: int
    dest_location_id: int
    scheduled_date: Optional[datetime] = None
    status: Optional[str] = "DRAFT"
    notes: Optional[str] = None
    items: List[TransferItemCreate]


class TransferOut(BaseModel):
    id: int
    transfer_number: str
    source_location_id: int
    source_location_name: Optional[str] = None
    dest_location_id: int
    dest_location_name: Optional[str] = None
    status: str
    scheduled_date: datetime
    notes: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    items: List[TransferItemOut] = []

    class Config:
        from_attributes = True


# --- Stock Adjustments ---
class AdjustmentCreate(BaseModel):
    product_id: int
    location_id: int
    counted_qty: int
    reason: str
    notes: Optional[str] = None
    adjusted_by: Optional[str] = None


class AdjustmentOut(BaseModel):
    id: int
    adjustment_number: str
    product_id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    location_id: int
    location_name: Optional[str] = None
    recorded_qty: int
    counted_qty: int
    diff_qty: int
    reason: str
    notes: Optional[str] = None
    adjusted_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
