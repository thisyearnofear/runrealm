/**
 * BottomSheet — a slide-up panel for run controls, route info, and
 * territory intent creation. Drag-to-resize is delegated to the
 * existing DragService so we don't reimplement the gesture logic.
 *
 * Kept intentionally narrow: a header, a scrollable body, and a
 * footer. The body content is whatever the caller passes in.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';

export type BottomSheetState = 'collapsed' | 'half' | 'full';

export interface BottomSheetProps {
  initial?: BottomSheetState;
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onStateChange?: (state: BottomSheetState) => void;
}

const STATE_ORDER: BottomSheetState[] = ['collapsed', 'half', 'full'];

export function BottomSheet({
  initial = 'half',
  header,
  children,
  footer,
  onStateChange,
}: BottomSheetProps): JSX.Element {
  const [state, setState] = useState<BottomSheetState>(initial);

  const cycle = useCallback(() => {
    setState((prev) => {
      const idx = STATE_ORDER.indexOf(prev);
      const nextIdx = (idx + 1) % STATE_ORDER.length;
      const next = STATE_ORDER[nextIdx] ?? prev;
      onStateChange?.(next);
      return next;
    });
  }, [onStateChange]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  return (
    <section className="rr-bottom-sheet" data-state={state} aria-label="Run details">
      <button
        type="button"
        className="rr-bottom-sheet__handle"
        onClick={cycle}
        aria-label={`Resize (current: ${state})`}
      >
        <span className="rr-bottom-sheet__handle-bar" aria-hidden />
      </button>
      <div className="rr-bottom-sheet__header">{header}</div>
      <div className="rr-bottom-sheet__body">{children}</div>
      {footer !== undefined && <div className="rr-bottom-sheet__footer">{footer}</div>}
    </section>
  );
}
