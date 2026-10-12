import AuthGate from "@/components/auth-gate";
import ScrollEntrance from "@/components/scroll-entrance";
export default function Home() {
  return (
    <ScrollEntrance>
      <AuthGate />
    </ScrollEntrance>
  );
}
