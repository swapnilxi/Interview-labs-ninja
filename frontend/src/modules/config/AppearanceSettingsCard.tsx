'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { ACCENT_PRESETS, applyAccent, getStoredAccent, isValidHex, setStoredAccent } from '@/lib/services/appearanceService';
import {
  SidebarMode,
  getStoredSidebarMode,
  setStoredSidebarMode,
  subscribeSidebarMode,
} from '@/lib/services/sidebarService';
import { SETTINGS_CARD, SettingsCardHeader } from './SettingsCard';

const DEFAULT_SWATCH = '#5b5bd6';

export default function AppearanceSettingsCard() {
  const [accentHex, setAccentHex] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState('#7131CC');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('icon-only');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAccentHex(getStoredAccent());
    setSidebarMode(getStoredSidebarMode());
    setHydrated(true);
    const unsub = subscribeSidebarMode((m) => setSidebarMode(m));
    return () => unsub();
  }, []);

  const choose = (hex: string | null) => {
    setAccentHex(hex);
    setStoredAccent(hex);
    applyAccent(hex);
  };

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
    setStoredSidebarMode(mode);
  };

  const isCustomActive = hydrated && !!accentHex && !ACCENT_PRESETS.some((p) => p.hex?.toLowerCase() === accentHex.toLowerCase());

  return (
    <div className={SETTINGS_CARD}>
      <SettingsCardHeader
        icon="SwatchIcon"
        title="Appearance"
        description="Pick an accent color for buttons, highlights, focus rings, and glow effects across the whole app"
      />

      <div className="flex flex-wrap gap-3">
        {ACCENT_PRESETS.map((preset) => {
          const isActive = hydrated && accentHex === preset.hex;
          const swatch = preset.hex || DEFAULT_SWATCH;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => choose(preset.hex)}
              title={preset.label}
              aria-pressed={isActive}
              className={`todo-focus flex flex-col items-center gap-1.5 w-20 rounded-lg border p-2 transition-smooth ${
                isActive ? 'mix-border-primary/60 mix-bg-primary/[0.08]' : 'border-border hover:mix-border-primary/30'
              }`}
            >
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: swatch,
                  boxShadow: isActive ? `0 0 14px ${swatch}66` : undefined,
                  border: preset.hex ? undefined : '2px dashed rgba(127,127,127,0.4)',
                }}
              >
                {isActive && (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="w-full break-words text-center text-xs font-medium leading-tight text-muted-foreground">
                {preset.label}
              </span>
            </button>
          );
        })}

        <label
          className={`flex flex-col items-center gap-1.5 w-20 rounded-lg border p-2 cursor-pointer transition-smooth focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
            isCustomActive ? 'mix-border-primary/60 mix-bg-primary/[0.08]' : 'border-border hover:mix-border-primary/30'
          }`}
        >
          <span
            className="relative h-8 w-8 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground text-xs font-semibold overflow-hidden flex-shrink-0"
            style={isCustomActive ? { backgroundColor: accentHex as string, color: 'transparent', borderStyle: 'solid' } : undefined}
          >
            +
            <input
              type="color"
              value={isValidHex(customHex) ? customHex : '#7131CC'}
              onChange={(e) => {
                setCustomHex(e.target.value);
                choose(e.target.value);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="Custom accent color"
            />
          </span>
          <span className="text-xs font-medium leading-tight text-muted-foreground">Custom</span>
        </label>
      </div>

      {/* Sidebar Navigation Layout Mode */}
      <div className="pt-[1.25rem] border-t border-border space-y-3">
        <div className="flex items-center gap-2.5">
          <Icon name="Bars3BottomLeftIcon" size={20} className="text-primary shrink-0" />
          <div>
            <h4 className="font-heading text-sm font-semibold text-foreground">Left-Hand Menu Layout</h4>
            <p className="text-xs text-muted-foreground">
              Choose whether the left-hand navigation is completely hidden or kept visible as a compact icon-only menu
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Icon-Only Mode Option */}
          <button
            type="button"
            onClick={() => handleSidebarModeChange('icon-only')}
            aria-pressed={sidebarMode === 'icon-only'}
            className={`todo-focus flex items-start gap-3 p-3.5 rounded-lg border text-left transition-smooth ${
              sidebarMode === 'icon-only'
                ? 'mix-border-primary/60 mix-bg-primary/[0.08]'
                : 'border-border hover:mix-border-primary/30 bg-card'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 transition-smooth ${
                sidebarMode === 'icon-only'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon name="Bars3BottomLeftIcon" size={18} variant="outline" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">Icon-Only Sidebar</span>
                {sidebarMode === 'icon-only' && (
                  <span className="text-[11px] font-semibold uppercase tracking-wider lab-ink lab-tint px-1.5 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Keeps a compact 60px icon rail docked on the left with instant tooltips, popovers, and quick access to all labs and tools.
              </p>
            </div>
          </button>

          {/* Hidden Mode Option */}
          <button
            type="button"
            onClick={() => handleSidebarModeChange('hidden')}
            aria-pressed={sidebarMode === 'hidden'}
            className={`todo-focus flex items-start gap-3 p-3.5 rounded-lg border text-left transition-smooth ${
              sidebarMode === 'hidden'
                ? 'mix-border-primary/60 mix-bg-primary/[0.08]'
                : 'border-border hover:mix-border-primary/30 bg-card'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 transition-smooth ${
                sidebarMode === 'hidden'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon name="EyeSlashIcon" size={18} variant="outline" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">Completely Hidden</span>
                {sidebarMode === 'hidden' && (
                  <span className="text-[11px] font-semibold uppercase tracking-wider lab-ink lab-tint px-1.5 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Leaves the left screen completely clear until you explicitly click the hamburger button in the header.
              </p>
            </div>
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Applies instantly and is saved to this browser only — it doesn&apos;t sync across devices.
      </p>
    </div>
  );
}
