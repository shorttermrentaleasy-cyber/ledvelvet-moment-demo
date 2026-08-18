"use client";

import { useEffect } from "react";

const ORDER: Array<{ href: string; order: number }> = [
  { href: "#home", order: 10 },
  { href: "#eventi", order: 20 },
  { href: "#past", order: 30 },
  { href: "/about", order: 40 },
  { href: "__society__", order: 50 },
  { href: "#sponsor", order: 60 },
  { href: "/legal", order: 70 },
];

function applyOrder() {
  const desktopNav = Array.from(document.querySelectorAll<HTMLElement>("nav")).find((nav) =>
    Boolean(nav.querySelector('a[href="#home"]') && nav.querySelector('a[href="#eventi"]')),
  );

  if (desktopNav) {
    for (const item of ORDER) {
      if (item.href === "__society__") continue;
      const link = desktopNav.querySelector<HTMLElement>(`a[href="${item.href}"]`);
      if (link) link.style.order = String(item.order);
    }

    const society = Array.from(desktopNav.children).find((child) =>
      Boolean(child.querySelector?.('a[href="/society"]')),
    ) as HTMLElement | undefined;
    if (society) society.style.order = "50";
  }

  const mobileGrids = Array.from(document.querySelectorAll<HTMLElement>("div.grid")).filter((grid) =>
    Boolean(grid.querySelector('a[href="#home"]') && grid.querySelector('a[href="#eventi"]')),
  );

  for (const grid of mobileGrids) {
    for (const item of ORDER) {
      if (item.href === "__society__") continue;
      const link = grid.querySelector<HTMLElement>(`a[href="${item.href}"]`);
      if (link) link.style.order = String(item.order);
    }

    const society = Array.from(grid.children).find((child) =>
      Boolean(child.querySelector?.('a[href="/society"]')),
    ) as HTMLElement | undefined;
    if (society) society.style.order = "50";
  }
}

export default function MainMenuOrder() {
  useEffect(() => {
    applyOrder();

    const observer = new MutationObserver(() => applyOrder());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
