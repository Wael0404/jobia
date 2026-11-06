"use client";

import { useCountUp } from "../lib/motion";

/**
 * Animated statistic. Screen readers get the final value once, not every
 * intermediate frame.
 */
export function CountUp({ value, className = "stat" }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return (
    <div className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </div>
  );
}
