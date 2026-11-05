"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

interface FadeContentProps {
  children: ReactNode;
  blur?: boolean | number;
  duration?: number;
  delay?: number;
  threshold?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  scale?: number;
}

export default function FadeContent({
  children,
  blur = false,
  duration = 0.8,
  delay = 0,
  threshold = 0.1,
  className = "",
  direction = "up",
  distance = 30,
  scale = 1,
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const blurAmount =
    blur === true ? 10 : typeof blur === "number" ? blur : 0;

  const getTransform = () => {
    if (!isVisible) {
      const transforms: string[] = [];
      switch (direction) {
        case "up":
          transforms.push(`translateY(${distance}px)`);
          break;
        case "down":
          transforms.push(`translateY(-${distance}px)`);
          break;
        case "left":
          transforms.push(`translateX(${distance}px)`);
          break;
        case "right":
          transforms.push(`translateX(-${distance}px)`);
          break;
      }
      if (scale !== 1) transforms.push(`scale(${scale})`);
      return transforms.join(" ") || "none";
    }
    return "none";
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        filter: blurAmount > 0 && !isVisible ? `blur(${blurAmount}px)` : "none",
        transition: `opacity ${duration}s ease-out ${delay}s, transform ${duration}s ease-out ${delay}s, filter ${duration}s ease-out ${delay}s`,
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}

