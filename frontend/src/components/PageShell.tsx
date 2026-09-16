import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

/**
 * Standard workspace chrome — sidebar + top bar + scrollable content
 * area. Every authenticated page renders through this so the layout
 * can't drift between pages.
 */
export default function PageShell({
  section,
  children,
  maxWidth = "max-w-[1400px]",
}: {
  section: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar section={section} />
        <main className={`flex-1 px-8 py-7 w-full ${maxWidth}`}>{children}</main>
      </div>
    </div>
  );
}
