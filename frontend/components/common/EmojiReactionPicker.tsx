'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Icon } from './Icon';

// Meta/Facebook style emoji reactions
const EMOJI_REACTIONS = [
  { emoji: '👍', name: 'like' },
  { emoji: '❤️', name: 'love' },
  { emoji: '😂', name: 'haha' },
  { emoji: '😮', name: 'wow' },
  { emoji: '😢', name: 'sad' },
  { emoji: '😡', name: 'angry' },
];

interface Reaction {
  userId: string | { _id: string };
  reaction: string;
}

interface EmojiReactionPickerProps {
  reactions: Reaction[];
  currentUserId?: string;
  onAddReaction: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  disabled?: boolean;
}

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({
  reactions = [],
  currentUserId,
  onAddReaction,
  onRemoveReaction,
  disabled = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  // Memoize reaction groups to avoid recalculating on every render
  const reactionGroups = useMemo(() => {
    return reactions.reduce(
      (acc, reaction) => {
        const emoji = reaction.reaction;
        if (!acc[emoji]) {
          acc[emoji] = { count: 0, users: [], hasCurrentUser: false };
        }
        acc[emoji].count++;
        const oderId = typeof reaction.userId === 'object' ? reaction.userId._id : reaction.userId;
        acc[emoji].users.push(oderId);
        if (oderId === currentUserId) {
          acc[emoji].hasCurrentUser = true;
        }
        return acc;
      },
      {} as Record<string, { count: number; users: string[]; hasCurrentUser: boolean }>,
    );
  }, [reactions, currentUserId]);

  const handleReactionClick = useCallback(
    (emoji: string) => {
      if (disabled) return;

      const group = reactionGroups[emoji];
      if (group?.hasCurrentUser) {
        onRemoveReaction(emoji);
      } else {
        onAddReaction(emoji);
      }
      setShowPicker(false);
    },
    [disabled, reactionGroups, onRemoveReaction, onAddReaction],
  );

  const handleExistingReactionClick = useCallback(
    (emoji: string) => {
      if (disabled) return;

      const group = reactionGroups[emoji];
      if (group?.hasCurrentUser) {
        onRemoveReaction(emoji);
      } else {
        onAddReaction(emoji);
      }
    },
    [disabled, reactionGroups, onRemoveReaction, onAddReaction],
  );

  return (
    <div className="flex items-center gap-1.5" ref={pickerRef}>
      {/* Display existing reactions */}
      {Object.entries(reactionGroups).map(([emoji, group]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => handleExistingReactionClick(emoji)}
          disabled={disabled}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all ${
            group.hasCurrentUser
              ? 'bg-primary/20 border border-primary text-primary dark:bg-primary/30'
              : 'bg-surface-2 hover:bg-surface-3 dark:hover:bg-dark-300 border border-transparent'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={`${group.count} ${group.count === 1 ? 'reaction' : 'reactions'}`}
        >
          <span>{emoji}</span>
          <span className="text-xs font-medium">{group.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setShowPicker(!showPicker)}
          disabled={disabled}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg-2 dark:hover:text-gray-200 transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title="Add reaction"
        >
          <Icon name="comment-emoji" size={16} />
        </button>

        {/* Emoji picker dropdown */}
        {showPicker && (
          <div className="absolute left-0 bottom-full mb-2 bg-surface rounded-full shadow-lg border border-[color:var(--border)] px-2 py-1.5 flex items-center gap-1 z-popover animate-in fade-in slide-in-from-bottom-2 duration-150">
            {EMOJI_REACTIONS.map(({ emoji, name }) => {
              const isSelected = reactionGroups[emoji]?.hasCurrentUser;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReactionClick(emoji)}
                  className={`text-xl p-1.5 rounded-full transition-all hover:scale-125 hover:bg-surface-2 ${
                    isSelected ? 'bg-primary/20' : ''
                  }`}
                  title={name}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
