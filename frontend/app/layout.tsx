import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { GlobalTimeBar } from "@/components/shell/GlobalTimeBar";
import { ProjectProvider } from "@/lib/project";
import { TimeProvider } from "@/lib/time-context";

export const metadata: Metadata = {
  title: "PathTrace — Incident Intelligence",
  description: "Self-explaining incident intelligence for distributed systems",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ProjectProvider>
          <Suspense fallback={null}>
            <TimeProvider>
              <div className="app">
                <Nav />
                <div className="main-shell">
                  <GlobalTimeBar />
                  <main className="main">{children}</main>
                </div>
              </div>
            </TimeProvider>
          </Suspense>
        </ProjectProvider>
      </body>
    </html>
  );
}
