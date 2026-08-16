export const dynamic = "force-static";
export const revalidate = false;

import { Suspense } from "react";
import Moment2Client from "./Moment2Client";
import GallerySwipe from "./GallerySwipe";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GallerySwipe />
      <Moment2Client />
    </Suspense>
  );
}
