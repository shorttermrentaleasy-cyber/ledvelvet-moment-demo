"use client";

import { useEffect } from "react";

const SWIPE_THRESHOLD_PX = 50;

export default function GallerySwipe() {
  useEffect(() => {
    let startX: number | null = null;
    let startY: number | null = null;
    let startedOnGalleryImage = false;

    const isGalleryImage = (target: EventTarget | null) => {
      if (!(target instanceof HTMLImageElement)) return false;
      if (!target.alt.startsWith("Gallery ")) return false;
      return Boolean(target.closest('[role="dialog"][aria-label="Gallery lightbox"]'));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !isGalleryImage(event.target)) {
        startX = null;
        startY = null;
        startedOnGalleryImage = false;
        return;
      }

      startedOnGalleryImage = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!startedOnGalleryImage || startX === null || startY === null) return;

      const touch = event.changedTouches[0];
      startedOnGalleryImage = false;
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      startX = null;
      startY = null;

      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

      const dialog = (event.target as Element | null)?.closest?.(
        '[role="dialog"][aria-label="Gallery lightbox"]',
      );
      if (!dialog) return;

      const ariaLabel = deltaX < 0 ? "Immagine successiva" : "Immagine precedente";
      const button = dialog.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`);
      if (!button || button.disabled) return;

      button.click();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <style jsx global>{`
      @media (max-width: 767px) and (orientation: portrait) {
        .lv-experience-hero iframe {
          position: absolute !important;
          left: 50% !important;
          top: 50% !important;
          width: max(100%, calc(86svh * 16 / 9)) !important;
          height: max(100%, calc(100vw * 9 / 16)) !important;
          transform: translate(-50%, -50%) !important;
          border: 0 !important;
        }
      }
    `}</style>
  );
}
