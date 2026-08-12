import { RadarApp } from "@/components/radar-app";
import { getRadarBrief } from "@/lib/radar/brief";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  return <RadarApp brief={await getRadarBrief()} />;
}
