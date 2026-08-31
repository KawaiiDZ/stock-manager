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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100/10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-3xl bg-emerald-600 flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-emerald-600/30">
            <ShoppingCart className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            {settings?.business_name || 'Stock Manager'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Offline Inventory, Sales & Business System
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
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
              className="w-full font-bold shadow-lg shadow-emerald-600/20"
              loading={loading}
            >
              Login to Business
            </Button>
          </div>
        </form>

        <div className="text-center mt-6 pt-6 border-t border-slate-100 text-xs text-slate-400">
          Default login: <span className="font-mono font-bold text-slate-600">admin</span> /{' '}
          <span className="font-mono font-bold text-slate-600">admin123</span>
        </div>
      </div>
    </div>
  );
};
