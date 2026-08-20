'use client';

/**
 * Modern3D — the flagship interactive portfolio template. Unlike every other
 * template (a CSS background + a widget stack inside `.pf-card`), this owns
 * its entire page shell: a Three.js hero, GSAP text reveal, scroll-triggered
 * reveals, a tilt-on-hover skills grid, and a desktop custom cursor.
 *
 * This is a LIVE-BROWSER-ONLY experience. Per the agreed scope, it is not
 * mirrored in render.py (PDF/DOCX/HTML export) or the Designer's string-based
 * preview — xhtml2pdf has no JS engine and can't run WebGL/GSAP, so those
 * paths render the plain "modern" CSS treatment instead (see the `modern3d`
 * alias in portfolioTemplates.ts / render.py). Only the public /p/{slug}
 * page (which renders this component directly, not an iframe/string) shows
 * the real thing.
 *
 * Still deferred (flagged, not silently dropped): testimonials — there's no
 * testimonials widget wired into resolved_to_widgets() yet, and this app
 * already has a separate visitor-submitted/owner-approved recommendations
 * feature (testimonials_db.py) that arguably covers the same need.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ACCENT_HEX } from '../shared/portfolioTemplates';
import type { PortfolioTheme, PortfolioWidget } from '../shared/types';

gsap.registerPlugin(ScrollTrigger);

/** Deterministic (not random) gradient pick for a project's cover band, so
 * the same project always gets the same colour and it doesn't shift on
 * re-render — a stand-in for a real project image_url, which isn't part of
 * the data model yet. */
const PROJECT_GRADIENTS: Array<[string, string]> = [
  ['#7c3aed', '#06b6d4'],
  ['#f97316', '#ec4899'],
  ['#06b6d4', '#22c55e'],
  ['#ec4899', '#7c3aed'],
  ['#22c55e', '#06b6d4'],
  ['#f97316', '#7c3aed'],
];
function projectCoverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [a, b] = PROJECT_GRADIENTS[Math.abs(h) % PROJECT_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** CSS 3D tilt-on-hover, shared by the skills grid and project cards. */
function attachTilt(el: HTMLElement, maxDeg = 14): () => void {
  const onMove = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg) translateZ(4px)`;
  };
  const onLeave = () => {
    el.style.transform = 'perspective(600px) rotateY(0) rotateX(0)';
  };
  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);
  return () => {
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseleave', onLeave);
  };
}

function modern3DCss(accentHex: string): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');

.m3-root { font-family: 'Inter', ui-sans-serif, sans-serif; scroll-behavior: smooth; }
.m3-root * { box-sizing: border-box; }
.m3-root h1, .m3-root h2 { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; margin: 0; }

.m3-cursor { position: fixed; top: 0; left: 0; width: 20px; height: 20px; border: 2px solid ${accentHex}; border-radius: 50%; pointer-events: none; z-index: 9999; mix-blend-mode: difference; will-change: transform; }
.m3-progress-track { position: sticky; top: 0; z-index: 50; height: 3px; background: rgba(255,255,255,.08); }
.m3-progress-bar { height: 100%; width: 0%; background: linear-gradient(90deg, ${accentHex}, #06b6d4); }

.m3-hero { position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 80px 24px; }
.m3-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(closest-side at 30% 20%, ${accentHex}26, transparent 60%), radial-gradient(closest-side at 80% 80%, #06b6d426, transparent 60%); pointer-events: none; }
.m3-canvas-host { position: absolute; inset: 0; z-index: 0; opacity: .9; }
.m3-hero-copy { position: relative; z-index: 1; text-align: center; max-width: 640px; }
.m3-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; background: rgba(16,185,129,.14); color: #34d399; border: 1px solid rgba(16,185,129,.25); margin-bottom: 20px; }
.m3-name { font-size: clamp(3rem, 8vw, 6rem); font-weight: 800; line-height: 1.02; color: #fff; }
.m3-role { font-size: clamp(1.1rem, 2.4vw, 1.4rem); color: rgba(226,232,240,.75); margin: 18px 0 0; }
.m3-tagline { font-size: 15px; color: rgba(226,232,240,.5); margin: 10px auto 0; max-width: 480px; }
.m3-cta-row { display: flex; gap: 14px; justify-content: center; margin-top: 32px; flex-wrap: wrap; }
.m3-btn { padding: 13px 26px; border-radius: 999px; font-weight: 600; font-size: 14.5px; text-decoration: none; transition: transform .2s ease, box-shadow .2s ease; }
.m3-btn:hover { transform: translateY(-2px); }
.m3-btn-primary { background: linear-gradient(120deg, ${accentHex}, #06b6d4); color: #fff; box-shadow: 0 14px 30px -10px ${accentHex}88; }
.m3-btn-ghost { background: rgba(255,255,255,.06); color: #fff; border: 1px solid rgba(255,255,255,.16); }
.m3-scroll-indicator { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: rgba(226,232,240,.4); animation: m3-bounce 2s infinite; }
@keyframes m3-bounce { 0%,100% { transform: translate(-50%,0); } 50% { transform: translate(-50%,6px); } }

.m3-section, .m3-projects-section { position: relative; opacity: 0; transform: translateY(28px); transition: opacity .7s ease, transform .7s ease; }
.m3-section { max-width: 880px; margin: 0 auto; padding: 120px 24px; }
.m3-projects-section { padding: 120px 0; overflow: hidden; }
.m3-section.m3-in, .m3-projects-section.m3-in { opacity: 1; transform: translateY(0); }
.m3-num { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: ${accentHex}; letter-spacing: .1em; margin-bottom: 10px; }
.m3-section h2, .m3-projects-head h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); color: #fff; margin-bottom: 0; }
.m3-about-text { font-size: 19px; line-height: 1.6; color: rgba(226,232,240,.75); }

.m3-skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.m3-skill-card { padding: 16px 12px; text-align: center; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #e2e8f0; font-weight: 600; font-size: 13.5px; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; will-change: transform; }
.m3-skill-card:hover { border-color: ${accentHex}88; box-shadow: 0 16px 32px -14px ${accentHex}66; }

.m3-projects-head { max-width: 880px; margin: 0 auto 40px; padding: 0 24px 20px; }
.m3-projects-viewport { overflow: hidden; }
.m3-projects-track { display: flex; gap: 24px; padding: 0 24px; will-change: transform; }
.m3-proj-card { flex: 0 0 380px; width: 380px; border-radius: 18px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); overflow: hidden; transition: box-shadow .2s ease, border-color .2s ease; will-change: transform; }
.m3-proj-card:hover { border-color: ${accentHex}88; box-shadow: 0 20px 40px -18px ${accentHex}70; }
.m3-proj-cover { height: 160px; }
.m3-proj-body { padding: 20px 22px; }
.m3-proj-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: #fff; font-size: 17px; margin: 0 0 4px; }
.m3-proj-sub { font-size: 13px; color: rgba(226,232,240,.5); margin: 0 0 10px; }
.m3-proj-body ul { margin: 0; padding-left: 18px; color: rgba(226,232,240,.7); font-size: 13px; }
.m3-proj-body li { margin-bottom: 4px; }
@media (max-width: 899px) {
  .m3-projects-track { flex-direction: column; }
  .m3-proj-card { width: 100%; flex: none; }
}

.m3-timeline { position: relative; padding-left: 0; }
.m3-timeline-svg { position: absolute; left: 7px; top: 4px; width: 2px; overflow: visible; }
.m3-tl-item { position: relative; padding-left: 32px; margin-bottom: 28px; opacity: 0; transform: translateX(-16px); transition: opacity .6s ease, transform .6s ease; }
.m3-tl-item.m3-in { opacity: 1; transform: translateX(0); }
.m3-tl-dot { position: absolute; left: 0; top: 4px; width: 16px; height: 16px; border-radius: 50%; background: ${accentHex}; box-shadow: 0 0 0 4px rgba(255,255,255,.04), 0 0 16px ${accentHex}aa; }
.m3-tl-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 16px 18px; }
.m3-tl-title { font-weight: 700; color: #fff; font-size: 15px; }
.m3-tl-date { font-size: 12px; color: rgba(226,232,240,.45); margin-top: 2px; }
.m3-tl-card ul { margin: 8px 0 0 18px; padding: 0; color: rgba(226,232,240,.7); font-size: 13.5px; }
.m3-tl-card li { margin-bottom: 3px; }

.m3-contact { text-align: center; position: relative; }
.m3-orb { position: absolute; left: 50%; top: 40%; width: 480px; height: 480px; transform: translate(-50%,-50%); background: radial-gradient(closest-side, ${accentHex}33, transparent 70%); filter: blur(40px); pointer-events: none; }
.m3-giant-email { position: relative; display: inline-block; font-size: clamp(1.6rem, 5vw, 3.2rem); font-weight: 800; font-family: 'Space Grotesk', sans-serif; background: linear-gradient(120deg, #fff, ${accentHex}); -webkit-background-clip: text; background-clip: text; color: transparent; text-decoration: none; transition: filter .2s ease; word-break: break-all; }
.m3-giant-email:hover { filter: brightness(1.3); }
.m3-social-row { position: relative; display: flex; gap: 12px; justify-content: center; margin-top: 28px; }
.m3-social-btn { width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; text-decoration: none; text-transform: uppercase; transition: transform .2s ease, background .2s ease, box-shadow .2s ease; }
.m3-social-btn:hover { transform: translateY(-3px); background: ${accentHex}; box-shadow: 0 10px 24px -8px ${accentHex}aa; }

@media (prefers-reduced-motion: reduce) {
  .m3-section, .m3-projects-section, .m3-tl-item { transition: none; opacity: 1; transform: none; }
  .m3-scroll-indicator { animation: none; }
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
  const itemsOf = (matches: (wtype: string) => boolean) =>
    visible
      .filter((w) => matches(w.widget_type))
      .flatMap((w) => (Array.isArray(w.content?.items) ? w.content.items : []))
      .filter((it: any) => it && (it.title || it.subtitle || (it.bullets || []).length));
  // "projects" gets its own horizontal-scroll rail; every other items-based
  // widget (experience, education, certifications, …) is the timeline.
  const passthrough = new Set(['hero', 'contact', 'about', 'custom', 'skills', 'stats', 'projects']);
  const projects = itemsOf((wtype) => wtype === 'projects');
  const experience = itemsOf((wtype) => !passthrough.has(wtype));
  return { hero, contact, about, skills, projects, experience };
}

export default function Modern3DView({ widgets, theme }: { widgets: PortfolioWidget[]; theme?: PortfolioTheme | null }) {
  const accentHex = ACCENT_HEX[theme?.accent || 'violet'] || ACCENT_HEX.violet;
  const { hero, contact, about, skills, projects, experience } = extractContent(widgets);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const heroNameRef = useRef<HTMLHeadingElement>(null);
  const projectsSectionRef = useRef<HTMLDivElement>(null);
  const projectsTrackRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineLineRef = useRef<SVGLineElement>(null);

  // Three.js hero scene: a slowly-rotating metallic icosahedron with a
  // wireframe shell, tilting toward the pointer.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || host.clientWidth === 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.z = 4.4;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1.55, 1);
    const material = new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.85, roughness: 0.2, flatShading: true });
    const mesh = new THREE.Mesh(geometry, material);
    const wireGeo = new THREE.IcosahedronGeometry(1.62, 1);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.22 });
    mesh.add(new THREE.Mesh(wireGeo, wireMat));
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const light1 = new THREE.PointLight(accentHex, 2.4, 20);
    light1.position.set(3, 2, 4);
    scene.add(light1);
    const light2 = new THREE.PointLight(0x06b6d4, 1.8, 20);
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
    const animate = () => {
      mesh.rotation.y += 0.0025;
      mesh.rotation.x += 0.0009;
      mesh.rotation.y += (targetX * 0.3 - mesh.rotation.y) * 0.02;
      mesh.rotation.x += (targetY * 0.2 - mesh.rotation.x) * 0.02;
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
      geometry.dispose();
      material.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [accentHex]);

  // GSAP hero name reveal — split into characters, stagger up+fade in.
  useEffect(() => {
    if (!heroNameRef.current) return;
    const chars = heroNameRef.current.querySelectorAll('.m3-char');
    gsap.fromTo(chars, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.025, ease: 'power3.out', delay: 0.15 });
  }, [hero.headline]);

  // Scroll progress bar + scroll-triggered reveals + desktop custom cursor.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Modern3D renders inline in the normal page flow (the public portfolio
    // page also has a "Download PDF" bar above it and recommendations below),
    // not inside a height-bounded box — so the real scroll container is the
    // window/document, not this component's own root element.
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (progressRef.current) progressRef.current.style.width = `${pct}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const revealEls = root.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('m3-in')),
      { threshold: 0.15 },
    );
    revealEls.forEach((el) => io.observe(el));

    const isDesktopPointer = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let onMove: ((e: MouseEvent) => void) | null = null;
    let raf = 0;
    if (isDesktopPointer && cursorRef.current) {
      let cx = 0, cy = 0, tx = 0, ty = 0;
      onMove = (e) => { tx = e.clientX; ty = e.clientY; };
      root.addEventListener('mousemove', onMove);
      const lerp = () => {
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        if (cursorRef.current) cursorRef.current.style.transform = `translate(${cx - 10}px, ${cy - 10}px)`;
        raf = requestAnimationFrame(lerp);
      };
      lerp();
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
      if (onMove) root.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Tilt-on-hover for skill cards and project cards.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.m3-skill-card, .m3-proj-card'));
    const cleanups = els.map((el) => attachTilt(el));
    return () => cleanups.forEach((fn) => fn());
  }, [skills.length, projects.length]);

  // Projects: horizontal scroll-pinned rail on desktop (GSAP ScrollTrigger
  // pin + scrub), plain vertical stack on mobile/touch/reduced-motion (CSS
  // handles the stack layout; this effect just skips creating the pin).
  useEffect(() => {
    if (!projects.length) return;
    const section = projectsSectionRef.current;
    const track = projectsTrackRef.current;
    if (!section || !track) return;
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', () => {
      const getScrollAmount = () => Math.max(0, track.scrollWidth - section.clientWidth);
      const tween = gsap.to(track, {
        x: () => -getScrollAmount(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${getScrollAmount()}`,
          scrub: true,
          pin: true,
          invalidateOnRefresh: true,
        },
      });
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    return () => mm.revert();
  }, [projects.length]);

  // Experience timeline: the connecting line is a real SVG <line> whose
  // stroke progressively "draws in" as the section scrolls into view.
  useEffect(() => {
    if (!experience.length) return;
    const container = timelineRef.current;
    const line = timelineLineRef.current;
    if (!container || !line) return;
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const svg = line.ownerSVGElement;
    // The line is perfectly vertical (x1 === x2), so its bounding box has
    // zero width — the gradient's default objectBoundingBox units can't be
    // normalized against that and Chromium silently fails to paint the
    // stroke at all. userSpaceOnUse with explicit pixel coordinates sidesteps
    // the zero-width-bbox degenerate case entirely.
    const gradient = svg?.querySelector('linearGradient');
    const setup = () => {
      const height = container.scrollHeight;
      line.setAttribute('y2', String(height));
      svg?.setAttribute('height', String(height));
      gradient?.setAttribute('y2', String(height));
      const length = line.getTotalLength();
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: reduceMotion ? 0 : length });
    };
    setup();
    if (reduceMotion) return;

    const tween = gsap.to(line, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: container,
        start: 'top 80%',
        end: 'bottom 60%',
        scrub: true,
      },
    });

    const onResize = () => setup();
    window.addEventListener('resize', onResize);

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      window.removeEventListener('resize', onResize);
    };
  }, [experience.length]);

  const name: string = hero.headline || 'Your Name';
  const nameChars = Array.from(name).map((c, i) => (
    <span key={i} className="m3-char inline-block">{c === ' ' ? ' ' : c}</span>
  ));
  const links: Array<{ label?: string; url?: string }> = Array.isArray(contact.links) ? contact.links : [];
  // Numbers only the sections that actually render, in document order, so an
  // empty About (say) doesn't leave the visible sections skipping from 02 to 04.
  let sectionCount = 0;
  const nextNum = () => String(++sectionCount).padStart(2, '0');

  return (
    <div ref={rootRef} className="w-full overflow-x-hidden relative m3-root" style={{ background: '#050816', color: '#e2e8f0' }}>
      <style dangerouslySetInnerHTML={{ __html: modern3DCss(accentHex) }} />
      <div ref={cursorRef} className="m3-cursor hidden md:block" />
      <div className="m3-progress-track"><div ref={progressRef} className="m3-progress-bar" /></div>

      <section className="m3-hero">
        <div ref={canvasHostRef} className="m3-canvas-host" />
        <div className="m3-hero-copy">
          {hero.available && <div className="m3-badge">● Available for work</div>}
          <h1 ref={heroNameRef} className="m3-name">{nameChars}</h1>
          {hero.subheadline && <p className="m3-role">{hero.subheadline}</p>}
          {hero.tagline && <p className="m3-tagline">{hero.tagline}</p>}
          {(contact.email || links[0]?.url) && (
            <div className="m3-cta-row">
              {contact.email && <a href={`mailto:${contact.email}`} className="m3-btn m3-btn-primary">Get in touch</a>}
              {links[0]?.url && <a href={links[0].url} target="_blank" rel="noreferrer" className="m3-btn m3-btn-ghost">{links[0].label || 'View work'}</a>}
            </div>
          )}
        </div>
        <div className="m3-scroll-indicator">Scroll</div>
      </section>

      {about && (
        <section className="m3-section" data-reveal>
          <span className="m3-num">{nextNum()}</span>
          <h2>About</h2>
          <p className="m3-about-text">{about}</p>
        </section>
      )}

      {skills.length > 0 && (
        <section className="m3-section" data-reveal>
          <span className="m3-num">{nextNum()}</span>
          <h2>Skills</h2>
          <div className="m3-skills-grid">
            {skills.map((s, i) => <div key={i} className="m3-skill-card">{s}</div>)}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <div ref={projectsSectionRef} className="m3-projects-section" data-reveal>
          <div className="m3-projects-head">
            <span className="m3-num">{nextNum()}</span>
            <h2>Projects</h2>
          </div>
          <div className="m3-projects-viewport">
            <div ref={projectsTrackRef} className="m3-projects-track">
              {projects.map((p: any, i: number) => (
                <div key={i} className="m3-proj-card">
                  <div className="m3-proj-cover" style={{ background: projectCoverGradient(p.title || String(i)) }} />
                  <div className="m3-proj-body">
                    <div className="m3-proj-title">{p.title}</div>
                    {p.subtitle && <div className="m3-proj-sub">{p.subtitle}</div>}
                    {(p.bullets || []).filter(Boolean).length > 0 && (
                      <ul>{p.bullets.filter(Boolean).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <section className="m3-section" data-reveal>
          <span className="m3-num">{nextNum()}</span>
          <h2>Experience</h2>
          <div ref={timelineRef} className="m3-timeline">
            {/* width fixed at 2 to match the 2px CSS width — without an explicit
                width, SVG defaults to a 300-unit coordinate space and the line
                (drawn at x=1) renders squashed to invisible. */}
            <svg className="m3-timeline-svg" width={2} aria-hidden="true">
              <defs>
                <linearGradient id="m3-tl-grad" gradientUnits="userSpaceOnUse" x1="1" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={accentHex} />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <line ref={timelineLineRef} x1="1" y1="0" x2="1" y2="0" stroke="url(#m3-tl-grad)" strokeWidth="2" />
            </svg>
            {experience.map((it: any, i: number) => (
              <div key={i} className="m3-tl-item" data-reveal>
                <div className="m3-tl-dot" />
                <div className="m3-tl-card">
                  <div className="m3-tl-title">{it.title}{it.subtitle ? ` — ${it.subtitle}` : ''}</div>
                  {it.date && <div className="m3-tl-date">{it.date}</div>}
                  {(it.bullets || []).filter(Boolean).length > 0 && (
                    <ul>{it.bullets.filter(Boolean).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="m3-section m3-contact" data-reveal>
        <div className="m3-orb" />
        <h2>Let&apos;s work together</h2>
        {contact.email && <a href={`mailto:${contact.email}`} className="m3-giant-email">{contact.email}</a>}
        {links.length > 0 && (
          <div className="m3-social-row">
            {links.map((l, i) => l.url && <a key={i} href={l.url} target="_blank" rel="noreferrer" className="m3-social-btn">{(l.label || '?')[0]}</a>)}
          </div>
        )}
      </section>
    </div>
  );
}
