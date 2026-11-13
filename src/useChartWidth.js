import { useEffect, useState } from 'react';

// The pixel width of a chart's container. The charts are SVG; drawing them on a fixed 900px canvas and shrinking that to fit
// makes the axis text unreadably small on a phone, so they are drawn at the width they are shown at instead.
// Returns [ref, width]: put the ref on the element that holds the chart. It is a callback ref, so a chart that only appears
// once its data has loaded is still measured.
export function useChartWidth(fallback = 900) {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return [setEl, Math.max(260, Math.min(width, 1200))];
}

// Sizes that depend on how wide a chart is drawn: a narrower chart gets a shorter canvas, a slimmer axis and fewer date labels.
export function chartBox(width, { tall = 240, short = 200, axis = 52 } = {}) {
  const narrow = width < 520;
  return { H: narrow ? short : tall, padL: narrow ? Math.min(axis, 46) : axis, narrow };
}

// How many date labels fit along an axis `inner` pixels wide (each label is roughly 56px of text plus a gap).
export const maxLabels = (inner) => Math.max(3, Math.floor(inner / 64));

// Where a tooltip's centre goes: under the hovered point, but kept inside the chart so it can't run off a phone screen.
export const tipLeft = (x, width, half = 84) => Math.min(Math.max(x, half), Math.max(half, width - half));
