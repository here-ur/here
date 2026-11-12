import { useId, type ComponentPropsWithRef } from "react";

type TextFieldProps = ComponentPropsWithRef<"input"> & {
  label: string;
  hideLabel?: boolean;
  inputClassName?: string;
  variant?: "box" | "plain";
  help?: string;
  error?: string;
};

export function TextField({
  label,
  hideLabel,
  inputClassName,
  variant = "box",
  help,
  error,
  id,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const message = error || help;
  const messageId = message ? generatedId + "-message" : undefined;
  const description = [props["aria-describedby"], messageId].filter(Boolean).join(" ");
  return (
    <div className={["here-field", className].filter(Boolean).join(" ")} data-variant={variant}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "here-field__label"}>{label}</label>
      <input
        {...props}
        id={inputId}
        className={["here-field__input", inputClassName].filter(Boolean).join(" ")}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={description || undefined}
      />
      {message && <p id={messageId} className="here-field__message" role={error ? "alert" : undefined}>{message}</p>}
    </div>
  );
}
