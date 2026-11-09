import { ProfileStudio } from "@/app/components/ProfileStudio";
import { profileOverview } from "@/src/lib/profiles/service";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  return <ProfileStudio initial={await profileOverview()} />;
}
