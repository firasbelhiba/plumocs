import React from 'react';

interface GroupUser {
  name: string;
  src?: string;
}

interface AvatarGroupProps {
  users: GroupUser[];
  max?: number;
  size?: number;
  className?: string;
}

const hues = [210, 260, 320, 30, 160, 190, 80, 340];

function hueFromName(name: string): number {
  const sum = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return hues[sum % hues.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users,
  max = 4,
  size = 24,
  className,
}) => {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className={`flex items-center ${className ?? ''}`}>
      {shown.map((u, i) => {
        const h = hueFromName(u.name);
        return (
          <span
            key={i}
            className="inline-flex items-center justify-center rounded-full font-semibold overflow-hidden"
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -6,
              background: `hsl(${h} 40% 82%)`,
              color: `hsl(${h} 45% 28%)`,
              fontSize: Math.max(9, size * 0.4),
              boxShadow: '0 0 0 2px var(--surface)',
            }}
          >
            {u.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.src} alt="" className="w-full h-full object-cover" />
            ) : (
              initials(u.name)
            )}
          </span>
        );
      })}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-fg-2 text-[10px] font-medium"
          style={{
            width: size,
            height: size,
            marginLeft: -6,
            boxShadow: '0 0 0 2px var(--surface)',
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
};

export default AvatarGroup;
