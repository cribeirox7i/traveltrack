"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type TripDisclaimerCtx = {
  content: ReactNode | null;
  setContent: (c: ReactNode | null) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
};

const TripDisclaimerContext = createContext<TripDisclaimerCtx | null>(null);

export function TripDisclaimerProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <TripDisclaimerContext.Provider value={{ content, setContent, open, setOpen }}>
      {children}
    </TripDisclaimerContext.Provider>
  );
}

export function useTripDisclaimer() {
  return useContext(TripDisclaimerContext);
}
