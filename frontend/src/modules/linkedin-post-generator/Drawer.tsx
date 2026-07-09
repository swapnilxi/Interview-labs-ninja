'use client';

import { useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm transition-opacity duration-250 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed top-0 right-0 z-[310] flex h-full w-full sm:w-[560px] max-w-full flex-col border-l border-border bg-background shadow-xl transition-transform duration-250 ease-smooth ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <span className="font-heading text-base font-semibold text-foreground">{title}</span>
          <button type="button" onClick={onClose} className="theme-toggle" aria-label="Close">
            <Icon name="XMarkIcon" size={20} variant="outline" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-clean p-5">{children}</div>
      </div>
    </>
  );
}
