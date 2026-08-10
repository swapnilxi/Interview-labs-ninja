'use client';

/** Renders text as it streams in, with a blinking caret while active. */
export default function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
      {text}
      {streaming && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary animate-pulse" />}
    </div>
  );
}
