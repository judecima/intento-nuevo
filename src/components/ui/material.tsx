"use client";

import React, { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";

type LooseProps = {
  [key: string]: any;
  children?: ReactNode;
  className?: string;
};

export const MtCard = forwardRef<HTMLDivElement, LooseProps>(function MtCard({ children, className = "", ...props }, ref) {
  return (
    <div ref={ref} className={`bg-white rounded-xl shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
});

export const MtCardHeader = forwardRef<HTMLDivElement, LooseProps>(function MtCardHeader({ children, className = "", ...props }, ref) {
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
});

export const MtCardBody = forwardRef<HTMLDivElement, LooseProps>(function MtCardBody({ children, className = "", ...props }, ref) {
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
});

const CHIP_COLORS: Record<string, string> = {
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  "blue-gray": "bg-slate-100 text-slate-700 border-slate-200",
  red: "bg-red-50 text-red-700 border-red-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200"
};

export function MtChip({
  value,
  color = "teal",
  size = "sm",
  className = "",
  ...props
}: {
  value?: ReactNode;
  color?: string;
  size?: string;
  className?: string;
  [key: string]: any;
}) {
  const colorClass = CHIP_COLORS[color] || CHIP_COLORS["blue-gray"];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border text-xs font-medium rounded ${colorClass} ${className}`}
      {...props}
    >
      {value}
    </span>
  );
}

export function MtIconButton({
  children,
  className = "",
  onClick,
  type = "button",
  "aria-label": ariaLabel,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
  [key: string]: any;
}) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex items-center justify-center p-1.5 rounded text-sm hover:opacity-80 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function MtTypography({
  as: Component = "p",
  variant = "paragraph",
  children,
  className = "",
  ...props
}: {
  as?: any;
  variant?: string;
  children?: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  const Tag = Component || "p";
  return (
    <Tag className={className} {...props}>
      {children}
    </Tag>
  );
}

type MtInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  containerProps?: { className?: string };
  crossOrigin?: string;
  color?: string;
  [key: string]: any;
};

export const MtInput = forwardRef<HTMLInputElement, MtInputProps>(
  function MtInput({ label, className = "", containerProps, id, crossOrigin: _co, color: _c, ...props }, ref) {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    return (
      <div className={`flex flex-col gap-1.5 ${containerProps?.className || ""}`}>
        {label ? (
          <label htmlFor={inputId} className="field-label">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={`input focus-ring ${className}`}
          {...props}
        />
      </div>
    );
  }
);

type MtTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  containerProps?: { className?: string };
  color?: string;
  [key: string]: any;
};

export const MtTextarea = forwardRef<HTMLTextAreaElement, MtTextareaProps>(
  function MtTextarea({ label, className = "", containerProps, id, color: _c, ...props }, ref) {
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    return (
      <div className={`flex flex-col gap-1.5 ${containerProps?.className || ""}`}>
        {label ? (
          <label htmlFor={textareaId} className="field-label">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={textareaId}
          className={`textarea focus-ring ${className}`}
          {...props}
        />
      </div>
    );
  }
);

const ALERT_COLORS: Record<string, string> = {
  red: "bg-red-50 border-red-500 text-red-800",
  teal: "bg-teal-50 border-teal-500 text-teal-800",
  amber: "bg-amber-50 border-amber-500 text-amber-800",
  green: "bg-emerald-50 border-emerald-500 text-emerald-800"
};

export function MtAlert({
  children,
  color = "red",
  className = "",
  ...props
}: {
  children?: ReactNode;
  color?: string;
  className?: string;
  [key: string]: any;
}) {
  const colorClass = ALERT_COLORS[color] || ALERT_COLORS.red;
  return (
    <div className={`p-3 rounded border-l-4 text-sm ${colorClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SurfaceCard({ children, className = "", bodyClassName = "" }: SurfaceCardProps) {
  return (
    <MtCard
      className={`rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] text-[var(--ink)] shadow-md ${className}`}
    >
      <MtCardBody className={bodyClassName}>{children}</MtCardBody>
    </MtCard>
  );
}

export function SurfaceTitle({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <MtTypography as="div" variant="small" className="font-semibold uppercase tracking-[0.14em] text-[var(--teal)]">
        {eyebrow}
      </MtTypography>
      <MtTypography as="h1" variant="h3" className="mt-2 font-medium tracking-normal text-[var(--ink)]">
        {title}
      </MtTypography>
      {description ? (
        <MtTypography as="p" variant="small" className="mt-2 max-w-3xl font-normal leading-6 text-[var(--muted)]">
          {description}
        </MtTypography>
      ) : null}
    </div>
  );
}

export function StatusChip({
  value,
  color = "teal",
  className = ""
}: {
  value: ReactNode;
  color?: "teal" | "amber" | "blue-gray" | "red" | "green";
  className?: string;
}) {
  return <MtChip size="sm" color={color} value={value} className={`rounded-md normal-case ${className}`} />;
}

export function NoticeAlert({
  children,
  color = "red",
  className = ""
}: {
  children: ReactNode;
  color?: "red" | "teal" | "amber" | "green";
  className?: string;
}) {
  return (
    <MtAlert color={color} className={`rounded-lg border-l-4 text-sm ${className}`}>
      {children}
    </MtAlert>
  );
}
