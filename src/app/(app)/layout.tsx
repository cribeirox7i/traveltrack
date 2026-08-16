import { NavBar } from "@/components/NavBar";
import { SyncStatusBar } from "@/components/SyncStatusBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SyncStatusBar />
      <div className="flex flex-1 flex-col md:flex-row">
        <NavBar />
        <main className="flex-1 pb-20 md:pb-6 p-4 md:p-8 max-w-5xl md:max-w-none mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
