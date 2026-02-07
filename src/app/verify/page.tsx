import React from "react";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold">Controlla la tua email</h1>
        <p className="mt-3 text-white/70 text-sm">
          Ti abbiamo inviato un link di accesso. Aprilo per completare il login.
        </p>
      </div>
    </main>
  );
}
