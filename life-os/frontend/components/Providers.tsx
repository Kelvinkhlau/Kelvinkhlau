"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "./Toast";
import { PaletteProvider } from "./command/paletteContext";
import { CommandPalette } from "./CommandPalette";
import { QuickCapture } from "./QuickCapture";
import { KeyboardHelp } from "./KeyboardHelp";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PaletteProvider>
        {children}
        <CommandPalette />
        <QuickCapture />
        <KeyboardHelp />
        <Toaster />
      </PaletteProvider>
    </QueryClientProvider>
  );
}
