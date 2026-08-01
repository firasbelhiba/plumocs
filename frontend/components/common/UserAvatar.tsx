'use client';

import React, { memo } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { getInitials } from '@/lib/utils';

interface UserAvatarProps {
  userId?: string;
  avatar?: string | null;
  firstName?: string;
  lastName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showOnlineStatus?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-5 h-5 text-2xs',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
  xl: 'w-12 h-12 text-lg',
  '2xl': 'w-24 h-24 text-3xl',
};

const pixelSizes = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
  '2xl': 96,
};

const dotSizeClasses = {
  xs: 'w-1.5 h-1.5 border',
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border-2',
  lg: 'w-3 h-3 border-2',
  xl: 'w-3.5 h-3.5 border-2',
  '2xl': 'w-4 h-4 border-2',
};

const dotPositionClasses = {
  xs: 'bottom-0 right-0',
  sm: 'bottom-0 right-0',
  md: 'bottom-0 right-0',
  lg: 'bottom-0 right-0',
  xl: 'bottom-0 right-0',
  '2xl': 'bottom-1 right-1',
};

const HUES = [210, 260, 320, 30, 160, 190, 80, 340];

function hueFromKey(key: string): number {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return HUES[sum % HUES.length];
}

function pastelPalette(key: string): { bg: string; fg: string } {
  const h = hueFromKey(key || '?');
  return {
    bg: `hsl(${h} 40% 82%)`,
    fg: `hsl(${h} 45% 28%)`,
  };
}

export const UserAvatar: React.FC<UserAvatarProps> = memo(
  ({
    userId,
    avatar,
    firstName = '',
    lastName = '',
    size = 'md',
    showOnlineStatus = true,
    className = '',
  }) => {
    const { onlineUserIds } = useWebSocket();

    const isOnline = userId ? onlineUserIds.includes(userId) : false;
    const initials = getInitials(firstName, lastName) || '?';
    const fullName = `${firstName} ${lastName}`.trim() || 'User';
    const paletteKey = userId || fullName;
    const { bg, fg } = pastelPalette(paletteKey);

    return (
      <div className={`relative inline-flex ${className}`}>
        {avatar ? (
          <img
            src={avatar}
            alt={fullName}
            width={pixelSizes[size]}
            height={pixelSizes[size]}
            className={`${sizeClasses[size]} rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold`}
            style={{ background: bg, color: fg }}
          >
            {initials}
          </div>
        )}

        {/* Presence indicator. We only render the dot when the user is
            actually online — an "offline" gray dot adds visual noise to
            every avatar in dense lists (leaderboards, chats, mentions)
            without conveying anything the absence of a green dot doesn't
            already say. Slack/Discord/Linear all do this. */}
        {showOnlineStatus && isOnline && (
          <span
            className={`absolute ${dotPositionClasses[size]} ${dotSizeClasses[size]} bg-[color:var(--success)] rounded-full`}
            style={{ boxShadow: '0 0 0 2px var(--surface)' }}
            title="Online"
          />
        )}
      </div>
    );
  },
);

UserAvatar.displayName = 'UserAvatar';

interface UserAvatarWithStatusProps extends Omit<UserAvatarProps, 'showOnlineStatus'> {
  isOnline?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const UserAvatarWithStatus: React.FC<UserAvatarWithStatusProps> = memo(
  ({
    userId,
    avatar,
    firstName = '',
    lastName = '',
    size = 'md',
    isOnline = false,
    className = '',
  }) => {
    const initials = getInitials(firstName, lastName) || '?';
    const fullName = `${firstName} ${lastName}`.trim() || 'User';
    const paletteKey = userId || fullName;
    const { bg, fg } = pastelPalette(paletteKey);

    return (
      <div className={`relative inline-flex ${className}`}>
        {avatar ? (
          <img
            src={avatar}
            alt={fullName}
            width={pixelSizes[size]}
            height={pixelSizes[size]}
            className={`${sizeClasses[size]} rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold`}
            style={{ background: bg, color: fg }}
          >
            {initials}
          </div>
        )}

        {/* Same online-only rule as UserAvatar above — see the comment
            there for the rationale. */}
        {isOnline && (
          <span
            className={`absolute ${dotPositionClasses[size]} ${dotSizeClasses[size]} bg-[color:var(--success)] rounded-full`}
            style={{ boxShadow: '0 0 0 2px var(--surface)' }}
            title="Online"
          />
        )}
      </div>
    );
  },
);

UserAvatarWithStatus.displayName = 'UserAvatarWithStatus';

export default UserAvatar;
