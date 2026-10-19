'use client';

import React from 'react';
import type { Mood } from './content';

interface MascotProps {
  mood?: Mood;
  speaking?: boolean;
  size?: number;
  className?: string;
}

/** "Deepu", a little owl with a diya flame on its head (the owl is Lakshmi's vahana). Pure SVG + CSS. */
export default function Mascot({ mood = 'happy', speaking = false, size = 96, className = '' }: MascotProps) {
  const cheer = mood === 'cheer';
  const sleepy = mood === 'sleepy';
  const comfort = mood === 'comfort';
  const think = mood === 'think';
  return (
    <div
      className={`deepu ${cheer ? 'deepu-cheer' : 'deepu-idle'} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Deepu the owl companion"
      data-accent-exempt=""
    >
      <style>{`
        .deepu svg{overflow:visible}
        .deepu-idle{animation:deepu-bob 3.2s ease-in-out infinite}
        .deepu-cheer{animation:deepu-hop .6s ease-in-out infinite}
        .deepu .flame{transform-origin:50px 22px;animation:deepu-flicker 1.4s ease-in-out infinite}
        .deepu .blink{transform-origin:center;transform-box:fill-box;animation:deepu-blink 4.5s infinite}
        .deepu .wing-l,.deepu .wing-r{transform-box:fill-box}
        .deepu-cheer .wing-l{transform-origin:100% 20%;animation:deepu-flap-l .3s ease-in-out infinite}
        .deepu-cheer .wing-r{transform-origin:0% 20%;animation:deepu-flap-r .3s ease-in-out infinite}
        .deepu .beak-talk{transform-origin:50px 56px;animation:deepu-talk .22s ease-in-out infinite}
        @keyframes deepu-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes deepu-hop{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-10px) rotate(3deg)}}
        @keyframes deepu-flicker{0%,100%{transform:scale(1,1) rotate(-2deg)}50%{transform:scale(.92,1.12) rotate(3deg)}}
        @keyframes deepu-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
        @keyframes deepu-flap-l{0%,100%{transform:rotate(0)}50%{transform:rotate(-28deg)}}
        @keyframes deepu-flap-r{0%,100%{transform:rotate(0)}50%{transform:rotate(28deg)}}
        @keyframes deepu-talk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.5)}}
        @media (prefers-reduced-motion: reduce){.deepu,.deepu *{animation:none!important}}
      `}</style>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <linearGradient id="deepu-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#6d28d9" />
          </linearGradient>
          <radialGradient id="deepu-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* glow */}
        <circle cx="50" cy="20" r="16" fill="url(#deepu-glow)" />
        {/* diya bowl + flame */}
        <path d="M36 27 Q50 36 64 27 Q60 22 50 22 Q40 22 36 27Z" fill="#f59e0b" />
        <g className="flame">
          <path d="M50 4 Q58 13 50 22 Q42 13 50 4Z" fill="#fb923c" />
          <path d="M50 10 Q54 15 50 21 Q46 15 50 10Z" fill="#fde047" />
        </g>
        {/* ear tufts */}
        <path d="M22 34 L30 24 L38 34Z" fill="#7c3aed" />
        <path d="M78 34 L70 24 L62 34Z" fill="#7c3aed" />
        {/* wings */}
        <ellipse className="wing-l" cx="19" cy="62" rx="9" ry="16" fill="#5b21b6" />
        <ellipse className="wing-r" cx="81" cy="62" rx="9" ry="16" fill="#5b21b6" />
        {/* body */}
        <ellipse cx="50" cy="60" rx="30" ry="33" fill="url(#deepu-body)" />
        <ellipse cx="50" cy="72" rx="17" ry="18" fill="#ede9fe" />
        {/* belly marks */}
        <path d="M44 70 q3 3 6 0 M50 76 q3 3 6 0 M42 78 q3 3 6 0" stroke="#c4b5fd" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* eyes */}
        <circle cx="38" cy="48" r="11" fill="#fff" />
        <circle cx="62" cy="48" r="11" fill="#fff" />
        <g className="blink">
          {sleepy ? (
            <>
              <path d="M31 48 q7 6 14 0" stroke="#1e1b4b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M55 48 q7 6 14 0" stroke="#1e1b4b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : cheer ? (
            <>
              <path d="M31 50 q7 -9 14 0" stroke="#1e1b4b" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M55 50 q7 -9 14 0" stroke="#1e1b4b" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx={think ? 41 : 39} cy={think ? 45 : 49} r="5.5" fill="#1e1b4b" />
              <circle cx={think ? 65 : 63} cy={think ? 45 : 49} r="5.5" fill="#1e1b4b" />
              <circle cx={think ? 43 : 41} cy={think ? 43 : 47} r="1.8" fill="#fff" />
              <circle cx={think ? 67 : 65} cy={think ? 43 : 47} r="1.8" fill="#fff" />
            </>
          )}
        </g>
        {/* brows for comfort / think */}
        {comfort && (
          <>
            <path d="M28 36 L44 39" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" />
            <path d="M72 36 L56 39" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {/* cheeks */}
        <circle cx="27" cy="60" r="4" fill="#fda4af" opacity="0.7" />
        <circle cx="73" cy="60" r="4" fill="#fda4af" opacity="0.7" />
        {/* beak */}
        <g className={speaking ? 'beak-talk' : ''}>
          <path d="M45 56 L55 56 L50 64Z" fill="#fb923c" />
        </g>
        {/* feet */}
        <path d="M40 92 l-3 5 M40 92 l1 5 M40 92 l4 4 M60 92 l3 5 M60 92 l-1 5 M60 92 l-4 4" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" />
        {think && <text x="78" y="22" fontSize="14" fill="#a78bfa">?</text>}
        {comfort && <text x="76" y="24" fontSize="12">💛</text>}
      </svg>
    </div>
  );
}
