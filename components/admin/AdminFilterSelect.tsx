"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const emptyValue = "__all";

export default function AdminFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || emptyValue} onValueChange={(next) => onChange(next === emptyValue ? "" : next)}>
      <SelectTrigger className="admin-filter-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || emptyValue} value={option.value || emptyValue}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
