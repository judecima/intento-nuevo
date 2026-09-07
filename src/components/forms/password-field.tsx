"use client";

import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  value?: string;
  onChange?: (value: string) => void;
};

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  value,
  onChange
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event.target.value);
  };

  return (
    <label className="block" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="relative mt-2 block">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          value={value}
          onChange={handleChange}
          className="input focus-ring pr-12"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar password" : "Mostrar password"}
          className="focus-ring absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[var(--muted)] transition hover:bg-[var(--brand-primary-hover-surface)] hover:text-[var(--teal)]"
        >
          {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
        </button>
      </span>
    </label>
  );
}

export function PasswordConfirmationFields() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const confirmRef = useRef<HTMLInputElement | null>(null);
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    confirmRef.current?.setCustomValidity(mismatch ? "Las contrasenas no coinciden." : "");
  }, [mismatch]);

  return (
    <div className="space-y-4">
      <PasswordField
        name="password"
        label="Password"
        minLength={8}
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />
      <ConfirmPasswordField
        value={confirmPassword}
        onChange={setConfirmPassword}
        inputRef={(element) => {
          confirmRef.current = element;
        }}
        mismatch={mismatch}
      />
    </div>
  );
}

function ConfirmPasswordField({
  value,
  onChange,
  inputRef,
  mismatch
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  mismatch: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <label className="block" htmlFor={id}>
      <span className="field-label">Repetir password</span>
      <span className="relative mt-2 block">
        <input
          id={id}
          ref={inputRef}
          name="confirmPassword"
          type={visible ? "text" : "password"}
          required
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input focus-ring pr-12"
          autoComplete="new-password"
          aria-invalid={mismatch}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar password" : "Mostrar password"}
          className="focus-ring absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[var(--muted)] transition hover:bg-[var(--brand-primary-hover-surface)] hover:text-[var(--teal)]"
        >
          {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
        </button>
      </span>
      {mismatch ? <span className="hint mt-1 block text-[var(--danger)]">Las contrasenas no coinciden.</span> : null}
    </label>
  );
}
