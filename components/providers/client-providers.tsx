"use client";

import { ToastProvider } from "./toast-provider";
import { UploadProvider } from "./upload-provider";
import ToastStack from "../toast-stack";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <UploadProvider>
        {children}
        <ToastStack />
      </UploadProvider>
    </ToastProvider>
  );
}
