import { useCallback, useEffect, useRef, useState } from 'react';

/** Measures an element so SVG charts can be laid out in real pixels. */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize((prev) =>
        Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { width: r.width, height: r.height },
      );
    });
    observer.current.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, size];
}
