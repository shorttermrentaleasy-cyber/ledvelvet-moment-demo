"use client";

import { useEffect } from "react";

const LOADING_TEXT = "Loading mood…";
const PLAY_TEXT = "Play mood";
const STOP_TEXT = "Stop mood";

export default function MoodLoadingFeedback() {
  useEffect(() => {
    let activeButton: HTMLButtonElement | null = null;
    let resetTimer: number | null = null;

    const setButtonLabel = (button: HTMLButtonElement, label: string, icon: string) => {
      const spans = button.querySelectorAll("span");
      if (spans[0]) spans[0].textContent = icon;

      const textNode = Array.from(button.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (textNode) textNode.textContent = ` ${label}`;
    };

    const clearPending = () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
      activeButton = null;
    };

    const restorePlay = () => {
      if (!activeButton) return;
      activeButton.disabled = false;
      activeButton.removeAttribute("aria-busy");
      setButtonLabel(activeButton, PLAY_TEXT, "▶");
      clearPending();
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.("button") as HTMLButtonElement | null;
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      if (label !== PLAY_TEXT.toLowerCase()) return;

      activeButton = button;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      setButtonLabel(button, LOADING_TEXT, "…");

      resetTimer = window.setTimeout(() => {
        restorePlay();
      }, 15000);
    };

    const onPlaying = (event: Event) => {
      if (!(event.target instanceof HTMLAudioElement) || !activeButton) return;
      const button = activeButton;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      window.setTimeout(() => {
        if (button.textContent?.toLowerCase().includes("loading mood")) {
          setButtonLabel(button, STOP_TEXT, "■");
        }
      }, 0);
      clearPending();
    };

    const onError = (event: Event) => {
      if (!(event.target instanceof HTMLAudioElement) || !activeButton) return;
      restorePlay();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("playing", onPlaying, true);
    document.addEventListener("error", onError, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("playing", onPlaying, true);
      document.removeEventListener("error", onError, true);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
    };
  }, []);

  return null;
}
