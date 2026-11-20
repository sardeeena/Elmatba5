import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { DICT } from '../lib/i18n';
import type { Locale, OrganizationSummary, User } from '../lib/types';
import type { PublicRoute } from './PublicHeader';

interface AuthViewsProps {
  mode: 'login' | 'signup';
  locale: Locale;
  onSuccess: (user: User, organizations: OrganizationSummary[]) => void;
  onNavigate: (route: PublicRoute) => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({
  mode,
  locale,
  onSuccess,
  onNavigate,
}) => {
  const t = DICT[locale].auth;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const res = await api.register({
          email,
          password,
          fullName,
          preferredLocale: locale,
        });
        onSuccess(res.user, res.organizations);
      } else {
        const res = await api.login({ email, password });
        onSuccess(res.user, res.organizations);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-[#F42902] kitchen-grid-pattern-red py-16 px-6 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-[#FDFDFF] border-2 border-[#111111] rounded-xl overflow-hidden">
        {/* Left brand panel */}
        <div className="lg:col-span-5 bg-[#111111] text-[#FDFDFF] p-8 lg:p-10 flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#83FD80]">
              EL MATBA5 · المطبخ
            </p>
            <h1 className="font-display text-3xl lg:text-4xl font-extrabold leading-tight">
              {mode === 'login' ? t.loginTitle : t.registerTitle}
            </h1>
            <p className="text-sm text-[#FDFDFF]/75 leading-relaxed">
              {mode === 'login' ? t.loginSub : t.registerSub}
            </p>
          </div>

          <div className="space-y-3 border-t border-[#FDFDFF]/15 pt-6 text-xs text-[#FDFDFF]/80">
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'عزل بيانات الشركات' : 'Tenant Isolation'}</span>
              <span className="font-mono text-[#83FD80]">organization_id</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'الأسواق المدعومة' : 'Global Markets'}</span>
              <span className="font-mono text-[#FDFDFF]">EG · MENA · EU · RU</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'التوافق مع الخصوصية' : 'Privacy Architecture'}</span>
              <span className="font-mono text-[#FDFDFF]">GDPR-ready</span>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="lg:col-span-7 p-8 lg:p-12">
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-sm font-semibold text-[#111111] mb-1.5"
                >
                  {t.fullName}
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={locale === 'ar' ? 'أحمد حسن' : 'Nadia El-Masry'}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-[#111111] focus:outline-none focus:border-[#F42902]"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-semibold text-[#111111] mb-1.5"
              >
                {t.email}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="growth@agency.eg"
                className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-[#111111] focus:outline-none focus:border-[#F42902]"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-semibold text-[#111111] mb-1.5"
              >
                {t.password}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={mode === 'signup' ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'}
                className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-[#111111] focus:outline-none focus:border-[#F42902]"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-sm font-medium text-[#111111]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-lg bg-[#83FD80] text-[#111111] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#9eff9b] border border-[#111111] transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{mode === 'login' ? t.signIn : t.createAccount}</span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="pt-3 border-t border-[#111111]/10 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => onNavigate(mode === 'login' ? 'signup' : 'login')}
                className="text-[#F42902] font-semibold hover:underline cursor-pointer"
              >
                {mode === 'login' ? t.switchToRegister : t.switchToLogin}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="text-[#52525B] hover:text-[#111111] cursor-pointer"
              >
                {locale === 'ar' ? 'العودة للرئيسية' : 'Back home'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};
