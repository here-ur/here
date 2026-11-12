"use client";

import Framework7 from "framework7/lite";
import Framework7React, { App } from "framework7-react";
import type { ReactNode } from "react";

// Framework7 plugin registration runs before rendering App.
// eslint-disable-next-line react-hooks/rules-of-hooks
Framework7.use(Framework7React);

export function FrameworkShell({ children }: { children: ReactNode }) {
  return <App theme="ios" className="here-framework-root">{children}</App>;
}
