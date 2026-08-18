export const dynamic = "force-static";
export const revalidate = false;

import { Suspense } from "react";
import Moment2Client from "./Moment2Client";
import GallerySwipe from "./GallerySwipe";
import MemberLoginGate from "./MemberLoginGate";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GallerySwipe />
      <MemberLoginGate />
      <Moment2Client />
    </Suspense>
  );
}
