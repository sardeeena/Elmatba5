import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { DICT } from '../lib/i18n';
import {
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  updateAccountPassword,
} from '../lib/supabase';
import type { Locale } from '../lib/types';
import type { PublicRoute } from './PublicHeader';

interface AuthViewsProps {
  mode: 'login' | 'signup' | 'forgot' | 'recovery';
  locale: Locale;
  supabaseConfigured: boolean;
  hasPendingInvite?: boolean;
  onModeChange: (next: 'login' | 'signup' | 'forgot' | 'recovery') => void;
  onSessionReady: () => Promise<void>;
  onNavigate: (route: PublicRoute) => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({
  mode,
  locale,
  supabaseConfigured,
  hasPendingInvite = false,
  onModeChange,
  onSessionReady,
  onNavigate,
}) => {
  const t = DICT[locale].auth;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        const res = await signUpWithEmail({
          email,
          password,
          fullName,
          preferredLocale: locale,
        });
        if (res.needsEmailConfirmation) {
          setNotice(t.confirmEmailNotice);
          return;
        }
        await onSessionReady();
      } else if (mode === 'login') {
        await signInWithEmail({ email, password });
        await onSessionReady();
      } else if (mode === 'forgot') {
        await sendPasswordReset(email);
        setNotice(t.resetSentNotice);
      } else if (mode === 'recovery') {
        await updateAccountPassword(password);
        setNotice(t.passwordUpdatedNotice);
        await onSessionReady();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'login'
      ? t.loginTitle
      : mode === 'signup'
      ? t.registerTitle
      : mode === 'forgot'
      ? t.forgotTitle
      : t.recoveryTitle;

  const sub =
    mode === 'login'
      ? t.loginSub
      : mode === 'signup'
      ? t.registerSub
      : mode === 'forgot'
      ? t.forgotSub
      : t.recoverySub;

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
              {title}
            </h1>
            <p className="text-sm text-[#FDFDFF]/75 leading-relaxed">{sub}</p>
            {hasPendingInvite && (
              <div className="p-3 rounded-lg bg-[#83FD80]/15 border border-[#83FD80]/50 text-xs text-[#83FD80] font-semibold">
                {locale === 'ar'
                  ? 'لديك دعوة انضمام لمؤسسة قيد الانتظار — سجّل الدخول بالبريد المدعو لتفعيلها.'
                  : 'Workspace invitation detected — sign in or register with the invited email to join.'}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-[#FDFDFF]/15 pt-6 text-xs text-[#FDFDFF]/80">
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'عزل بيانات الشركات' : 'Tenant Isolation'}</span>
              <span className="font-mono text-[#83FD80]">PostgreSQL RLS</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'المصادقة' : 'Identity Provider'}</span>
              <span className="font-mono text-[#FDFDFF]">Supabase Auth (PKCE)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{locale === 'ar' ? 'الأسواق المدعومة' : 'Global Markets'}</span>
              <span className="font-mono text-[#FDFDFF]">EG · MENA · EU · RU</span>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="lg:col-span-7 p-8 lg:p-12">
          {!supabaseConfigured && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-xs font-medium text-[#111111]"
            >
              {locale === 'ar'
                ? 'إعدادات Supabase Auth غير مكتملة في الخادم (SUPABASE_URL و SUPABASE_PUBLISHABLE_KEY).'
                : 'Supabase authentication is not configured yet on the server (SUPABASE_URL & SUPABASE_PUBLISHABLE_KEY required).'}
            </div>
          )}

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

            {mode !== 'recovery' && (
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
            )}

            {(mode === 'login' || mode === 'signup' || mode === 'recovery') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-semibold text-[#111111]"
                  >
                    {mode === 'recovery' ? t.newPassword : t.password}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        onModeChange('forgot');
                      }}
                      className="text-xs font-semibold text-[#F42902] hover:underline cursor-pointer"
                    >
                      {t.forgotPasswordLink}
                    </button>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === 'login' ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? '••••••••' : 'Minimum 8 characters'}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-[#111111] focus:outline-none focus:border-[#F42902]"
                />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-sm font-medium text-[#111111]"
              >
                {error}
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="p-3.5 rounded-lg bg-[#83FD80]/30 border border-[#111111] text-sm font-medium text-[#111111] flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !supabaseConfigured}
              className="w-full py-3.5 px-6 rounded-lg bg-[#83FD80] text-[#111111] font-bold text-base flex items-center justify-center gap-2 hover:bg-[#9eff9b] border border-[#111111] transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {mode === 'login'
                  ? t.signIn
                  : mode === 'signup'
                  ? t.createAccount
                  : mode === 'forgot'
                  ? t.sendResetLink
                  : t.updatePassword}
              </span>
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="pt-3 border-t border-[#111111]/10 flex flex-wrap items-center justify-between gap-3 text-sm">
              {mode === 'forgot' || mode === 'recovery' ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    onModeChange('login');
                  }}
                  className="text-[#F42902] font-semibold hover:underline cursor-pointer"
                >
                  {t.backToLogin}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    onNavigate(mode === 'login' ? 'signup' : 'login');
                  }}
                  className="text-[#F42902] font-semibold hover:underline cursor-pointer"
                >
                  {mode === 'login' ? t.switchToRegister : t.switchToLogin}
                </button>
              )}

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
