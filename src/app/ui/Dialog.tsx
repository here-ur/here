"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ label, onClose, children, urgent }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  urgent?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      role={urgent ? "alertdialog" : undefined}
      aria-label={label}
      className="here-dialog motion-safe:animate-pop"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="here-dialog__content">{children}</div>
    </dialog>
  );
}
