import React from 'react';
import { ICON_REGISTRY, type IconName } from './icons/registry.generated';

export type { IconName };

interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'name'> {
  /** Brand icon name — see registry.generated.ts. */
  name: IconName;
  /** Pixel size; sets width + height. Defaults to 20. */
  size?: number;
  /** Accessible label. If provided, the icon becomes role="img" with aria-label;
      otherwise it's marked aria-hidden so screenreaders skip it (sibling text
      is assumed to carry the meaning). */
  label?: string;
}

// Brand icon renderer. Inlines the SVG markup from the registry so
// `currentColor` resolves against the parent's CSS color — the standard
// way to theme single-color icons. Two icons (state-warning + state-critical)
// have a `var(--plumo-on-surface)` token baked in for their hardcoded navy
// strokes; the .dark theme override flips that to white. See globals.css.
export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  label,
  className,
  style,
  ...rest
}) => {
  const inner = ICON_REGISTRY[name];
  if (!inner) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`<Icon name="${name}" /> not found in registry`);
    }
    return null;
  }

  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      shapeRendering="geometricPrecision"
      className={className}
      style={style}
      {...a11y}
      {...rest}
      // SVG markup is generated from a sealed local file (registry.generated.ts),
      // not user input — safe to inline.
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
};

export default Icon;
