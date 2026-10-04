"use client";

import { Button } from "@/components/ui/button";

export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="page-shell py-12" role="alert"><h1 className="text-3xl font-semibold">Clinic service unavailable</h1><p className="my-5">This view could not be loaded. Please try again. If you submitted an action, check its status before repeating it.</p><Button onClick={reset}>Try loading again</Button></section>;
}
