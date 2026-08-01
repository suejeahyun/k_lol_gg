"use client";

import { useEffect, useRef, useState } from "react";

export function useViewportActivity<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const element = ref.current;
    if (!element) return;

    let isIntersecting = true;
    const updateActivity = () => {
      setIsActive(isIntersecting && document.visibilityState === "visible");
    };

    if (!("IntersectionObserver" in window)) {
      updateActivity();
      document.addEventListener("visibilitychange", updateActivity);
      return () => {
        document.removeEventListener("visibilitychange", updateActivity);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry?.isIntersecting ?? false;
        updateActivity();
      },
      { rootMargin: "120px 0px" },
    );

    observer.observe(element);
    document.addEventListener("visibilitychange", updateActivity);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, [enabled]);

  return { ref, isActive: enabled && isActive };
}
