import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, Delivery } from '../../types';
import { Printer, Boxes, X, Calendar, User, Clock, CheckCircle2, FileText, MapPin } from 'lucide-react';

interface PrintDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Receipt | Delivery | null;
  type: 'receipt' | 'delivery';
}

export const PrintDocumentModal: React.FC<PrintDocumentModalProps> = ({
  isOpen,
  onClose,
  document,
  type
}) => {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  const isReceipt = type === 'receipt';
  const receipt = isReceipt ? (document as Receipt) : null;
  const delivery = !isReceipt ? (document as Delivery) : null;

  const docNumber = document ? (isReceipt ? receipt?.receipt_number : delivery?.delivery_number) : '';
  const partnerLabel = isReceipt ? 'Supplier / Vendor' : 'Customer / Recipient';
  const partnerName = isReceipt ? receipt?.supplier_name : delivery?.customer_name;
  const docTitle = isReceipt ? 'GOODS RECEIPT NOTE (GRN)' : 'DELIVERY ORDER & PACKING SLIP';
  const docSubTitle = isReceipt
    ? 'Official Incoming Goods & Warehouse Inward Verification Voucher'
    : 'Official Warehouse Dispatch & Proof of Delivery Note';

  useEffect(() => {
    // Look for existing portal root or create it dynamically on mount
    let el = window.document.getElementById('printable-document-portal');
    if (!el) {
      el = window.document.createElement('div');
      el.id = 'printable-document-portal';
      window.document.body.appendChild(el);
    }
    setPortalElement(el);

    return () => {
      // Clean up body class if unmounted while printing
      window.document.body.classList.remove('printing-document');
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleBeforePrint = () => {
      if (isOpen && document) {
        window.document.body.classList.add('printing-document');
        window.document.title = `${docTitle} - ${docNumber}`;
      }
    };

    const handleAfterPrint = () => {
      window.document.body.classList.remove('printing-document');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    if (isOpen) {
      window.document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, docTitle, docNumber]);

  if (!isOpen || !document || !portalElement) return null;

  const handlePrint = () => {
    window.document.body.classList.add('printing-document');
    window.print();
    setTimeout(() => {
      window.document.body.classList.remove('printing-document');
    }, 1500);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const totalQuantity = (document.items || []).reduce(
    (sum: number, it: any) => sum + Number(it.quantity || 0),
    0
  );

  const totalValue = isReceipt
    ? (receipt?.items || []).reduce(
        (sum: number, it: any) => sum + Number(it.quantity || 0) * Number(it.unit_cost || 0),
        0
      )
    : 0;

  // The actual GRN Document Sheet (Used for both Screen Preview & Clean Print Output)
  const DocumentSheet = (
    <div
      id="printable-a4-document"
      className="w-full max-w-[210mm] bg-white text-slate-900 shadow-md sm:rounded-xl border border-slate-200 p-6 sm:p-10 font-sans mx-auto h-auto min-h-fit shrink-0 box-border"
    >
      {/* 1. Header & Branding */}
      <div className="flex items-start justify-between pb-5 border-b border-slate-200">
        <div className="flex items-center gap-3.5">
          {/* Consistent StockSense Icon Badge */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shrink-0">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                StockSense
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                IMS
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Centralized Inventory &amp; Warehouse Control
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 block">
            {docTitle}
          </span>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Voucher No:
            </span>
            <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded">
              {docNumber}
            </span>
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Status:
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                String(document.status).toUpperCase() === 'DONE'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : String(document.status).toUpperCase() === 'READY'
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : String(document.status).toUpperCase() === 'CANCELLED'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {document.status}
            </span>
          </div>
        </div>
      </div>

      {/* Subtitle Bar */}
      <div className="py-2.5 px-3.5 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
        <span>{docSubTitle}</span>
        <span className="text-slate-400 text-[10px]">StockSense Operation Audit Record</span>
      </div>

      {/* 2. Metadata / Voucher Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-slate-200 text-xs">
        {/* Partner Column */}
        <div className="sm:col-span-2 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            {partnerLabel}
          </span>
          <p className="text-sm font-bold text-slate-900 leading-tight">
            {partnerName || '—'}
          </p>
          {!isReceipt && delivery?.shipping_address && (
            <p className="text-[11px] text-slate-600 mt-1 flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{delivery.shipping_address}</span>
            </p>
          )}
        </div>

        {/* Scheduled Date */}
        <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>Scheduled Date</span>
          </span>
          <p className="text-xs font-semibold text-slate-800">
            {formatDate(document.scheduled_date)}
          </p>
        </div>

        {/* Responsible User */}
        <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
            <User className="w-3 h-3 text-slate-400" />
            <span>Responsible User</span>
          </span>
          <p className="text-xs font-semibold text-slate-800">
            {document.responsible_user_name || 'Warehouse Staff'}
          </p>
        </div>

        {/* Created Date */}
        <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Created Date</span>
          </span>
          <p className="text-xs text-slate-700">
            {formatDate(document.created_at)}
          </p>
        </div>

        {/* Validation Date */}
        <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-slate-400" />
            <span>Validation Date</span>
          </span>
          <p className="text-xs text-slate-700">
            {formatDate(document.validated_at)}
          </p>
        </div>

        {/* Notes / Special Instructions */}
        <div className="sm:col-span-2 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
            <FileText className="w-3 h-3 text-slate-400" />
            <span>Notes &amp; Internal Reference</span>
          </span>
          <p className="text-xs text-slate-700 italic">
            {document.notes ? `"${document.notes}"` : 'None specified'}
          </p>
        </div>
      </div>

      {/* 3. Itemized Products Table */}
      <div className="mt-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Itemized Breakdown ({document.items?.length || 0} Line Items)
          </h4>
          <span className="text-[10px] text-slate-500">
            All quantities expressed in stock storage units
          </span>
        </div>

        <table className="w-full text-left border-collapse border border-slate-200 text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <th className="py-2.5 px-3 border-r border-slate-200 text-center w-10">#</th>
              <th className="py-2.5 px-3 border-r border-slate-200">Product / Item Description</th>
              <th className="py-2.5 px-3 border-r border-slate-200 w-32">SKU</th>
              <th className="py-2.5 px-3 border-r border-slate-200 w-44">Storage / Pick Location</th>
              <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">Quantity</th>
              {isReceipt && (
                <>
                  <th className="py-2.5 px-3 border-r border-slate-200 text-right w-24">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {document.items && document.items.length > 0 ? (
              document.items.map((item: any, idx: number) => {
                const qty = Number(item.quantity || 0);
                const unitCost = Number(item.unit_cost || 0);
                const subtotal = qty * unitCost;

                return (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                  >
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-400 text-center font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-900">
                      {item.product_name || 'Item'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-600 text-[11px]">
                      {item.product_sku || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-slate-600 text-[11px]">
                      {item.location_name || 'Designated Warehouse Location'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-bold text-slate-900 font-mono">
                      {qty.toLocaleString()}
                    </td>
                    {isReceipt && (
                      <>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono text-slate-700">
                          ₹{unitCost.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          ₹{subtotal.toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={isReceipt ? 7 : 5}
                  className="py-6 text-center text-slate-400 italic text-xs"
                >
                  No line items recorded for this document.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-100/80 font-bold text-slate-900 border-t-2 border-slate-300">
            <tr>
              <td
                colSpan={4}
                className="py-3 px-3 text-right uppercase text-[10px] tracking-wider text-slate-600 border-r border-slate-200"
              >
                Total Received Quantity:
              </td>
              <td className="py-3 px-3 text-right text-xs font-mono font-black text-slate-900 border-r border-slate-200">
                {totalQuantity.toLocaleString()} units
              </td>
              {isReceipt && (
                <>
                  <td className="py-3 px-3 text-right uppercase text-[10px] tracking-wider text-slate-600 border-r border-slate-200">
                    Total Value:
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono font-black text-brand-700">
                    ₹{totalValue.toFixed(2)}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. Verification Signatures Block */}
      <div className="pt-6 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8 avoid-break">
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1">
            Received &amp; Verified By
          </p>
          <p className="text-[10px] text-slate-500 mb-8 sm:mb-10">
            Warehouse Inward Receiving Clerk / Staff
          </p>
          <div className="border-t border-dashed border-slate-400 pt-2 flex justify-between text-[10px] text-slate-500">
            <span>Authorized Signature</span>
            <span>Date &amp; Stamp</span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
          <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1">
            Carrier / Delivering Agent
          </p>
          <p className="text-[10px] text-slate-500 mb-8 sm:mb-10">
            Vendor Courier / Transporter Representative
          </p>
          <div className="border-t border-dashed border-slate-400 pt-2 flex justify-between text-[10px] text-slate-500">
            <span>Driver / Agent Signature</span>
            <span>Vehicle / Waybill #</span>
          </div>
        </div>
      </div>

      {/* 5. Document Footer & Compliance */}
      <div className="mt-6 sm:mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          Generated automatically by StockSense IMS • Document Hash Verification Active
        </span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Interactive Screen Modal Preview (Hidden entirely during window.print) */}
      <div className="fixed inset-0 z-50 overflow-y-auto no-print">
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />

        <div className="flex min-h-full items-center justify-center p-3 sm:p-5">
          <div
            className="relative w-full max-w-4xl rounded-2xl bg-slate-100 shadow-2xl transition-all border border-slate-200 overflow-hidden flex flex-col my-6"
            style={{ maxHeight: 'calc(100vh - 48px)' }}
          >
            {/* Modal Top Control Bar */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
                  <Boxes className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{docTitle}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                      {docNumber}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Standard A4 Document Preview • Ready for export or physical printing
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Document Area in Modal */}
            <div className="p-4 sm:p-8 overflow-y-auto bg-slate-200/70 flex justify-center items-start flex-1 min-h-0">
              {DocumentSheet}
            </div>

            {/* Bottom Modal Actions */}
            <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-slate-200 sticky bottom-0 z-10 shrink-0">
              <span className="text-[11px] text-slate-500">
                Tip: Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Ctrl+P</kbd> or click Print Receipt to generate PDF
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 font-medium text-xs transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Isolated Printable Portal directly attached to document.body (Only visible during print) */}
      {createPortal(
        <div className="hidden print:block w-full">
          {DocumentSheet}
        </div>,
        portalElement
      )}
    </>
  );
};
