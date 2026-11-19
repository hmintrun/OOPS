"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type IndicatorRect = { x: number; y: number; w: number; h: number };

/**
 * Đo tọa độ phần tử active trong container và trả về CSS vars để thanh trượt
 * di chuyển 100% bằng GPU `transform: translate3d(...)` (0 layout reflow).
 */
export function useSlidingIndicator<T extends HTMLElement = HTMLDivElement>(
  activeKey: string,
  selector: string,
) {
  const containerRef = useRef<T | null>(null);
  const [rect, setRect] = useState<IndicatorRect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const target = container.querySelector<HTMLElement>(selector);
      if (!target || target.offsetWidth === 0 || target.offsetHeight === 0) {
        setRect(null);
        return;
      }
      setRect({
        x: target.offsetLeft,
        y: target.offsetTop,
        w: target.offsetWidth,
        h: target.offsetHeight,
      });
      requestAnimationFrame(() => setReady(true));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeKey, selector]);

  const indicatorStyle: CSSProperties | undefined = rect
    ? ({
        "--ind-x": `${rect.x}px`,
        "--ind-y": `${rect.y}px`,
        "--ind-w": `${rect.w}px`,
        "--ind-h": `${rect.h}px`,
      } as CSSProperties)
    : undefined;

  return { containerRef, indicatorStyle, hasIndicator: rect !== null, animate: ready };
}
