import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cleanWhatsAppPhone, openWhatsAppSmart, openWhatsAppChat } from '../../utils/whatsapp';
import {
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Edit2,
  Eye,
  AlertCircle,
  Phone,
} from 'lucide-react';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialPhone?: string | null;
  customerName?: string;
  defaultMessage: string;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  initialPhone = '',
  customerName,
  defaultMessage,
}) => {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(initialPhone || '');
      setMessage(defaultMessage || '');
      setIsEditingMessage(false);
      setCopied(false);
      setError(null);

      setTimeout(() => {
        phoneInputRef.current?.focus();
        if (initialPhone) {
          phoneInputRef.current?.select();
        }
      }, 60);
    }
  }, [isOpen, initialPhone, defaultMessage]);

  const cleanPhone = cleanWhatsAppPhone(phone);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cleanPhone || cleanPhone.length < 7) {
      setError('Please enter a valid phone number with country code (e.g. 0300-1234567 or 923001234567).');
      phoneInputRef.current?.focus();
      return;
    }

    if (!message.trim()) {
      setError('Message text cannot be empty.');
      return;
    }

    // Automatically prefers desktop WhatsApp with seamless web fallback
    openWhatsAppSmart(cleanPhone, message);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="lg">
      <form onSubmit={handleSend} className="space-y-4">
        {subtitle && (
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 -mt-2 mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{subtitle}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Recipient Phone Number */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Recipient WhatsApp Number <span className="text-rose-500">*</span>
            </span>
            {customerName && (
              <span className="text-[11px] font-normal text-slate-400">
                Customer: <strong>{customerName}</strong>
              </span>
            )}
          </label>
          <div className="relative">
            <input
              ref={phoneInputRef}
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0300-1234567 or 923001234567"
              className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              required
            />
            {cleanPhone && (
              <div className="absolute right-3 top-2.5 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                +{cleanPhone}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Local numbers (e.g. <code>0300...</code>) are automatically prefixed with country code <code>92</code>.
          </p>
        </div>

        {/* 2. Live Message Preview / Editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Message Preview
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingMessage((prev) => !prev)}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition"
              >
                {isEditingMessage ? (
                  <>
                    <Eye className="h-3 w-3" />
                    <span>View Formatted</span>
                  </>
                ) : (
                  <>
                    <Edit2 className="h-3 w-3" />
                    <span>Edit Text</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition ml-2"
                title="Copy message to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-600 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isEditingMessage ? (
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition leading-relaxed resize-y"
              placeholder="Receipt / Quotation message..."
            />
          ) : (
            <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 rounded-2xl max-h-56 overflow-y-auto shadow-inner text-xs font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
              {message}
            </div>
          )}
        </div>

        {/* 3. Actions Footer */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-xs font-semibold text-slate-500"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                icon={copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                onClick={handleCopy}
                className="text-xs font-semibold"
              >
                {copied ? 'Copied to Clipboard' : 'Copy Text'}
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={<MessageCircle className="h-4 w-4" />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20"
              >
                <span>Send via WhatsApp</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </Button>
            </div>
          </div>

          {/* Subtle auto-dispatch note & web fallback link */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1 pt-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Prefers installed WhatsApp Desktop app automatically
            </span>
            <button
              type="button"
              onClick={() => {
                if (!cleanPhone || cleanPhone.length < 7) {
                  setError('Please enter a valid phone number with country code (e.g. 0300-1234567).');
                  phoneInputRef.current?.focus();
                  return;
                }
                openWhatsAppChat(cleanPhone, message, 'web');
                onClose();
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold hover:underline"
            >
              Open in WhatsApp Web instead
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
