"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";

const EMPTY_VALUE = "__customer_select_empty__";

type Option = { value: string; label: string; disabled?: boolean };

export default function CustomerSelect({
  label,
  value,
  onValueChange,
  options,
  showAllOptions = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  showAllOptions?: boolean;
}) {
  return (
    <Select.Root value={value || EMPTY_VALUE} onValueChange={(next) => onValueChange(next === EMPTY_VALUE ? "" : next)}>
      <Select.Trigger className="customer-select-trigger" aria-label={label}>
        <Select.Value className="customer-select-value" />
        <Select.Icon className="customer-select-icon" aria-hidden="true">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={`customer-select-content${showAllOptions ? " customer-select-all-options" : ""}`}
          position="popper"
          side="bottom"
          sideOffset={6}
          align="start"
          collisionPadding={8}
        >
          <Select.Viewport className="customer-select-viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value || EMPTY_VALUE}
                disabled={option.disabled}
                className="customer-select-item"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="customer-select-check">
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
