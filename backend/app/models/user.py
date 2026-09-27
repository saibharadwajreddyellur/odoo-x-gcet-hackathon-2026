from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="inventory_manager")  # admin, inventory_manager, warehouse_staff
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Profile picture stored as base64 data-URL string (<=200 KB upload limit enforced at API layer)
    avatar_b64 = Column(Text, nullable=True)

    # Rate-limit: track last successful name change (30-day cooldown)
    name_changed_at = Column(DateTime, nullable=True)

    # Relationships
    ledger_entries = relationship("StockLedger", back_populates="user")
