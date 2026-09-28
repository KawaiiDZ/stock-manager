import React, { useState } from 'react';
import { api } from '../../services/api';
import { ShoppingCart, Lock, User, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { BusinessSettings } from '../../types';

interface LoginPageProps {
  settings: BusinessSettings | null;
  onLoginSuccess: (user: { username: string; full_name: string }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  settings,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.login({
        username: username.trim(),
        password,
      });
      if (res.success) {
        onLoginSuccess({
          username: res.username,
          full_name: res.full_name,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.detail || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-100/10 dark:border-slate-800">
        {/* Brand Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src={settings?.logo_path || '/stokflow-logo.png'}
            alt={settings?.business_name || 'StokFlow'}
            className="h-14 w-auto max-w-[240px] object-contain mb-3"
          />
          <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
            {settings?.business_name || 'Business Portal Login'}
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Offline Inventory, POS & Financial Ledgers
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            prefix={<User className="h-4 w-4" />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            required
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            prefix={<Lock className="h-4 w-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full font-bold shadow-lg shadow-brand-600/20"
              loading={loading}
            >
              Login to Business
            </Button>
          </div>
        </form>

        <div className="text-center mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
          Default login: <span className="font-mono font-bold text-slate-600 dark:text-slate-300">admin</span> /{' '}
          <span className="font-mono font-bold text-slate-600 dark:text-slate-300">admin123</span>
        </div>
      </div>
    </div>
  );
};
