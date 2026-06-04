"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChangeEvent, InputHTMLAttributes, useRef } from "react";

/**
 * Props for {@link SearchInput}: a fixed-size, controlled search field with a
 * leading magnifying glass icon, a vertical divider, a native `<input>`, and
 * a trailing clear button that appears once the field has a value. `value`
 * and `onChange` are required — this is a controlled component. Remaining
 * native input attributes (`placeholder`, `name`, `aria-*`, `disabled`, …)
 * pass through. `className`, `type`, and `defaultValue` do not — the field
 * owns its full layout per the design system, its `type` is locked to
 * `"search"`, and uncontrolled usage is not supported.
 */
export type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "type" | "value" | "defaultValue" | "onChange"
> & {
  /** Current text value of the input. */
  value: string;
  /** Called with the native React change event on every keystroke, and with an empty value when the user clicks the clear button. */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Controlled search field primitive. Fixed `27.5625rem` × `3.375rem` outer
 * size with `0.625rem`/`1.875rem` padding, `1.125rem` gap, `0.625rem` corner
 * radius, a 1px `wb-gray` border on a `wb-almost-black` fill. Renders a
 * leading `MagnifyingGlassIcon`, a vertical `wb-gray` divider, then a native
 * `<input type="search">`. When `value` is non-empty (and the field isn't
 * disabled), a trailing white `XMarkIcon` clear button appears with a
 * generous padded hit area and resets the field via a real `input` event,
 * so `onChange` fires with the empty value. The wrapper lights up its
 * border on focus-within.
 */
export function SearchInput({
  value,
  onChange,
  disabled,
  ...rest
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = value.length > 0;

  const handleClear = () => {
    const input = inputRef.current;
    if (!input) return;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  };

  return (
    <div className="flex w-110.25 h-13.5 px-7.5 py-2.5 items-center gap-4.5 rounded-[0.625rem] border border-wb-gray bg-wb-almost-black transition-colors focus-within:border-white/60">
      <MagnifyingGlassIcon
        aria-hidden
        className="w-5 h-5 shrink-0 text-wb-gray"
      />
      <span aria-hidden className="self-stretch w-px bg-wb-gray" />
      <input
        ref={inputRef}
        {...rest}
        value={value}
        disabled={disabled}
        onChange={onChange}
        type="search"
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-base placeholder:text-wb-gray [&::-webkit-search-cancel-button]:appearance-none [&::-ms-clear]:hidden"
      />
      {hasValue && !disabled && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="-my-2.5 -mr-2.5 p-2.5 shrink-0 rounded-md text-white transition-colors hover:bg-white/10 active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <XMarkIcon aria-hidden className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
