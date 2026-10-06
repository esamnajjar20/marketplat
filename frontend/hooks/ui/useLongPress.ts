'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

const DEFAULT_DELAY_MS = 900;
const DEFAULT_MOVE_TOLERANCE_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onClickCapture: (event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
}

/**
 * Long-press intended for touch selection, not normal mouse interaction.
 * Movement cancels the timer so scrolling never turns into selection.
 */
export function useLongPress(
  onLongPress: () => void,
  options: { delayMs?: number; moveTolerancePx?: number; enabled?: boolean } = {},
): LongPressHandlers {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const moveTolerancePx = options.moveTolerancePx ?? DEFAULT_MOVE_TOLERANCE_PX;
  const enabled = options.enabled ?? true;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const triggeredRef = useRef(false);
  const lastPointerTypeRef = useRef<string | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => clearTimer, []);

  const cancel = () => {
    clearTimer();
    startRef.current = null;
  };

  return {
    onPointerDown: (event) => {
      lastPointerTypeRef.current = event.pointerType;
      if (!enabled || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;

      clearTimer();
      triggeredRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };

      timerRef.current = setTimeout(() => {
        if (!startRef.current) return;
        triggeredRef.current = true;
        startRef.current = null;
        timerRef.current = null;
        onLongPress();
      }, delayMs);
    },
    onPointerMove: (event) => {
      const start = startRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > moveTolerancePx;
      if (moved) cancel();
    },
    onPointerUp: () => {
      cancel();
    },
    onPointerCancel: () => {
      cancel();
      triggeredRef.current = false;
    },
    onClickCapture: (event) => {
      if (!triggeredRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      triggeredRef.current = false;
    },
    onContextMenu: (event) => {
      if (enabled && (lastPointerTypeRef.current === 'touch' || lastPointerTypeRef.current === 'pen')) {
        event.preventDefault();
      }
    },
  };
}
