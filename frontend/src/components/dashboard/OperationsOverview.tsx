import React from 'react';
import { Truck, Send, ArrowLeftRight, Clock, AlertCircle, ArrowUpRight } from 'lucide-react';
import { OperationSummary } from '../../types';
import { NavTab } from '../common/Sidebar';
import { Badge } from '../common/Badge';

interface OperationsOverviewProps {
  summaries: OperationSummary[];
  onNavigateTab: (tab: NavTab) => void;
}

export const OperationsOverview: React.FC<OperationsOverviewProps> = ({ summaries, onNavigateTab }) => {
  const receiptSummary = summaries.find(s => s.operation_type === 'Receipts') || {
    operation_type: 'Receipts',
    total_count: 0,
    to_process: 0,
    late_count: 0,
    waiting_count: 0
  };

  const deliverySummary = summaries.find(s => s.operation_type === 'Deliveries') || {
    operation_type: 'Deliveries',
    total_count: 0,
    to_process: 0,
    late_count: 0,
    waiting_count: 0
  };

  const transferSummary = summaries.find(s => s.operation_type === 'Internal Transfers') || {
    operation_type: 'Internal Transfers',
    total_count: 0,
    to_process: 0,
    late_count: 0,
    waiting_count: 0
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Operations Pipeline</h3>
          <p className="text-xs text-slate-500">Live operational workflow stages & bottleneck tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Receipts Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded border border-blue-200/60 bg-blue-50 text-blue-700">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900">Receipts</h4>
                <p className="text-[11px] text-slate-500">Incoming Shipments</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('receipts')}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium inline-flex items-center gap-0.5 transition-colors"
            >
              <span>View</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 tracking-tight">{receiptSummary.to_process}</span>
              <span className="text-xs font-medium text-slate-500">To Receive</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-xs">
            {receiptSummary.late_count > 0 ? (
              <Badge status="LATE" label={`${receiptSummary.late_count} Late`} />
            ) : (
              <span className="text-slate-400 text-xs">0 Late</span>
            )}
            <span className="text-slate-500 text-[11px] ml-auto">
              Total: <span className="text-slate-800 font-medium">{receiptSummary.total_count}</span>
            </span>
          </div>
        </div>

        {/* Deliveries Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded border border-indigo-200/60 bg-indigo-50 text-indigo-700">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900">Delivery Orders</h4>
                <p className="text-[11px] text-slate-500">Customer Outbound</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('deliveries')}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium inline-flex items-center gap-0.5 transition-colors"
            >
              <span>View</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 tracking-tight">{deliverySummary.to_process}</span>
              <span className="text-xs font-medium text-slate-500">To Deliver</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-xs">
            {deliverySummary.waiting_count > 0 && (
              <Badge status="WAITING" label={`${deliverySummary.waiting_count} Waiting`} />
            )}
            {deliverySummary.late_count > 0 ? (
              <Badge status="LATE" label={`${deliverySummary.late_count} Late`} />
            ) : (
              <span className="text-slate-400 text-xs">0 Late</span>
            )}
            <span className="text-slate-500 text-[11px] ml-auto">
              Total: <span className="text-slate-800 font-medium">{deliverySummary.total_count}</span>
            </span>
          </div>
        </div>

        {/* Transfers Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded border border-purple-200/60 bg-purple-50 text-purple-700">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-900">Internal Transfers</h4>
                <p className="text-[11px] text-slate-500">Location Relocations</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('transfers')}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium inline-flex items-center gap-0.5 transition-colors"
            >
              <span>View</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 tracking-tight">{transferSummary.to_process}</span>
              <span className="text-xs font-medium text-slate-500">To Process</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-xs">
            {transferSummary.late_count > 0 ? (
              <Badge status="LATE" label={`${transferSummary.late_count} Late`} />
            ) : (
              <span className="text-slate-400 text-xs">0 Late</span>
            )}
            <span className="text-slate-500 text-[11px] ml-auto">
              Total: <span className="text-slate-800 font-medium">{transferSummary.total_count}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
