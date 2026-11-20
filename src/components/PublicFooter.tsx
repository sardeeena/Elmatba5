import React from 'react';
import { DICT } from '../lib/i18n';
import type { Locale } from '../lib/types';
import { BrandMark } from './BrandMark';
import type { PublicRoute } from './PublicHeader';

interface PublicFooterProps {
  locale: Locale;
  onToggleLocale: (next: Locale) => void;
  onNavigate: (route: PublicRoute) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  locale,
  onToggleLocale,
  onNavigate,
}) => {
  const t = DICT[locale];

  const linkGroups: Array<{
    title: string;
    items: Array<{ route: PublicRoute; label: string }>;
  }> = [
    {
      title: locale === 'ar' ? 'المنصة' : 'Platform',
      items: [
        { route: 'product', label: locale === 'ar' ? 'نظرة على المنتج' : 'Product Overview' },
        { route: 'features', label: locale === 'ar' ? 'المميزات' : 'All Features' },
        { route: 'seo', label: locale === 'ar' ? 'السيو والفحص' : 'SEO & Crawler' },
        { route: 'geo', label: 'GEO' },
        { route: 'aeo', label: 'AEO' },
        { route: 'agents', label: locale === 'ar' ? 'وكلاء الذكاء الاصطناعي' : 'AI Agents' },
      ],
    },
    {
      title: locale === 'ar' ? 'الشركة' : 'Company',
      items: [
        { route: 'pricing', label: t.nav.pricing },
        { route: 'about', label: t.nav.about },
        { route: 'contact', label: locale === 'ar' ? 'تواصل معنا' : 'Contact' },
        { route: 'login', label: t.nav.login },
        { route: 'signup', label: t.nav.startCooking },
      ],
    },
    {
      title: locale === 'ar' ? 'القانونية والخصوصية' : 'Legal & Compliance',
      items: [
        { route: 'privacy', label: locale === 'ar' ? 'سياسة الخصوصية (GDPR)' : 'Privacy Policy (GDPR)' },
        { route: 'terms', label: locale === 'ar' ? 'شروط الاستخدام' : 'Terms of Service' },
      ],
    },
  ];

  return (
    <footer className="bg-[#111111] text-[#FDFDFF] border-t border-[#FDFDFF]/15">
      <div className="max-w-[1320px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-5 space-y-4">
            <BrandMark inverted showArabicInline />
            <p className="text-sm text-[#FDFDFF]/75 max-w-sm leading-relaxed">
              {locale === 'ar'
                ? 'مطبخ ذكاء التسويق الرقمي للوكالات والمستشارين والشركات. مبني في القاهرة ومصمم للأسواق العالمية.'
                : 'The digital marketing intelligence kitchen for Egyptian, MENA, and global agencies. Built in Cairo with multi-market precision.'}
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="text-xs text-[#FDFDFF]/60">
                {locale === 'ar' ? 'اللغة:' : 'Language:'}
              </span>
              <div className="inline-flex rounded-md border border-[#FDFDFF]/20 p-0.5">
                <button
                  type="button"
                  onClick={() => onToggleLocale('en')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                    locale === 'en'
                      ? 'bg-[#83FD80] text-[#111111]'
                      : 'text-[#FDFDFF]/80 hover:text-[#FDFDFF]'
                  }`}
                >
                  English (LTR)
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLocale('ar')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                    locale === 'ar'
                      ? 'bg-[#83FD80] text-[#111111]'
                      : 'text-[#FDFDFF]/80 hover:text-[#FDFDFF]'
                  }`}
                >
                  العربية (RTL)
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {linkGroups.map((group) => (
              <div key={group.title} className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#83FD80]">
                  {group.title}
                </h4>
                <ul className="space-y-2.5">
                  {group.items.map((item) => (
                    <li key={item.route}>
                      <a
                        href={`#${item.route}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(item.route);
                        }}
                        className="text-sm text-[#FDFDFF]/80 hover:text-[#FDFDFF] hover:underline transition-colors"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-[#FDFDFF]/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#FDFDFF]/60">
          <span>
            © {new Date().getFullYear()} EL MATBA5 (المطبخ) · {t.tagline}
          </span>
          <span>Cairo, Egypt · MENA · Europe · Eurasia</span>
        </div>
      </div>
    </footer>
  );
};
