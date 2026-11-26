import type { Metadata } from "next";
export const metadata: Metadata = { title: "BMO Fridge Buddy", description: "Your fridge inventory, wherever you are." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
