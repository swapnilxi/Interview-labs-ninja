'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  ACCENT_PRESETS,
  applyAccent,
  getStoredAccent,
  isValidHex,
  setStoredAccent,
  withColorTransition,
} from '@/lib/services/appearanceService';
import {
  SidebarMode,
  getStoredSidebarMode,
  setStoredSidebarMode,
  subscribeSidebarMode,
} from '@/lib/services/sidebarService';
import { SETTINGS_CARD, SettingsCardHeader } from './SettingsCard';

/** Readable mark colour on a swatch: ink on light swatches, white on dark ones. */
function markColor(hex: string): string {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#0b1020' : '#ffffff';
}

/**
 * The accent actually in use (per theme the shade is adjusted for contrast, see appearanceService.deriveAccentTokens),
 * re-read when the accent or the theme changes (both land on <html>: an inline style, the `dark` class).
 */
function useAppliedAccent(): { applied: string; fallbackDefault: string } {
  const [state, setState] = useState({ applied: '', fallbackDefault: '' });
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const cs = getComputedStyle(root);
      setState({
        applied: cs.getPropertyValue('--color-primary').trim(),
        fallbackDefault: cs.getPropertyValue('--accent-default').trim(),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);
  return state;
}

/** `hideHeader`: the Settings page already titles this section, so the card drops its own icon and title. */
export default function AppearanceSettingsCard({
  hideHeader = false,
}: { hideHeader?: boolean } = {}) {
  const [accentHex, setAccentHex] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState('#7131CC');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('icon-only');
  const [hydrated, setHydrated] = useState(false);
  const { applied, fallbackDefault } = useAppliedAccent();

  useEffect(() => {
    const stored = getStoredAccent();
    setAccentHex(stored);
    if (stored && !ACCENT_PRESETS.some((p) => p.hex?.toLowerCase() === stored.toLowerCase())) setCustomHex(stored);
    setSidebarMode(getStoredSidebarMode());
    setHydrated(true);
    const unsub = subscribeSidebarMode((m) => setSidebarMode(m));
    return () => unsub();
  }, []);

  // Same store, same apply as before: the whole interface re-tints at once (CSS variables on <html>), with a short
  // cross-fade instead of a snap.
  const choose = (hex: string | null) => {
    setAccentHex(hex);
    setStoredAccent(hex);
    withColorTransition(() => applyAccent(hex));
  };

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode);
    setStoredSidebarMode(mode);
  };

  const activePreset = hydrated ? ACCENT_PRESETS.find((p) => (p.hex?.toLowerCase() ?? null) === (accentHex?.toLowerCase() ?? null)) : undefined;
  const isCustomActive = hydrated && !!accentHex && !activePreset;
  const selectedName = !hydrated ? '' : isCustomActive ? 'Custom' : activePreset?.label ?? 'Default';
  const shownHex = (applied || fallbackDefault).toUpperCase();
  const adjusted = !!accentHex && !!applied && applied.toLowerCase() !== accentHex.toLowerCase();

  return (
    <div id="appearance" className={`${SETTINGS_CARD} scroll-mt-[calc(var(--chrome-top)+1rem)]`}>
      {!hideHeader && (
        <SettingsCardHeader
          icon="SwatchIcon"
          title="Appearance"
          description="Pick an accent color for buttons, highlights, focus rings, and glow effects across the whole app"
        />
      )}

      {/* Live preview: real controls drawn with the accent tokens, so the choice is visible right here as well as
          everywhere else (the whole app re-tints at the same moment). */}
      <div className="accent-preview" aria-hidden="true">
        <span className="accent-preview-button">Continue</span>
        <span className="accent-preview-switch">
          <span />
        </span>
        <span className="accent-preview-check">
          <Icon name="CheckIcon" size={14} variant="solid" />
        </span>
        <span className="accent-preview-segment">
          <span className="ios-segment ios-segment-active h-7 px-2.5">Day</span>
          <span className="ios-segment h-7 px-2.5">Week</span>
        </span>
        <span className="accent-preview-progress">
          <span />
        </span>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h4 className="text-[15px] font-semibold text-foreground">Accent colour</h4>
          {hydrated && (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
              <span className="font-semibold text-foreground">{selectedName}</span>
              <span className="font-code text-[12px] tabular-nums">{shownHex}</span>
            </span>
          )}
        </div>

        <div className="accent-swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENT_PRESETS.map((preset) => {
            const isActive = hydrated && (accentHex?.toLowerCase() ?? null) === (preset.hex?.toLowerCase() ?? null);
            const swatch = preset.hex ?? (fallbackDefault || 'var(--accent-default)');
            return (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => choose(preset.hex)}
                title={preset.hex ? `${preset.label} ${preset.hex}` : 'Default (lime on dark, fern on light)'}
                className="accent-swatch"
                data-active={isActive || undefined}
              >
                <span className="accent-swatch-dot" style={{ ['--swatch' as string]: swatch }}>
                  {isActive && (
                    <Icon
                      name="CheckIcon"
                      size={20}
                      variant="solid"
                      className="accent-swatch-check"
                      style={{ color: preset.hex ? markColor(preset.hex) : 'var(--color-primary-foreground)' }}
                    />
                  )}
                </span>
                <span className="accent-swatch-label">{preset.label}</span>
              </button>
            );
          })}

          <label className="accent-swatch cursor-pointer" data-active={isCustomActive || undefined} title="Custom colour">
            <span
              className={`accent-swatch-dot ${isCustomActive ? '' : 'accent-swatch-dot-custom'}`}
              style={isCustomActive ? { ['--swatch' as string]: accentHex as string } : undefined}
            >
              {isCustomActive ? (
                <Icon name="CheckIcon" size={20} variant="solid" className="accent-swatch-check" style={{ color: markColor(accentHex as string) }} />
              ) : (
                <Icon name="PlusIcon" size={20} className="text-white drop-shadow" />
              )}
              <input
                type="color"
                value={isValidHex(customHex) ? customHex : '#7131CC'}
                onChange={(e) => {
                  setCustomHex(e.target.value);
                  choose(e.target.value);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Custom accent colour"
              />
            </span>
            <span className="accent-swatch-label">Custom</span>
          </label>
        </div>

        {adjusted && (
          <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
            The shade is adjusted for this theme so text and buttons stay readable.
          </p>
        )}
      </div>

      {/* Sidebar Navigation Layout Mode — tablet and desktop only: phones have no left-hand menu (the tab bar replaces it). */}
      <div className="hidden space-y-3 border-t border-border pt-[1.25rem] md:block">
        <div className="flex items-center gap-2.5">
          <Icon name="Bars3BottomLeftIcon" size={20} className="lab-ink shrink-0" />
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
                  <span className="lab-ink lab-tint rounded-full px-2 py-0.5 text-xs font-semibold">
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
                  <span className="lab-ink lab-tint rounded-full px-2 py-0.5 text-xs font-semibold">
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
