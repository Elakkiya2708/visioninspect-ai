interface RoleBannerProps {
  eyebrow: string;
  title: string;
  gradient: string; // Tailwind gradient utility classes
  badge?: string;
}

/**
 * The one deliberately rich visual moment per dashboard — a gradient
 * banner, used only here (and on Profile) so it reads as an accent
 * rather than a pattern repeated everywhere. Each role gets its own
 * gradient so the three dashboards are visually distinguishable at a
 * glance, not just by their content.
 */
export default function RoleBanner({ eyebrow, title, gradient, badge }: RoleBannerProps) {
  return (
    <div className={`rounded-xl px-6 py-5 mb-8 flex items-center justify-between text-white bg-gradient-to-r ${gradient}`}>
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.14em] text-white/70">{eyebrow}</p>
        <p className="font-display text-lg font-semibold mt-0.5">{title}</p>
      </div>
      {badge && (
        <span className="text-xs font-medium bg-white/15 border border-white/25 rounded-full px-3 py-1.5 whitespace-nowrap">
          {badge}
        </span>
      )}
    </div>
  );
}
