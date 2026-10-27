"use client";

import styles from "./FilterGroup.module.css";

export default function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
  solid = false,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  solid?: boolean;
}) {
  return (
    <div className={`${styles.group} ${className}`} role="group" aria-label={label} data-solid={solid}>
      {options.map((option) => (
        <button key={option.key} type="button" aria-pressed={value === option.key} onClick={() => onChange(option.key)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
