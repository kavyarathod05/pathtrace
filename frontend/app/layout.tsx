import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ProjectProvider } from "@/lib/project";

export const metadata: Metadata = {
  title: "PathTrace",
  description: "OpenTelemetry-native distributed tracing and service observability",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ProjectProvider>
          <div className="app">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
