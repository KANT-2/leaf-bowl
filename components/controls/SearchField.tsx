"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import styles from "./SearchField.module.css";

type SearchFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clear?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
};

export default function SearchField({
  label,
  value,
  onChange,
  placeholder,
  clear = true,
  disabled = false,
  loading = false,
  error,
  className = "",
}: SearchFieldProps) {
  const id = useId();
  return (
    <div className={`${styles.root} ${className}`}>
      <div className={styles.field} data-error={!!error} data-disabled={disabled} aria-busy={loading}>
        <Search className={styles.icon} aria-hidden="true" />
        <input
          id={id}
          type="search"
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        {clear && value && (
          <button
            type="button"
            className={styles.clear}
            disabled={disabled}
            aria-label={`${label} 지우기`}
            onClick={() => {
              onChange("");
              document.getElementById(id)?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
