"use client";

import type { ComponentType, ReactNode } from "react";
import {
  Alert as RawAlert,
  Card as RawCard,
  CardBody as RawCardBody,
  CardHeader as RawCardHeader,
  Chip as RawChip,
  IconButton as RawIconButton,
  Input as RawInput,
  Textarea as RawTextarea,
  Typography as RawTypography
} from "@material-tailwind/react";

type LooseMaterialProps = {
  [key: string]: any;
  children?: ReactNode;
};

export const MtAlert = RawAlert as unknown as ComponentType<LooseMaterialProps>;
export const MtCard = RawCard as unknown as ComponentType<LooseMaterialProps>;
export const MtCardBody = RawCardBody as unknown as ComponentType<LooseMaterialProps>;
export const MtCardHeader = RawCardHeader as unknown as ComponentType<LooseMaterialProps>;
export const MtChip = RawChip as unknown as ComponentType<LooseMaterialProps>;
export const MtIconButton = RawIconButton as unknown as ComponentType<LooseMaterialProps>;
export const MtInput = RawInput as unknown as ComponentType<LooseMaterialProps>;
export const MtTextarea = RawTextarea as unknown as ComponentType<LooseMaterialProps>;
export const MtTypography = RawTypography as unknown as ComponentType<LooseMaterialProps>;

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SurfaceCard({ children, className = "", bodyClassName = "" }: SurfaceCardProps) {
  return (
    <MtCard
      shadow
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
  return <MtChip size="sm" variant="ghost" color={color} value={value} className={`rounded-md normal-case ${className}`} />;
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
    <MtAlert variant="ghost" color={color} className={`rounded-lg border-l-4 text-sm ${className}`}>
      {children}
    </MtAlert>
  );
}
