"use client";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label={title} onClose={onCancel} urgent>
      <h2 className="text-t6 font-bold">{title}</h2>
      <p className="mt-2 text-t3 text-pretty text-ios-secondary">{description}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="tonal" size="medium" data-dialog-initial-focus onClick={onCancel}>취소</Button>
        <Button size="medium" className="here-button-danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
