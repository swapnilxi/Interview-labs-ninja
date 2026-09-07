'use client';

/**
 * Visionary — a cinematic, dark, glass-panel portfolio template. Like
 * Modern3D, it owns its entire page shell (Three.js hero, custom cursor,
 * scroll reveals) instead of the shared background+card treatment every
 * other template uses, and is a LIVE-BROWSER-ONLY experience — deliberately
 * absent from templates/index.ts's REGISTRY for the same reason Modern3D is
 * (see that file's header comment). xhtml2pdf can't run WebGL, so PDF/DOCX/
 * HTML export and the Template Designer's string preview fall back to a
 * static card treatment instead (backend/.../portfolio/templates/visionary.py,
 * and the `minimal` alias in templatePreview.ts).
 *
 * Ported from a hardcoded single-person Google AI Studio scaffold that used
 * to live in this folder (React 19 + Tailwind v4 + Framer Motion, none of
 * which this app depends on) — the visual language (glass panels, indigo/
 * cyan glow, Inter + Instrument Serif italic + JetBrains Mono type system,
 * ambient background orbs, custom cursor, ambient 3D hero artifact) is
 * reused wholesale; all content is read from real PortfolioWidget data
 * instead of one person's hardcoded bio/projects.
 *
 * Dropped rather than ported: the Web Audio ambient drone (pure decoration,
 * unrelated to content), InteractiveSimulators (four bespoke mini-dashboards
 * hand-tuned to specific hardcoded projects — don't generalize to arbitrary
 * user data), ResumeModal (this app already has a real resume/export feature
 * elsewhere), and the contact section's client-only fake form (no real
 * submit handler in the source — kept only the mailto/copy-email/social-links
 * row, matching Modern3D's contact treatment).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ACCENT_HEX } from '../../../shared/portfolioTemplates';
import type { PortfolioTheme, PortfolioWidget } from '../../../shared/types';

/** Deterministic (not random) accent-glow pick for a project/experience card,
 * so the same entry always gets the same colour and it doesn't shift on
 * re-render — mirrors Modern3DView's projectCoverGradient() approach. */
const GLOW_COLORS = [
  'rgba(52, 211, 153, 0.18)', // emerald
  'rgba(96, 165, 250, 0.18)', // blue
  'rgba(167, 139, 250, 0.18)', // purple
  'rgba(244, 114, 182, 0.18)', // pink
];
function hashStr(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function glowFor(seed: string): string {
  return GLOW_COLORS[hashStr(seed) % GLOW_COLORS.length];
}

function visionaryCss(accentHex: string): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

.vn-root { font-family: 'Inter', ui-sans-serif, sans-serif; background: #020617; color: #cbd5e1; scroll-behavior: smooth; }
.vn-root * { box-sizing: border-box; }
.vn-root h1, .vn-root h2, .vn-root h3 { margin: 0; }
.vn-accent-serif { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; }
.vn-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

.vn-orb { position: fixed; border-radius: 9999px; pointer-events: none; z-index: 0; }
.vn-orb-1 { top: -10%; left: -10%; width: 500px; height: 500px; background: rgba(79,70,229,.20); filter: blur(140px); }
.vn-orb-2 { bottom: -5%; right: -5%; width: 600px; height: 600px; background: rgba(8,145,178,.10); filter: blur(160px); }
.vn-orb-3 { top: 45%; right: -10%; width: 450px; height: 450px; background: rgba(99,102,241,.10); filter: blur(150px); }

.vn-cursor-dot { position: fixed; top: 0; left: 0; width: 8px; height: 8px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgba(255,255,255,.8); pointer-events: none; z-index: 9999; will-change: transform; transition: width .18s ease, height .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease, margin .18s ease; }
.vn-cursor-dot.vn-cursor-active { width: 34px; height: 34px; margin: -13px 0 0 -13px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.6); box-shadow: none; }

.vn-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 60; padding: 24px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; transition: all .5s ease; }
.vn-nav.vn-nav-scrolled { padding: 14px 28px; background: rgba(2,6,23,.82); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,.1); }
.vn-nav-logo { display: flex; align-items: center; gap: 10px; min-width: 0; }
.vn-nav-badge { flex-shrink: 0; width: 32px; height: 32px; border-radius: 10px; background: ${accentHex}; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; box-shadow: 0 0 20px ${accentHex}80; }
.vn-nav-name { color: #fff; font-weight: 600; font-size: 12.5px; letter-spacing: .03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vn-nav-links { display: none; align-items: center; gap: 26px; }
@media (min-width: 900px) { .vn-nav-links { display: flex; } }
.vn-nav-link { position: relative; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .08em; color: #94a3b8; text-decoration: none; padding-bottom: 4px; }
.vn-nav-link:hover { color: #fff; }
.vn-nav-link::after { content: ''; position: absolute; left: 0; bottom: 0; height: 1px; width: 0; background: ${accentHex}; box-shadow: 0 0 8px ${accentHex}; transition: width .3s ease; }
.vn-nav-link:hover::after { width: 100%; }
.vn-nav-cta { flex-shrink: 0; padding: 9px 16px; border-radius: 999px; background: ${accentHex}; color: #fff; font-size: 11.5px; font-weight: 600; text-decoration: none; box-shadow: 0 0 20px ${accentHex}66; white-space: nowrap; }

.vn-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .14em; color: ${accentHex}; text-transform: uppercase; margin-bottom: 16px; }
.vn-eyebrow::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: ${accentHex}; box-shadow: 0 0 8px ${accentHex}; flex-shrink: 0; }
.vn-heading { font-size: clamp(1.7rem, 4vw, 2.5rem); font-weight: 700; color: #fff; letter-spacing: -.01em; }

.vn-hero { position: relative; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 140px 24px 80px; overflow: hidden; z-index: 1; text-align: center; }
.vn-hero-kicker { display: flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .1em; color: #94a3b8; margin-bottom: 22px; text-transform: uppercase; }
.vn-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #10b981; animation: vn-pulse 2s infinite; flex-shrink: 0; }
.vn-name-wrap { max-width: 1000px; width: 100%; min-width: 0; }
.vn-name { font-size: clamp(2.4rem, 7vw, 5.5rem); font-weight: 800; line-height: 1.05; letter-spacing: -.02em; white-space: nowrap; background: linear-gradient(160deg, #fff 0%, #f1f5f9 45%, #94a3b8 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.vn-role { margin: 18px 0 0; font-size: clamp(1rem, 2vw, 1.2rem); color: #94a3b8; }
.vn-tagline { margin: 14px auto 0; max-width: 600px; font-size: 16px; color: #cbd5e1; }
.vn-hero-canvas { width: 100%; max-width: 620px; height: 300px; margin: 30px auto 0; }
.vn-cta-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 6px; }
.vn-btn-solid { padding: 13px 28px; border-radius: 999px; background: ${accentHex}; color: #fff; font-weight: 600; font-size: 14px; text-decoration: none; box-shadow: 0 0 24px ${accentHex}66; transition: transform .2s ease; }
.vn-btn-solid:hover { transform: translateY(-2px); }
.vn-btn-ghost { padding: 13px 28px; border-radius: 999px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.15); color: #fff; font-weight: 600; font-size: 14px; text-decoration: none; transition: transform .2s ease, border-color .2s ease; }
.vn-btn-ghost:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.3); }
@keyframes vn-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

.vn-section { position: relative; z-index: 1; max-width: 1080px; margin: 0 auto; padding: 100px 24px; opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .7s ease; }
.vn-section.vn-in { opacity: 1; transform: translateY(0); }
.vn-glass { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 18px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); transition: border-color .3s ease, background .3s ease; }
.vn-glass:hover { background: rgba(255,255,255,.06); border-color: ${accentHex}55; }

.vn-about-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
@media (min-width: 860px) { .vn-about-grid { grid-template-columns: 1.4fr 1fr; align-items: start; } }
.vn-about-body { font-size: 17px; line-height: 1.75; color: #cbd5e1; white-space: pre-line; }
.vn-about-card { padding: 26px; }
.vn-about-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.07); font-size: 13px; }
.vn-about-row:last-child { border-bottom: none; }
.vn-about-row-label { font-family: 'JetBrains Mono', monospace; color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: .08em; }
.vn-about-row-value { color: #e2e8f0; text-align: right; }
.vn-badge-live { display: inline-flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #34d399; margin-bottom: 16px; }

.vn-skills-wrap { display: flex; flex-wrap: wrap; gap: 10px; }
.vn-skill-pill { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .02em; color: #cbd5e1; padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }

.vn-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
@media (min-width: 700px) { .vn-stats-grid { grid-template-columns: repeat(4, 1fr); } }
.vn-stat-card { padding: 22px 18px; }
.vn-stat-num { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 600; color: #fff; }
.vn-stat-label { margin-top: 6px; font-size: 12px; color: #94a3b8; }

.vn-proj-card { display: grid; grid-template-columns: 1fr; overflow: hidden; margin-bottom: 24px; position: relative; }
@media (min-width: 860px) { .vn-proj-card { grid-template-columns: 1.1fr .9fr; } }
.vn-proj-glow { position: absolute; inset: 0; opacity: .5; pointer-events: none; transition: opacity .4s ease; }
.vn-proj-card:hover .vn-proj-glow { opacity: .9; }
.vn-proj-body { position: relative; padding: 34px; }
.vn-proj-meta { display: flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .08em; color: #64748b; margin-bottom: 14px; text-transform: uppercase; }
.vn-proj-num { color: ${accentHex}; }
.vn-proj-title { font-size: 21px; font-weight: 700; color: #fff; margin: 0 0 6px; }
.vn-proj-sub { font-size: 14px; color: #94a3b8; margin: 0 0 16px; }
.vn-proj-body ul { margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 14px; line-height: 1.7; }
.vn-proj-visual { position: relative; min-height: 160px; }

.vn-exp-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 860px) { .vn-exp-grid { grid-template-columns: .85fr 1.15fr; align-items: start; } }
.vn-exp-list { display: flex; flex-direction: column; gap: 6px; }
.vn-exp-node { text-align: left; padding: 14px 16px; border-radius: 12px; border: 1px solid transparent; background: transparent; cursor: pointer; transition: background .25s ease, border-color .25s ease; font: inherit; color: inherit; }
.vn-exp-node:hover { background: rgba(255,255,255,.03); }
.vn-exp-node.vn-exp-active { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); }
.vn-exp-node-company { color: #fff; font-weight: 600; font-size: 14.5px; }
.vn-exp-node-role { color: #94a3b8; font-size: 12.5px; margin-top: 2px; }
.vn-exp-node-period { font-family: 'JetBrains Mono', monospace; color: #64748b; font-size: 11px; margin-top: 4px; }
.vn-exp-detail { padding: 28px; position: relative; overflow: hidden; }
.vn-exp-detail-glow { position: absolute; inset: 0; opacity: .6; pointer-events: none; transition: background .8s ease; }
.vn-exp-detail-body { position: relative; }
.vn-exp-detail-period { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #64748b; margin-bottom: 6px; }
.vn-exp-detail-title { font-size: 19px; font-weight: 700; color: #fff; }
.vn-exp-detail-sub { font-size: 13.5px; color: #94a3b8; margin-top: 2px; }
.vn-exp-detail ul { margin: 16px 0 0; padding-left: 18px; color: #cbd5e1; font-size: 14px; line-height: 1.8; }

.vn-contact { text-align: center; }
.vn-giant-email { display: inline-block; font-size: clamp(1.3rem, 4.6vw, 2.6rem); font-weight: 800; letter-spacing: -.01em; background: linear-gradient(120deg, #fff, ${accentHex}); -webkit-background-clip: text; background-clip: text; color: transparent; text-decoration: none; word-break: break-all; transition: filter .2s ease; }
.vn-giant-email:hover { filter: brightness(1.3); }
.vn-social-row { display: flex; gap: 12px; justify-content: center; margin-top: 26px; }
.vn-social-btn { width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; text-transform: uppercase; text-decoration: none; transition: transform .2s ease, background .2s ease, box-shadow .2s ease; }
.vn-social-btn:hover { transform: translateY(-3px); background: ${accentHex}; box-shadow: 0 10px 24px -8px ${accentHex}aa; }

@media (prefers-reduced-motion: reduce) {
  .vn-section { transition: none; opacity: 1; transform: none; }
  .vn-live-dot { animation: none; }
}
`;
}

function extractContent(widgets: PortfolioWidget[]) {
  const visible = widgets.filter((w) => !w.is_hidden);
  const hero = visible.find((w) => w.widget_type === 'hero')?.content || {};
  const contact = visible.find((w) => w.widget_type === 'contact')?.content || {};
  const about = visible.find((w) => w.widget_type === 'about' || w.widget_type === 'custom')?.content?.text || '';
  const skillsWidget = visible.find((w) => w.widget_type === 'skills');
  const skills: string[] = (skillsWidget?.content?.groups || []).flatMap((g: any) => g.items || []).filter(Boolean);
  const statsWidget = visible.find((w) => w.widget_type === 'stats');
  const stats: Array<{ label?: string; value?: string }> = (statsWidget?.content?.items || []).filter((s: any) => s && (s.label || s.value));
  const itemsOf = (matches: (wtype: string) => boolean) =>
    visible
      .filter((w) => matches(w.widget_type))
      .flatMap((w) => (Array.isArray(w.content?.items) ? w.content.items : []))
      .filter((it: any) => it && (it.title || it.subtitle || (it.bullets || []).length));
  // Same bucketing convention as Modern3DView: "projects" gets its own rail,
  // every other items-based widget (experience, education, certifications, …)
  // becomes the interactive career list.
  const passthrough = new Set(['hero', 'contact', 'about', 'custom', 'skills', 'stats', 'projects']);
  const projects = itemsOf((wtype) => wtype === 'projects');
  const experience = itemsOf((wtype) => !passthrough.has(wtype));
  return { hero, contact, about, skills, stats, projects, experience };
}

export default function VisionaryView({ widgets, theme }: { widgets: PortfolioWidget[]; theme?: PortfolioTheme | null }) {
  const accentHex = ACCENT_HEX[theme?.accent || 'violet'] || ACCENT_HEX.violet;
  const { hero, contact, about, skills, stats, projects, experience } = extractContent(widgets);

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const heroNameRef = useRef<HTMLHeadingElement>(null);
  const [activeExp, setActiveExp] = useState(0);

  // Nav bar: transparent over the hero, glassy once scrolled — plain DOM
  // class toggling (not React state) so a high-frequency scroll listener
  // doesn't re-render the whole page every frame.
  useEffect(() => {
    const onScroll = () => navRef.current?.classList.toggle('vn-nav-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keep the hero name on one line at any viewport width — same fix as
  // Modern3DView's heroNameRef effect (see that file for the full rationale):
  // clamp() scales with viewport but not name length, so shrink font-size by
  // the exact overflow ratio once white-space:nowrap forces a single line.
  useLayoutEffect(() => {
    const nameEl = heroNameRef.current;
    if (!nameEl) return;
    const fit = () => {
      nameEl.style.fontSize = '';
      const available = nameEl.clientWidth;
      const natural = nameEl.scrollWidth;
      if (available > 0 && natural > available) {
        const current = parseFloat(window.getComputedStyle(nameEl).fontSize);
        nameEl.style.fontSize = `${(current * available / natural) * 0.98}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(nameEl);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [hero.headline]);

  // Three.js hero artifact: a frosted-glass octahedron shell around a
  // metallic core, wrapped in a wireframe lattice with orbiting translucent
  // data panels and a slow particle drift. Tilts toward the pointer.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || host.clientWidth === 0) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050507, 0.08);
    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.z = 6;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const artifactGroup = new THREE.Group();
    scene.add(artifactGroup);

    const shellGeo = new THREE.OctahedronGeometry(1.6, 1);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, opacity: 0.85, transparent: true, roughness: 0.15, ior: 1.5, clearcoat: 1 });
    artifactGroup.add(new THREE.Mesh(shellGeo, shellMat));

    const latticeGeo = new THREE.IcosahedronGeometry(2.0, 1);
    const latticeMat = new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true, transparent: true, opacity: 0.12 });
    artifactGroup.add(new THREE.Mesh(latticeGeo, latticeMat));

    const coreGeo = new THREE.IcosahedronGeometry(0.7, 0);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.25 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    artifactGroup.add(core);

    const panelGroup = new THREE.Group();
    const panelGeo = new THREE.PlaneGeometry(0.8, 0.4);
    const panelMat = new THREE.MeshPhysicalMaterial({ color: accentHex, transmission: 0.8, opacity: 0.35, transparent: true, roughness: 0.3, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const panel = new THREE.Mesh(panelGeo, panelMat);
      const angle = (i / 6) * Math.PI * 2;
      panel.position.set(Math.cos(angle) * 2.4, Math.sin(angle) * 0.6, Math.sin(angle) * 2.4);
      panel.lookAt(0, 0, 0);
      panelGroup.add(panel);
    }
    artifactGroup.add(panelGroup);

    const particleCount = 140;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) particlePositions[i] = (Math.random() - 0.5) * 8;
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, transparent: true, opacity: 0.4 });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light1 = new THREE.PointLight(accentHex, 2.5, 12);
    light1.position.set(3, 3, 4);
    scene.add(light1);
    const light2 = new THREE.PointLight(0x34d399, 1.8, 12);
    light2.position.set(-3, -2, 2);
    scene.add(light2);

    let targetX = 0, targetY = 0;
    const onMouseMove = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    let raf = 0;
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) / 1000;
      artifactGroup.rotation.y += (targetX * 0.3 - artifactGroup.rotation.y) * 0.02 + 0.0015;
      artifactGroup.rotation.x += (targetY * 0.2 - artifactGroup.rotation.x) * 0.02;
      artifactGroup.position.y = Math.sin(t * 0.5) * 0.05;
      core.rotation.y -= 0.01;
      core.rotation.x -= 0.006;
      panelGroup.rotation.y = t * 0.15;
      particles.rotation.y = t * 0.03;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!host) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      shellGeo.dispose(); shellMat.dispose();
      latticeGeo.dispose(); latticeMat.dispose();
      coreGeo.dispose(); coreMat.dispose();
      panelGeo.dispose(); panelMat.dispose();
      particleGeo.dispose(); particleMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [accentHex]);

  // Custom cursor: smooth lerp-follow dot that grows into a ring over any
  // interactive element. Desktop fine-pointer only.
  useEffect(() => {
    const root = rootRef.current;
    const cursor = cursorRef.current;
    if (!root || !cursor) return;
    const isDesktopPointer = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!isDesktopPointer) return;

    let cx = 0, cy = 0, tx = 0, ty = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      cursor.classList.toggle('vn-cursor-active', !!el?.closest('a, button, [role="button"], input, textarea'));
    };
    window.addEventListener('mousemove', onMove);
    const lerp = () => {
      cx += (tx - cx) * 0.25;
      cy += (ty - cy) * 0.25;
      cursor.style.transform = `translate(${cx - 4}px, ${cy - 4}px)`;
      raf = requestAnimationFrame(lerp);
    };
    lerp();
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Scroll-triggered section reveals.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const revealEls = root.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('vn-in')),
      { threshold: 0.15 },
    );
    revealEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const name: string = hero.headline || 'Your Name';
  const links: Array<{ label?: string; url?: string }> = Array.isArray(contact.links) ? contact.links : [];
  // Numbers only the sections that actually render, in document order — same
  // reasoning as Modern3DView's nextNum().
  let sectionCount = 0;
  const nextNum = () => String(++sectionCount).padStart(2, '0');

  return (
    <div ref={rootRef} className="w-full overflow-x-hidden relative vn-root">
      <style dangerouslySetInnerHTML={{ __html: visionaryCss(accentHex) }} />
      <div className="vn-orb vn-orb-1" />
      <div className="vn-orb vn-orb-2" />
      <div className="vn-orb vn-orb-3" />
      <div ref={cursorRef} className="vn-cursor-dot hidden md:block" />

      <nav ref={navRef} className="vn-nav">
        <div className="vn-nav-logo">
          <div className="vn-nav-badge">{(name.trim()[0] || '?').toUpperCase()}</div>
          <span className="vn-nav-name">{name.toUpperCase()}</span>
        </div>
        <div className="vn-nav-links">
          {about && <a href="#vn-about" className="vn-nav-link">ABOUT</a>}
          {skills.length > 0 && <a href="#vn-skills" className="vn-nav-link">SKILLS</a>}
          {projects.length > 0 && <a href="#vn-work" className="vn-nav-link">WORK</a>}
          {experience.length > 0 && <a href="#vn-experience" className="vn-nav-link">EXPERIENCE</a>}
        </div>
        {(contact.email || links[0]?.url) && (
          <a href={contact.email ? `mailto:${contact.email}` : links[0].url} className="vn-nav-cta">
            {contact.email ? 'GET IN TOUCH' : 'CONNECT'}
          </a>
        )}
      </nav>

      <section className="vn-hero">
        <div className="vn-hero-kicker">
          <span className="vn-live-dot" />
          {hero.available ? 'Available for work' : 'Portfolio'}
        </div>
        <div className="vn-name-wrap">
          <h1 ref={heroNameRef} className="vn-name">{name}</h1>
        </div>
        {hero.subheadline && <p className="vn-role">{hero.subheadline}</p>}
        {hero.tagline && <p className="vn-tagline">{hero.tagline}</p>}
        <div ref={canvasHostRef} className="vn-hero-canvas" />
        {(contact.email || links[0]?.url) && (
          <div className="vn-cta-row">
            {contact.email && <a href={`mailto:${contact.email}`} className="vn-btn-solid">Get in touch</a>}
            {links[0]?.url && <a href={links[0].url} target="_blank" rel="noreferrer" className="vn-btn-ghost">{links[0].label || 'View work'}</a>}
          </div>
        )}
      </section>

      {about && (
        <section id="vn-about" className="vn-section" data-reveal>
          <span className="vn-eyebrow">{nextNum()} / About</span>
          <div className="vn-about-grid">
            <p className="vn-about-body">{about}</p>
            <div className="vn-glass vn-about-card">
              <span className="vn-badge-live"><span className="vn-live-dot" /> {hero.available ? 'Available for projects' : 'Portfolio'}</span>
              {hero.subheadline && <div className="vn-about-row"><span className="vn-about-row-label">Role</span><span className="vn-about-row-value">{hero.subheadline}</span></div>}
              {contact.location && <div className="vn-about-row"><span className="vn-about-row-label">Location</span><span className="vn-about-row-value">{contact.location}</span></div>}
              {contact.email && <div className="vn-about-row"><span className="vn-about-row-label">Email</span><span className="vn-about-row-value">{contact.email}</span></div>}
            </div>
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section id="vn-skills" className="vn-section" data-reveal>
          <span className="vn-eyebrow">{nextNum()} / Skills</span>
          <h2 className="vn-heading" style={{ marginBottom: 24 }}>Stack &amp; tools</h2>
          <div className="vn-skills-wrap">
            {skills.map((s, i) => <span key={i} className="vn-skill-pill">{s}</span>)}
          </div>
        </section>
      )}

      {stats.length > 0 && (
        <section className="vn-section" data-reveal style={{ paddingTop: 0 }}>
          <div className="vn-stats-grid">
            {stats.map((s, i) => (
              <div key={i} className="vn-glass vn-stat-card">
                <div className="vn-stat-num">{s.value}</div>
                <div className="vn-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section id="vn-work" className="vn-section" data-reveal>
          <span className="vn-eyebrow">{nextNum()} / Selected work</span>
          <h2 className="vn-heading" style={{ marginBottom: 36 }}>Building digital <span className="vn-accent-serif">ecosystems.</span></h2>
          {projects.map((p: any, i: number) => {
            const glow = glowFor(p.title || String(i));
            return (
              <div key={i} className="vn-glass vn-proj-card">
                <div className="vn-proj-glow" style={{ background: `radial-gradient(circle at 70% 30%, ${glow}, transparent 70%)` }} />
                <div className="vn-proj-body">
                  <div className="vn-proj-meta">
                    <span className="vn-proj-num">{String(i + 1).padStart(2, '0')}</span>
                    {p.date && <span>{p.date}</span>}
                  </div>
                  <h3 className="vn-proj-title">{p.title}</h3>
                  {p.subtitle && <p className="vn-proj-sub">{p.subtitle}</p>}
                  {(p.bullets || []).filter(Boolean).length > 0 && (
                    <ul>{p.bullets.filter(Boolean).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                  )}
                </div>
                <div className="vn-proj-visual" style={{ background: `radial-gradient(circle at 30% 30%, ${glow}, transparent 70%), linear-gradient(160deg, rgba(255,255,255,.03), transparent)` }} />
              </div>
            );
          })}
        </section>
      )}

      {experience.length > 0 && (
        <section id="vn-experience" className="vn-section" data-reveal>
          <span className="vn-eyebrow">{nextNum()} / Experience</span>
          <h2 className="vn-heading" style={{ marginBottom: 32 }}>Career path</h2>
          <div className="vn-exp-grid">
            <div className="vn-exp-list">
              {experience.map((it: any, i: number) => (
                <button key={i} onClick={() => setActiveExp(i)} className={`vn-exp-node ${i === activeExp ? 'vn-exp-active' : ''}`}>
                  <div className="vn-exp-node-company">{it.title}</div>
                  {it.subtitle && <div className="vn-exp-node-role">{it.subtitle}</div>}
                  {it.date && <div className="vn-exp-node-period">{it.date}</div>}
                </button>
              ))}
            </div>
            {experience[activeExp] && (
              <div className="vn-glass vn-exp-detail">
                <div className="vn-exp-detail-glow" style={{ background: `radial-gradient(circle at 30% 20%, ${glowFor(experience[activeExp].title || String(activeExp))}, transparent 65%)` }} />
                <div className="vn-exp-detail-body">
                  {experience[activeExp].date && <div className="vn-exp-detail-period">{experience[activeExp].date}</div>}
                  <div className="vn-exp-detail-title">{experience[activeExp].title}</div>
                  {experience[activeExp].subtitle && <div className="vn-exp-detail-sub">{experience[activeExp].subtitle}</div>}
                  {(experience[activeExp].bullets || []).filter(Boolean).length > 0 && (
                    <ul>{experience[activeExp].bullets.filter(Boolean).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="vn-section vn-contact" data-reveal>
        <span className="vn-eyebrow">{nextNum()} / Contact</span>
        <h2 className="vn-heading" style={{ marginBottom: 20 }}>Let&apos;s build <span className="vn-accent-serif">something.</span></h2>
        {contact.email && <a href={`mailto:${contact.email}`} className="vn-giant-email">{contact.email}</a>}
        {links.length > 0 && (
          <div className="vn-social-row">
            {links.map((l, i) => l.url && <a key={i} href={l.url} target="_blank" rel="noreferrer" className="vn-social-btn">{(l.label || '?')[0]}</a>)}
          </div>
        )}
      </section>
    </div>
  );
}
