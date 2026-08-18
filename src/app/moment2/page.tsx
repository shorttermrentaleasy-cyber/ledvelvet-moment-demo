export const dynamic = "force-static";
export const revalidate = false;

import { Suspense } from "react";
import Moment2Client from "./Moment2Client";
import GallerySwipe from "./GallerySwipe";
import MemberLoginGate from "./MemberLoginGate";
import HomepageNumbers from "./HomepageNumbers";
import MoodLoadingFeedback from "./MoodLoadingFeedback";
import MainMenuOrder from "./MainMenuOrder";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GallerySwipe />
      <MemberLoginGate />
      <HomepageNumbers />
      <MoodLoadingFeedback />
      <MainMenuOrder />
      <Moment2Client />
    </Suspense>
  );
}
