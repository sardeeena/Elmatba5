import React from 'react';

interface BrandMarkProps {
  inverted?: boolean;
  showArabicInline?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  inverted = false,
  showArabicInline = false,
}) => {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="26"
          height="26"
          rx="5"
          fill={inverted ? '#FDFDFF' : '#F42902'}
        />
        <path
          d="M7 9H21M7 14H17M7 19H21"
          stroke={inverted ? '#F42902' : '#FDFDFF'}
          strokeWidth="2.5"
          strokeLinecap="square"
        />
        <rect x="19" y="12.5" width="3.5" height="3.5" fill="#83FD80" />
      </svg>
      <span
        className={`font-display text-lg font-extrabold tracking-tight ${
          inverted ? 'text-[#FDFDFF]' : 'text-[#111111]'
        }`}
      >
        EL MATBA5
      </span>
      {showArabicInline && (
        <span
          className={`text-sm font-bold ${
            inverted ? 'text-[#FDFDFF]/90' : 'text-[#F42902]'
          }`}
        >
          المطبخ
        </span>
      )}
    </span>
  );
};
