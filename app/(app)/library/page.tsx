import { Library } from "@/app/components/Library";
import { MediaStore } from "@/src/lib/media/store";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  return <Library initial={await new MediaStore().read()} />;
}
