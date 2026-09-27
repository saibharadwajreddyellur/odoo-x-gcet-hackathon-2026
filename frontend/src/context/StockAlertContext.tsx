import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Product } from '../types';

export interface StockAlertCounts {
  lowStockCount: number;
  outOfStockCount: number;
  totalAttentionCount: number;
}

export function calculateStockAlerts(products: Product[]): StockAlertCounts {
  let lowStockCount = 0;
  let outOfStockCount = 0;

  products.forEach((p) => {
    if (p.stock_levels && p.stock_levels.length > 0) {
      p.stock_levels.forEach((sl) => {
        const onHand = Number(sl.quantity_on_hand) || 0;
        if (onHand === 0) {
          outOfStockCount += 1;
        } else if (onHand <= p.min_stock_alert) {
          lowStockCount += 1;
        }
      });
    } else {
      const onHand = Number(p.total_stock) || 0;
      if (onHand === 0) {
        outOfStockCount += 1;
      } else if (onHand <= p.min_stock_alert) {
        lowStockCount += 1;
      }
    }
  });

  return {
    lowStockCount,
    outOfStockCount,
    totalAttentionCount: lowStockCount + outOfStockCount
  };
}

interface StockAlertContextType extends StockAlertCounts {
  loading: boolean;
  refreshStockAlerts: () => Promise<void>;
}

const StockAlertContext = createContext<StockAlertContextType>({
  lowStockCount: 0,
  outOfStockCount: 0,
  totalAttentionCount: 0,
  loading: false,
  refreshStockAlerts: async () => {}
});

export const StockAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [counts, setCounts] = useState<StockAlertCounts>({
    lowStockCount: 0,
    outOfStockCount: 0,
    totalAttentionCount: 0
  });
  const [loading, setLoading] = useState(false);

  const refreshStockAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const prods = await api.getProducts();
      const calculated = calculateStockAlerts(prods);
      setCounts(calculated);
    } catch (err) {
      console.error('Failed to load stock alerts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStockAlerts();
  }, [refreshStockAlerts]);

  return (
    <StockAlertContext.Provider
      value={{
        ...counts,
        loading,
        refreshStockAlerts
      }}
    >
      {children}
    </StockAlertContext.Provider>
  );
};

export const useStockAlerts = () => useContext(StockAlertContext);
