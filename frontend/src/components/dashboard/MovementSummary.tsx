import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';

import { MovementTrend } from '../../types';

interface MovementSummaryProps {
  trends?: MovementTrend[];
}

export const MovementSummary: React.FC<MovementSummaryProps> = ({ trends }) => {
  const chartData = (trends && trends.length > 0)
    ? trends.map(t => ({
        day: t.date,
        receipts: t.receipts,
        deliveries: t.deliveries,
        transfers: t.transfers
      }))
    : [
        { day: 'Mon', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Tue', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Wed', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Thu', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Fri', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Sat', receipts: 0, deliveries: 0, transfers: 0 },
        { day: 'Sun', receipts: 0, deliveries: 0, transfers: 0 },
      ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Inventory Movement Velocity</h4>
          <p className="text-xs text-slate-500">Real-time inbound receipts vs outbound deliveries (Last 7 Days)</p>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
              }}
            />
            <Legend verticalAlign="top" height={36} iconType="plainline" />
            <Area
              type="monotone"
              dataKey="receipts"
              name="Receipts (Inbound)"
              stroke="#059669"
              fill="#059669"
              fillOpacity={0.08}
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="deliveries"
              name="Deliveries (Outbound)"
              stroke="#334155"
              fill="#334155"
              fillOpacity={0.08}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
