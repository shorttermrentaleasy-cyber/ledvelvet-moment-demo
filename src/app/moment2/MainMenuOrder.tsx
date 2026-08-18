export default function MainMenuOrder() {
  return (
    <style>{`
      /* Desktop: ordine stabile già al primo paint, senza DOM mutation post-render. */
      nav > a[href="#home"] { order: 10; }
      nav > a[href="#eventi"] { order: 20; }
      nav > a[href="#past"] { order: 30; }
      nav > a[href="/about"] { order: 40; }
      nav > div:has(a[href="/society"]) { order: 50; }
      nav > a[href="#sponsor"] { order: 60; }
      nav > a[href="/legal"] { order: 70; }

      /* Mobile: stessa sequenza del desktop. */
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="#home"] { order: 10; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="#eventi"] { order: 20; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="#past"] { order: 30; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="/about"] { order: 40; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > div:has(a[href="/society"]) { order: 50; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="#sponsor"] { order: 60; }
      div.grid:has(> a[href="#home"]):has(> a[href="#eventi"]) > a[href="/legal"] { order: 70; }
    `}</style>
  );
}
