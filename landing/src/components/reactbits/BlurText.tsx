"use client";

import { useRef, useEffect, useState, useMemo } from "react";

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  stepDuration?: number;
}

export default function BlurText({
  text,
  className = "",
  delay = 50,
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  stepDuration = 0.4,
}: BlurTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const pieces = useMemo(() => {
    if (animateBy === "words") {
      return text.split(/(\s+)/).map((piece, i) => ({
        content: piece,
        isSpace: /^\s+$/.test(piece),
        index: i,
      }));
    }
    return text.split("").map((char, i) => ({
      content: char,
      isSpace: char === " ",
      index: i,
    }));
  }, [text, animateBy]);

  const yOffset = direction === "top" ? -20 : 20;

  return (
    <p ref={ref} className={`inline-block ${className}`}>
      {pieces.map((piece) => {
        if (piece.isSpace) {
          return (
            <span key={piece.index} className="inline-block">
              &nbsp;
            </span>
          );
        }

        const delayMs = piece.index * delay;

        return (
          <span
            key={piece.index}
            className="inline-block"
            style={{
              opacity: isInView ? 1 : 0,
              filter: isInView ? "blur(0px)" : "blur(8px)",
              transform: isInView
                ? "translateY(0)"
                : `translateY(${yOffset}px)`,
              transition: `opacity ${stepDuration}s ease ${delayMs}ms, filter ${stepDuration}s ease ${delayMs}ms, transform ${stepDuration}s ease ${delayMs}ms`,
              willChange: "opacity, filter, transform",
            }}
          >
            {piece.content}
          </span>
        );
      })}
    </p>
  );
}

