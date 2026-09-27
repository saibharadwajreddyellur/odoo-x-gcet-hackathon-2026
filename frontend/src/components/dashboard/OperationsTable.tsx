import React from 'react';
import { DashboardDocumentItem } from '../../types';
import { NavTab } from '../common/Sidebar';
import { Badge } from '../common/Badge';
import { Clock, FileText, ArrowRight } from 'lucide-react';

interface OperationsTableProps {
  documents: DashboardDocumentItem[];
  onNavigateTab: (tab: NavTab) => void;
  isLateFilterActive?: boolean;
  onClearLateFilter?: () => void;
}

export const OperationsTable: React.FC<OperationsTableProps> = ({
  documents,
  onNavigateTab,
  isLateFilterActive = false,
  onClearLateFilter
}) => {
  const getTabForDocType = (docType: string): NavTab => {
    switch (docType.toLowerCase()) {
      case 'receipt':
        return 'receipts';
      case 'delivery':
        return 'deliveries';
      case 'internal':
        return 'transfers';
      case 'adjustment':
        return 'adjustments';
      default:
        return 'dashboard';
    }
  };

  const getDocTypeBadge = (docType: string) => {
    switch (docType.toLowerCase()) {
      case 'receipt':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Receipt</span>;
      case 'delivery':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">Delivery</span>;
      case 'internal':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Internal</span>;
      case 'adjustment':
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Adjustment</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">{docType}</span>;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Document Pipeline ({documents.length})</span>
            {isLateFilterActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                <Clock className="w-3 h-3" />
                <span>Overdue Only</span>
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isLateFilterActive
              ? 'Showing all operations with overdue schedule dates across all document types'
              : 'Operational documents matching active dynamic filters'}
          </p>
        </div>
        {isLateFilterActive && onClearLateFilter && (
          <button
            onClick={onClearLateFilter}
            className="text-xs text-slate-600 hover:text-slate-900 underline font-medium self-start sm:self-auto"
          >
            Show all operations
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-2.5 px-4">Document #</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Partner / Details</th>
              <th className="py-2.5 px-3">Warehouse / Location</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Schedule Date</th>
              <th className="py-2.5 px-3 text-right">Items / Qty</th>
              <th className="py-2.5 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  {isLateFilterActive
                    ? 'No overdue operations found.'
                    : 'No operational documents match the selected filters.'}
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const targetTab = getTabForDocType(doc.document_type);
                return (
                  <tr key={`${doc.document_type}-${doc.id}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                      {doc.document_number}
                    </td>
                    <td className="py-2.5 px-3">
                      {getDocTypeBadge(doc.document_type)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[200px] truncate" title={doc.partner_or_reference}>
                      {doc.partner_or_reference || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{doc.warehouse_name || 'General Warehouse'}</div>
                      {doc.location_name && (
                        <div className="text-[10px] text-slate-400">{doc.location_name}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge status={doc.status} />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span>{formatDate(doc.scheduled_date)}</span>
                        {doc.is_late && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <Clock className="w-2.5 h-2.5" />
                            <span>LATE</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      <span className="text-slate-900">{doc.total_quantity}</span>
                      <span className="text-slate-500 text-[10px] ml-1">({doc.items_count} {doc.items_count === 1 ? 'item' : 'items'})</span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => onNavigateTab(targetTab)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded border border-slate-200 transition-colors"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
