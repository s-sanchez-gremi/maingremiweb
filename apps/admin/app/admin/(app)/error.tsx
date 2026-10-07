"use client";
import Link from "next/link";
import { ErrorPage } from "@apex/ui/components/Identity";

// The error is already logged on the server (instrumentation.ts); here the person only sees what to do next.
export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPage
      code="500"
      title="Alguna cosa ha fallat"
      action={<><button className="btn primary" type="button" onClick={reset}>Torna-ho a provar</button><Link className="btn" href="/admin">Ves a l&apos;inici</Link></>}
    >
      No s&apos;ha perdut res del que ja estava desat. Si es repeteix, avisa l&apos;equip.
    </ErrorPage>
  );
}
