"use client";

const WINDOWS = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
];

export function TimeWindowSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>Window</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
      </select>
    </div>
  );
}

export { WINDOWS };
