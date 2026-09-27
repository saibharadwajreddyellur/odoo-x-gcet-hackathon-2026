import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface KanbanBoardContainerProps {
  children: React.ReactNode;
  className?: string;
  scrollStep?: number;
}

export const KanbanBoardContainer: React.FC<KanbanBoardContainerProps> = ({
  children,
  className = '',
  scrollStep
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [arrowTop, setArrowTop] = useState<number>(300);

  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 4;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && scrollLeft > 4);
    // Allow 4px tolerance for subpixel rendering and display scaling
    setCanScrollRight(overflow && scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  const updateArrowVerticalPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    // Visible vertical range of the Kanban board within the browser viewport
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(windowHeight, rect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    if (visibleHeight > 0) {
      const screenCenterY = visibleTop + visibleHeight / 2;
      const topRelativeToBoard = screenCenterY - rect.top;
      // Clamp within board bounds with padding
      const clampedTop = Math.max(28, Math.min(rect.height - 28, topRelativeToBoard));
      setArrowTop(clampedTop);
    } else {
      setArrowTop(Math.min(300, rect.height / 2));
    }
  }, []);

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    updateScrollState();
    updateArrowVerticalPosition();

    const rafId = requestAnimationFrame(() => {
      updateScrollState();
      updateArrowVerticalPosition();
    });

    const handleScroll = () => {
      updateScrollState();
    };

    const handleVerticalScrollOrResize = () => {
      updateArrowVerticalPosition();
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });

    // Track vertical scrolling on the page to keep arrows centered in visible view
    window.addEventListener('scroll', handleVerticalScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleVerticalScrollOrResize);
    window.addEventListener('resize', handleScroll);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
        updateArrowVerticalPosition();
      });
      resizeObserver.observe(scrollEl);
      if (scrollEl.firstElementChild) {
        resizeObserver.observe(scrollEl.firstElementChild);
      }
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      scrollEl.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleVerticalScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleVerticalScrollOrResize);
      window.removeEventListener('resize', handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState, updateArrowVerticalPosition]);

  // Recalculate on children / DOM updates
  useEffect(() => {
    const timer = setTimeout(() => {
      updateScrollState();
      updateArrowVerticalPosition();
    }, 50);
    return () => clearTimeout(timer);
  }, [children, updateScrollState, updateArrowVerticalPosition]);

  const getScrollDistance = () => {
    if (scrollStep) return scrollStep;
    const el = scrollContainerRef.current;
    if (!el) return 300;

    // Dynamically detect single column width + gap (approx 16px)
    const innerContainer = el.firstElementChild as HTMLElement | null;
    const firstColumn = innerContainer?.firstElementChild as HTMLElement | null;
    if (firstColumn && firstColumn.offsetWidth > 0) {
      return firstColumn.offsetWidth + 16;
    }

    return Math.min(el.clientWidth * 0.85, 300);
  };

  const handleScrollLeft = () => {
    if (!scrollContainerRef.current) return;
    const distance = getScrollDistance();
    scrollContainerRef.current.scrollBy({
      left: -distance,
      behavior: 'smooth'
    });
  };

  const handleScrollRight = () => {
    if (!scrollContainerRef.current) return;
    const distance = getScrollDistance();
    scrollContainerRef.current.scrollBy({
      left: distance,
      behavior: 'smooth'
    });
  };

  return (
    <div ref={containerRef} className={`relative group ${className}`}>
      {/* Edge gradient cues for horizontal overflow */}
      {hasOverflow && (
        <>
          <div
            className={`absolute left-0 top-0 bottom-6 w-8 bg-gradient-to-r from-slate-100/70 to-transparent pointer-events-none z-10 rounded-l-lg transition-opacity duration-200 ${
              canScrollLeft ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute right-0 top-0 bottom-6 w-8 bg-gradient-to-l from-slate-100/70 to-transparent pointer-events-none z-10 rounded-r-lg transition-opacity duration-200 ${
              canScrollRight ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      )}

      {/* Main Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto pb-6 pt-1 scroll-smooth"
        tabIndex={0}
        aria-label="Kanban columns container"
      >
        {children}
      </div>

      {/* Left Navigation Arrow Button */}
      {hasOverflow && (
        <button
          type="button"
          onClick={handleScrollLeft}
          disabled={!canScrollLeft}
          aria-label="Scroll to previous Kanban column"
          title="Previous column"
          style={{ top: `${arrowTop}px` }}
          className={`absolute left-2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:shadow-md flex items-center justify-center transition-[opacity,transform,background-color,border-color,box-shadow] duration-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/30 active:scale-95 cursor-pointer ${
            canScrollLeft
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-2 pointer-events-none'
          }`}
        >
          <ChevronLeft className="w-5 h-5 text-slate-700" strokeWidth={2.25} />
        </button>
      )}

      {/* Right Navigation Arrow Button */}
      {hasOverflow && (
        <button
          type="button"
          onClick={handleScrollRight}
          disabled={!canScrollRight}
          aria-label="Scroll to next Kanban column"
          title="Next column"
          style={{ top: `${arrowTop}px` }}
          className={`absolute right-2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:shadow-md flex items-center justify-center transition-[opacity,transform,background-color,border-color,box-shadow] duration-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/30 active:scale-95 cursor-pointer ${
            canScrollRight
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 translate-x-2 pointer-events-none'
          }`}
        >
          <ChevronRight className="w-5 h-5 text-slate-700" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
};
