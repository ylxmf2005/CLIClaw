import { redirect } from "next/navigation";

export default async function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  redirect(`/agents/${name}/default`);
}
