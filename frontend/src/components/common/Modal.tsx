import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
  bodyClassName,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-3 sm:p-5 text-center">
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        <div
          className={`relative transform overflow-hidden rounded-2xl sm:rounded-3xl bg-white text-left shadow-2xl transition-all my-auto max-h-[calc(100vh-2.5rem)] flex flex-col w-full ${maxWidths[maxWidth]} border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-white">
            <div>
              <h3 className="text-lg font-bold text-slate-800">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className={bodyClassName ? `flex-1 min-h-0 ${bodyClassName}` : "px-6 py-5 overflow-y-auto flex-1 min-h-0"}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
