import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomTabBar from "@/components/layout/BottomTabBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <main style={{ flex: 1 }}>{children}</main>
      <BottomTabBar />
    </div>
  );
}
