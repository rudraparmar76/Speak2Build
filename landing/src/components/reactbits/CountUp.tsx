"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  separator?: string;
  decimals?: number;
}

export default function CountUp({
  to,
  from = 0,
  duration = 2,
  delay = 0,
  className = "",
  prefix = "",
  suffix = "",
  separator = "",
  decimals = 0,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);
  const [displayValue, setDisplayValue] = useState(from);

  const format = useCallback(
    (value: number) => {
      const fixed = value.toFixed(decimals);
      if (!separator) return `${prefix}${fixed}${suffix}`;
      const [int, frac] = fixed.split(".");
      const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
      return `${prefix}${grouped}${frac ? `.${frac}` : ""}${suffix}`;
    },
    [decimals, separator, prefix, suffix]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;

    const timeout = setTimeout(() => {
      const startTime = performance.now();
      const durationMs = duration * 1000;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        // ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = from + (to - from) * eased;
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [started, from, to, duration, delay]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(displayValue)}
    </span>
  );
}

