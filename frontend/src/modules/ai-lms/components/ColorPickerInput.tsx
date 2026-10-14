'use client';

import React from 'react';

export const PRESET_ACCENT_COLORS = [
  { label: 'Indigo', hex: '#6366f1' },
  { label: 'Sky Blue', hex: '#38bdf8' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Rose Pink', hex: '#ec4899' },
  { label: 'Purple', hex: '#8b5cf6' },
  { label: 'Ocean Cyan', hex: '#06b6d4' },
  { label: 'Coral', hex: '#f97316' },
  { label: 'Teal', hex: '#14b8a6' },
  { label: 'Slate', hex: '#64748b' },
];

interface ColorPickerInputProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  description?: string;
}

export default function ColorPickerInput({
  value,
  onChange,
  label = 'Accent Color',
  description = 'Card border tint, icons, badges, and highlights',
}: ColorPickerInputProps) {
  const activeColor = value || '#6366f1';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        <span
          className="text-[11px] tabular-nums px-2 py-0.5 rounded border"
          style={{
            color: activeColor,
            borderColor: activeColor + '40',
            backgroundColor: activeColor + '15',
          }}
        >
          {activeColor}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">{description}</p>

      <div className="flex items-center flex-wrap gap-2 pt-1">
        {PRESET_ACCENT_COLORS.map((c) => {
          const isSelected = activeColor.toLowerCase() === c.hex.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => onChange(c.hex)}
              title={c.label}
              className={`relative h-7 w-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                isSelected ? 'ring-2 ring-offset-2 ring-offset-background scale-110' : 'opacity-85 hover:opacity-100'
              }`}
              style={{
                backgroundColor: c.hex,
                boxShadow: isSelected ? `0 0 12px ${c.hex}60` : undefined,
                // Using standard CSS ring property via inline styles
                outline: isSelected ? `2px solid ${c.hex}` : 'none',
                outlineOffset: '2px',
              }}
            >
              {isSelected && (
                <svg
                  className="w-3.5 h-3.5 text-white drop-shadow-sm"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}

        {/* Custom native color picker input */}
        <label
          className="relative h-7 w-7 rounded-full border border-border border-dashed flex items-center justify-center cursor-pointer hover:border-foreground/50 transition-colors"
          title="Custom color"
        >
          <input
            type="color"
            value={activeColor.startsWith('#') && activeColor.length === 7 ? activeColor : '#6366f1'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <span className="text-xs text-muted-foreground font-semibold">+</span>
        </label>
      </div>
    </div>
  );
}
