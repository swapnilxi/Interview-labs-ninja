/**
 * Visual portfolio templates — decorative background + card treatment.
 *
 * The CSS here is injected via a <style> tag by PortfolioWidgetsView so the
 * SAME styling drives the live editor preview and the public /p/{slug} page.
 * The backend render.py mirrors this for HTML/PDF export. All templates are
 * light (no per-widget text-colour overrides needed); pattern backgrounds
 * degrade gracefully to a plain fill in xhtml2pdf server PDFs.
 */

export const ACCENT_HEX: Record<string, string> = {
  violet: '#7c3aed',
  emerald: '#059669',
  blue: '#2563eb',
  rose: '#e11d48',
  amber: '#d97706',
  slate: '#334155',
};

/** Full CSS for every template, scoped under `.pf-shell` / `.pf-tpl-*`. */
export function portfolioTemplateCss(accentHex: string): string {
  const A = accentHex;
  return `
.pf-shell { padding: 32px 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pf-card { background: #fff; border: 1px solid rgba(0,0,0,.05); box-shadow: 0 1px 2px rgba(0,0,0,.05); }

.pf-tpl-minimal { background: #f1f1f4; }

.pf-tpl-isometric {
  background-color: #eef0f7;
  background-image:
    linear-gradient(30deg, ${A}20 12%, transparent 12.5%, transparent 87%, ${A}20 87.5%, ${A}20),
    linear-gradient(150deg, ${A}20 12%, transparent 12.5%, transparent 87%, ${A}20 87.5%, ${A}20),
    linear-gradient(30deg, ${A}20 12%, transparent 12.5%, transparent 87%, ${A}20 87.5%, ${A}20),
    linear-gradient(150deg, ${A}20 12%, transparent 12.5%, transparent 87%, ${A}20 87.5%, ${A}20),
    linear-gradient(60deg, ${A}12 25%, transparent 25.5%, transparent 75%, ${A}12 75%, ${A}12),
    linear-gradient(60deg, ${A}12 25%, transparent 25.5%, transparent 75%, ${A}12 75%, ${A}12);
  background-size: 42px 73px;
  background-position: 0 0, 0 0, 21px 36px, 21px 36px, 0 0, 21px 36px;
}
.pf-tpl-isometric .pf-card { background: rgba(255,255,255,.86); border: 1px solid rgba(255,255,255,.7); box-shadow: 0 24px 50px -24px rgba(31,36,48,.4); }

.pf-tpl-aurora {
  background:
    radial-gradient(closest-side at 18% 12%, ${A}33, transparent),
    radial-gradient(closest-side at 84% 6%, #f472b636, transparent),
    radial-gradient(closest-side at 60% 100%, ${A}26, transparent),
    #f4f4fb;
}
.pf-tpl-aurora .pf-card { background: rgba(255,255,255,.82); border: 1px solid #fff; box-shadow: 0 24px 55px -28px ${A}66; }

.pf-tpl-blueprint {
  background-color: #f6f8fc;
  background-image:
    linear-gradient(${A}14 1px, transparent 1px),
    linear-gradient(90deg, ${A}14 1px, transparent 1px);
  background-size: 22px 22px;
}
.pf-tpl-blueprint .pf-card { background: #fff; border-top: 3px solid ${A}; box-shadow: 0 12px 30px -18px rgba(31,36,48,.35); }

.pf-tpl-dots {
  background-color: #f4f5f9;
  background-image: radial-gradient(${A}26 1.4px, transparent 1.6px);
  background-size: 18px 18px;
}
.pf-tpl-dots .pf-card { background: #fff; box-shadow: 0 14px 34px -20px rgba(31,36,48,.32); }

.pf-tpl-mesh {
  background:
    radial-gradient(closest-side at 0% 0%, ${A}30, transparent),
    radial-gradient(closest-side at 100% 18%, #22d3ee33, transparent),
    radial-gradient(closest-side at 28% 92%, #f59e0b2e, transparent),
    radial-gradient(closest-side at 92% 100%, ${A}26, transparent),
    #eef0f8;
}
.pf-tpl-mesh .pf-card { background: rgba(255,255,255,.84); border: 1px solid #fff; box-shadow: 0 24px 55px -28px ${A}59; }

.pf-tpl-carbon {
  background-color: #eef1f5;
  background-image: repeating-linear-gradient(45deg, ${A}0d 0, ${A}0d 1px, transparent 1px, transparent 11px);
}
.pf-tpl-carbon .pf-card { background: #fff; border: 1px solid #e2e6ee; box-shadow: 0 10px 28px -18px rgba(31,36,48,.4); }
`;
}
