'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  projectId?: string;
  rows?: number;
}

const MOCK_USERS: User[] = [
  { id: '1', name: 'John Doe', email: 'john@plumo.work' },
  { id: '2', name: 'Jane Smith', email: 'jane@plumo.work' },
  { id: '3', name: 'Mike Johnson', email: 'mike@plumo.work' },
  { id: '4', name: 'Sarah Williams', email: 'sarah@plumo.work' },
  { id: '5', name: 'David Brown', email: 'david@plumo.work' },
];

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Write a comment...',
  className,
  projectId: _projectId,
  rows = 4,
}) => {
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Debounce timeout ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Detect @ mentions in text with debounce to prevent running on every keystroke
  useEffect(() => {
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the mention detection
    debounceRef.current = setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const text = value;
      const cursor = textarea.selectionStart;

      // Find the last @ before cursor
      const textBeforeCursor = text.slice(0, cursor);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

        // Check if there's a space after @, if so, don't show suggestions
        if (textAfterAt.includes(' ')) {
          setShowSuggestions(false);
          return;
        }

        // Show suggestions if we're right after @ or typing a name
        const query = textAfterAt.toLowerCase();

        const filtered = MOCK_USERS.filter(
          (user) =>
            user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
        );

        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    }, 150); // 150ms debounce

    // Cleanup timeout on unmount or value change
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  // Insert mention into text
  const insertMention = useCallback(
    (user: User) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const text = value;
      const cursor = textarea.selectionStart;
      const textBeforeCursor = text.slice(0, cursor);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const beforeMention = text.slice(0, lastAtIndex);
        const afterCursor = text.slice(cursor);
        const mention = `@${user.name}`;
        const newValue = beforeMention + mention + ' ' + afterCursor;

        onChange(newValue);
        setShowSuggestions(false);

        // Set cursor position after the mention
        setTimeout(() => {
          const newCursor = lastAtIndex + mention.length + 1;
          textarea.setSelectionRange(newCursor, newCursor);
          textarea.focus();
        }, 0);
      }
    },
    [value, onChange],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
        case 'Tab':
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            insertMention(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, insertMention, onSubmit],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showSuggestions]);

  // Get cursor position for positioning suggestions
  const getSuggestionsPosition = () => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    // This is a simple approximation - in production you'd use a library
    // like textarea-caret for accurate positioning
    return {
      bottom: '100%',
      left: '0',
      marginBottom: '8px',
    };
  };

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 border border-[color:var(--border-strong)] rounded-token-sm bg-surface text-fg placeholder:text-fg-3 focus:outline-none focus:border-[color:var(--primary)] focus-ring resize-none"
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-dropdown w-full max-w-sm bg-surface border border-[color:var(--border-strong)] rounded-lg shadow-lg max-h-60 overflow-y-auto animate-fade-in"
          style={getSuggestionsPosition()}
        >
          {suggestions.map((user, index) => (
            <button
              key={user.id}
              type="button"
              onClick={() => insertMention(user)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                'w-full px-4 py-2 text-left hover:bg-bg flex items-center gap-3 transition-colors',
                index === selectedIndex && 'bg-primary/10',
              )}
            >
              <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fg truncate">{user.name}</p>
                <p className="text-xs text-fg-3 truncate">{user.email}</p>
              </div>
              {index === selectedIndex && <div className="text-xs text-fg-3 flex-shrink-0">↵</div>}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs text-fg-3">
        Type @ to mention someone • {value.length} characters
        {onSubmit && ' • Cmd/Ctrl+Enter to submit'}
      </div>
    </div>
  );
};
