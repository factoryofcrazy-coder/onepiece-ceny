"use client";
import { ReactNode, useCallback, useState } from "react";
import Nav from "./Nav";
import Sidebar from "./Sidebar";

/** Bočné menu a horná lišta okolo obsahu stránky. */
export default function AppChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="app">
      <Sidebar open={open} onClose={close} />
      <div className="app-main">
        <Nav onMenu={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}
