import Link from "next/link";
import { ErrorPage } from "@apex/ui/components/Identity";

export default function NotFound() {
  return (
    <ErrorPage code="404" title="No trobem aquesta pàgina" action={<Link className="btn primary" href="/admin/forms">Torna als formularis</Link>}>
      Pot ser que s&apos;hagi esborrat, o que no tinguis permís per veure-la.
    </ErrorPage>
  );
}
