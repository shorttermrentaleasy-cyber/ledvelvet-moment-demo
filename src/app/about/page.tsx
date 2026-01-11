// src/app/about/page.tsx
import type { Metadata } from "next";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About Us • Led Velvet",
  description:
    "Led Velvet is a cultural association devoted to unique immersive events where music and unconventional venues merge into timeless experiences.",
};

export default function AboutPage() {
  return <AboutClient />;
}
