export const dynamic = "force-static";
export const revalidate = false;

import { Suspense } from "react";
import Moment2Client from "./Moment2Client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Moment2Client />
    </Suspense>
  );
}
