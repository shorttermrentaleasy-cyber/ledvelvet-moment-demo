export const dynamic = "force-static";
export const revalidate = false;

import { Suspense } from "react";
import Moment2Client from "./Moment2Client";
import GallerySwipe from "./GallerySwipe";
import MemberLoginGate from "./MemberLoginGate";
import HomepageNumbers from "./HomepageNumbers";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GallerySwipe />
      <MemberLoginGate />
      <HomepageNumbers />
      <Moment2Client />
    </Suspense>
  );
}
