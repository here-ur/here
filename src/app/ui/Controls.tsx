import type { ComponentPropsWithRef } from "react";
import FrameworkBadge from "framework7-react/components/badge.js";
import { Button } from "./Button";

export function TextArea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea {...props} className={["here-textarea", className].filter(Boolean).join(" ")} />;
}

type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type" | "className"> & {
  label: string;
  className?: string;
};

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={["here-checkbox", className].filter(Boolean).join(" ")}>
      <span className="checkbox here-checkbox__control">
        <input {...props} type="checkbox" />
        <i aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  );
}

type SwitchProps = Omit<ComponentPropsWithRef<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({ checked, onCheckedChange, children, ...props }: SwitchProps) {
  return (
    <Button {...props} variant="plain" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)}>
      {children}
      <span className="here-switch-track" data-checked={checked} aria-hidden="true" />
    </Button>
  );
}

export function Tab({ className, ...props }: ComponentPropsWithRef<"button">) {
  return <Button {...props} variant="plain" role="tab" className={["here-tab", className].filter(Boolean).join(" ")} />;
}

export function ListRow({ className, ...props }: ComponentPropsWithRef<"button">) {
  return <Button {...props} variant="plain" className={["here-list-row", className].filter(Boolean).join(" ")} />;
}

export function Badge({ className, children }: Pick<ComponentPropsWithRef<"span">, "className" | "children">) {
  return <FrameworkBadge className={["here-badge", className].filter(Boolean).join(" ")}>{children}</FrameworkBadge>;
}
