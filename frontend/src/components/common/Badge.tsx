import React from 'react';

export type BadgeVariant = 'status' | 'document_type';

export interface BadgeProps {
  status?: string;
  variant?: BadgeVariant;
  type?: BadgeVariant; // alias for variant
  label?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
  dot?: boolean;
  contained?: boolean;
  className?: string;
}

/**
 * Enterprise operational status and document type language.
 * Designed as clean, scannable operational data rather than decorative UI pills.
 *
 * Status: Inline semantic indicator (● Title Case Status) without enclosing capsules.
 * Document Type: Understated technical classification monospace tag.
 */
export const Badge: React.FC<BadgeProps> = ({
  status = '',
  variant,
  type,
  label,
  children,
  size = 'sm',
  dot,
  contained = false,
  className = ''
}) => {
  const rawStatus = (status || '').trim();
  const normalized = rawStatus.toUpperCase().replace(/\s+/g, '_');

  // Detect whether this is a document type or an operational status
  const isDocumentType =
    variant === 'document_type' ||
    type === 'document_type' ||
    (!variant &&
      !type &&
      [
        'RECEIPT',
        'DELIVERY',
        'INTERNAL',
        'INTERNAL_TRANSFER',
        'ADJUSTMENT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'INITIAL',
        'TRANSFER'
      ].includes(normalized));

  // =========================================================================
  // DOCUMENT TYPE TREATMENT (Understated technical classification)
  // =========================================================================
  if (isDocumentType) {
    const docTypeLabel = (() => {
      if (children) return children;
      if (label) return label;
      if (normalized === 'INTERNAL' || normalized === 'INTERNAL_TRANSFER') return 'INTERNAL';
      if (normalized === 'TRANSFER_IN') return 'TRANSFER IN';
      if (normalized === 'TRANSFER_OUT') return 'TRANSFER OUT';
      return rawStatus.replace(/_/g, ' ').toUpperCase();
    })();

    let docTypeStyles = 'bg-slate-100/90 text-slate-700 border-slate-200/90';

    switch (normalized) {
      case 'RECEIPT':
      case 'TRANSFER_IN':
        docTypeStyles = 'bg-sky-50/80 text-sky-800 border-sky-200/70';
        break;
      case 'DELIVERY':
      case 'TRANSFER_OUT':
        docTypeStyles = 'bg-indigo-50/80 text-indigo-800 border-indigo-200/70';
        break;
      case 'INTERNAL':
      case 'INTERNAL_TRANSFER':
      case 'TRANSFER':
        docTypeStyles = 'bg-purple-50/80 text-purple-800 border-purple-200/70';
        break;
      case 'ADJUSTMENT':
        docTypeStyles = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      default:
        docTypeStyles = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
    }

    const typeSizeClass =
      size === 'md'
        ? 'px-2 py-0.5 text-[11px] leading-tight'
        : 'px-1.5 py-0.5 text-[10px] leading-tight';

    return (
      <span
        className={`inline-flex items-center font-mono font-medium uppercase tracking-wider rounded-[2px] border select-none shrink-0 ${docTypeStyles} ${typeSizeClass} ${className}`}
      >
        <span className="truncate">{docTypeLabel}</span>
      </span>
    );
  }

  // =========================================================================
  // STATUS TREATMENT (Semantic inline data marker: ● Status)
  // =========================================================================
  // Formats normalized keys to clean Enterprise Title Case
  const formattedStatusLabel = (() => {
    if (children) return children;
    if (label) return label;

    switch (normalized) {
      case 'DONE':
        return 'Done';
      case 'RECEIVED':
        return 'Received';
      case 'COMPLETED':
        return 'Completed';
      case 'IN_STOCK':
        return 'In Stock';
      case 'LOW_STOCK':
        return 'Low Stock';
      case 'OUT_OF_STOCK':
        return 'Out of Stock';
      case 'DEPLETED':
        return 'Out of Stock';
      case 'AVAILABLE':
        return 'Available';
      case 'DISPATCHED':
        return 'Dispatched';
      case 'DRAFT':
        return 'Draft';
      case 'READY':
        return 'Ready';
      case 'SCHEDULED':
        return 'Scheduled';
      case 'WAITING':
        return 'Waiting';
      case 'WAITING_FOR_STOCK':
        return 'Waiting for Stock';
      case 'LATE':
      case 'LATE_OPERATION':
        return 'Late';
      case 'OVERDUE':
        return 'Overdue';
      case 'CANCELLED':
      case 'CANCELED':
        return 'Cancelled';
      case 'ACTIVE':
      case 'ACTIVE_HUB':
        return 'Active Hub';
      case 'INSUFFICIENT':
      case 'INSUFFICIENT_STOCK':
        return 'Insufficient';
      default:
        // Convert UPPER_SNAKE_CASE to Title Case
        return rawStatus
          .split(/[\s_]+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
    }
  })();

  // Semantic Dot and Text colors
  let dotColor = 'bg-slate-400';
  let textColor = 'text-slate-700';

  // 1. Success / Positive
  if (
    normalized === 'DONE' ||
    normalized === 'RECEIVED' ||
    normalized === 'COMPLETED' ||
    normalized === 'IN_STOCK' ||
    normalized === 'AVAILABLE' ||
    normalized === 'DISPATCHED' ||
    normalized === 'ACTIVE' ||
    normalized === 'ACTIVE_HUB'
  ) {
    dotColor = 'bg-emerald-500';
    textColor = 'text-slate-800';
  }
  // 2. Attention / Warning
  else if (
    normalized === 'LOW_STOCK' ||
    normalized === 'WAITING' ||
    normalized === 'WAITING_FOR_STOCK' ||
    normalized === 'ATTENTION' ||
    normalized === 'INSUFFICIENT' ||
    normalized === 'INSUFFICIENT_STOCK'
  ) {
    dotColor = 'bg-amber-500';
    textColor = 'text-slate-800';
  }
  // 3. Attention / Urgent
  else if (normalized === 'LATE' || normalized === 'LATE_OPERATION' || normalized === 'OVERDUE') {
    dotColor = 'bg-rose-500';
    textColor = 'text-rose-700 font-semibold';
  }
  // 4. Informational
  else if (normalized === 'READY' || normalized === 'SCHEDULED') {
    dotColor = 'bg-sky-500';
    textColor = 'text-slate-800';
  }
  // 5. Neutral
  else if (normalized === 'DRAFT' || normalized === 'PENDING') {
    dotColor = 'bg-slate-300';
    textColor = 'text-slate-500';
  }
  // 6. Negative
  else if (normalized === 'OUT_OF_STOCK' || normalized === 'DEPLETED' || normalized === 'ERROR' || normalized === 'FAILED') {
    dotColor = 'bg-rose-500';
    textColor = 'text-slate-800 font-medium';
  } else if (normalized === 'CANCELLED' || normalized === 'CANCELED') {
    dotColor = 'bg-slate-300';
    textColor = 'text-slate-400 line-through decoration-slate-300';
  }

  const showDot = dot !== undefined ? dot : true;

  const dotSize = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5';
  const textClasses = size === 'md' ? 'text-xs font-medium' : 'text-xs font-medium';

  // If container is explicitly requested (e.g. compact tag)
  if (contained) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] bg-slate-50 border border-slate-200/80 leading-none select-none shrink-0 ${className}`}
      >
        {showDot && <span className={`${dotSize} rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />}
        <span className={`${textClasses} ${textColor} truncate`}>{formattedStatusLabel}</span>
      </span>
    );
  }

  // Default: Pure inline data indicator (no enclosing box/capsule)
  return (
    <span
      className={`inline-flex items-center gap-1.5 leading-none select-none shrink-0 ${className}`}
    >
      {showDot && <span className={`${dotSize} rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />}
      <span className={`${textClasses} ${textColor} truncate`}>{formattedStatusLabel}</span>
    </span>
  );
};
