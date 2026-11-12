import FrameworkButton from "framework7-react/components/button.js";
import type { ComponentPropsWithRef } from "react";

type ButtonProps = Omit<ComponentPropsWithRef<"button">, "color"> & {
  variant?: "fill" | "tonal" | "plain";
  tone?: "primary" | "neutral";
  size?: "medium" | "large";
  fullWidth?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "fill",
  tone = "primary",
  size = "large",
  fullWidth,
  loading,
  className,
  type = "button",
  disabled,
  children,
  ref,
  ...props
}: ButtonProps) {
  const canUseFrameworkButton = !ref && disabled === undefined && loading === undefined
    && Object.keys(props).every((key) => key === "id" || key === "style" || key === "onClick" || key === "role"
      || key.startsWith("aria-") || key.startsWith("data-"));

  if (canUseFrameworkButton) {
    return (
      <FrameworkButton
        {...props}
        type={type}
        className={[variant === "plain" ? "here-button-plain" : "here-button", className].filter(Boolean).join(" ")}
        round={variant !== "plain"}
        fill={variant === "fill"}
        tonal={variant === "tonal"}
        large={variant !== "plain" && size === "large"}
        data-tone={tone}
        data-full-width={fullWidth || undefined}
      >
        {variant === "plain" ? children : <span className="here-button__label">{children}</span>}
      </FrameworkButton>
    );
  }

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={[
        variant === "plain" ? "here-button-plain" : "button button-round here-button",
        variant === "fill" && "button-fill",
        variant === "tonal" && "button-tonal",
        variant !== "plain" && size === "large" && "button-large",
        className,
      ].filter(Boolean).join(" ")}
      data-tone={tone}
      data-full-width={fullWidth || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
    >
      {variant === "plain" ? children : <span className="here-button__label">{children}</span>}
      {loading && variant !== "plain" && <span aria-hidden="true" className="here-button__loader" />}
    </button>
  );
}
