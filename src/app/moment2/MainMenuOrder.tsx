export default function MainMenuOrder() {
  return (
    <style>{`
      /*
       * Il markup originale di Moment2Client ha ancora questo ordine DOM:
       * Home, Upcoming, Past, Sponsor, About, Legal, Society.
       *
       * Impostiamo l'ordine direttamente sui figli reali del menu, senza :has()
       * e senza JavaScript post-render, così Society non può ricadere a order:0.
       */

      /* Desktop */
      nav.hidden.lg\\:flex > :nth-child(1) { order: 10; } /* Home */
      nav.hidden.lg\\:flex > :nth-child(2) { order: 20; } /* Upcoming */
      nav.hidden.lg\\:flex > :nth-child(3) { order: 30; } /* Past */
      nav.hidden.lg\\:flex > :nth-child(5) { order: 40; } /* About */
      nav.hidden.lg\\:flex > :nth-child(7) { order: 50; } /* Society */
      nav.hidden.lg\\:flex > :nth-child(4) { order: 60; } /* Sponsor */
      nav.hidden.lg\\:flex > :nth-child(6) { order: 70; } /* Legal */

      /* Mobile: stesso ordine del desktop. */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(1) { order: 10; } /* Home */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(2) { order: 20; } /* Upcoming */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(3) { order: 30; } /* Past */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(5) { order: 40; } /* About */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(7) { order: 50; } /* Society */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(4) { order: 60; } /* Sponsor */
      div.grid.gap-1.text-xs.tracking-\\[0\\.22em\\].uppercase > :nth-child(6) { order: 70; } /* Legal */
    `}</style>
  );
}
