import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { CategoryStock } from '../../types';

interface StockLevelChartProps {
  data: CategoryStock[];
}

export const StockLevelChart: React.FC<StockLevelChartProps> = ({ data }) => {
  const renderCustomTick = ({ x, y, payload }: any) => {
    const text = String(payload?.value || '');
    const words = text.split(' ');
    let line1 = text;
    let line2 = '';

    if (words.length > 1 && text.length > 10) {
      const mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fill="#64748b"
          fontSize={11}
        >
          <tspan x={0} dy={12}>{line1}</tspan>
          {line2 && <tspan x={0} dy={14}>{line2}</tspan>}
        </text>
      </g>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Inventory by Category</h4>
          <p className="text-xs text-slate-500">Total units stored per merchandise group</p>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="category_name"
              stroke="#64748b"
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              interval={0}
              height={42}
              tick={renderCustomTick}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
              }}
              formatter={(val: any) => [`${val} Units`, 'Quantity']}
            />
            <Bar dataKey="total_quantity" fill="#059669" radius={[3, 3, 0, 0]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
