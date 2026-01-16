"use client";

import React from "react";
import QRCode from "react-qr-code";

export default function MemberQrCard({
  value,
  revoked,
}: {
  value: string;
  revoked?: boolean;
}) {
  if (!value) return null;

  if (revoked) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm text-white/60">QR Tessera</div>
        <div className="mt-2 text-sm text-red-200 font-semibold">
          Tessera revocata
        </div>
        <div className="mt-2 font-mono text-xs text-white/70 break-all">
          {value}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm text-white/60">QR Tessera</div>
      <div className="mt-3 bg-white inline-block p-3 rounded-lg">
        <QRCode value={value} size={180} />
      </div>
    </div>
  );
}
