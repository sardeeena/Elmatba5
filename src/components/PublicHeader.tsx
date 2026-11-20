import React from 'react';
import { DICT } from '../lib/i18n';
import type { Locale } from '../lib/types';

export type PublicRoute =
  | 'home'
  | 'product'
  | 'features'
  | 'seo'
  | 'geo'
  | 'aeo'
  | 'agents'
  | 'pricing'
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'login'
  | 'signup';

interface PublicHeaderProps {
  route: PublicRoute;
  locale: Locale;
  isAuthenticated: boolean;
  onNavigate: (route: PublicRoute) => void;
  onOpenApp: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  route,
  locale,
  isAuthenticated,
  onNavigate,
  onOpenApp,
}) => {
  const t = DICT[locale];

  const navItems: Array<{ id: PublicRoute; label: string }> = [
    { id: 'product', label: t.nav.product },
    { id: 'seo', label: t.nav.seo },
    { id: 'geo', label: t.nav.geo },
    { id: 'pricing', label: t.nav.pricing },
    { id: 'about', label: t.nav.about },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F42902] border-b border-[#111111]/15">
      <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('home');
          }}
          className="font-display text-xl font-extrabold tracking-tight text-[#FDFDFF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#83FD80]"
        >
          EL MATBA5
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#FDFDFF]/90"
        >
          {navItems.map((item) => {
            const active = route === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.id);
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 ${
                  active
                    ? 'text-[#83FD80] border-[#83FD80]'
                    : 'border-transparent hover:text-[#FDFDFF] hover:border-[#FDFDFF]/60'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA */}
        <div className="shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onOpenApp}
              className="px-5 py-2.5 rounded-md bg-[#83FD80] text-[#111111] text-sm font-bold whitespace-nowrap shrink-0 hover:bg-[#9eff9b] transition-colors cursor-pointer"
            >
              {t.nav.dashboard}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('signup')}
              className="px-5 py-2.5 rounded-md bg-[#83FD80] text-[#111111] text-sm font-bold whitespace-nowrap shrink-0 hover:bg-[#9eff9b] transition-colors cursor-pointer"
            >
              {t.nav.startCooking}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
