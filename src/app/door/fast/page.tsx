"use client";

import { Suspense } from "react";
import FastDoorClient from "./FastDoorClient";

export default function FastDoorPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Caricamento...</div>}>
      <FastDoorClient />
    </Suspense>
  );
}