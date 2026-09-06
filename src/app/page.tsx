import { LearningCrewApp } from "@/components/learning-crew-app";
import { getAppData } from "@/server/app-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await getAppData({});
  return <LearningCrewApp initialData={initialData} />;
}
