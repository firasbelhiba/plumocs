'use client';

import React from 'react';
import { Input } from './Input';
import { Select } from './Select';
import { Button } from './Button';
import { cn } from '@/lib/utils';

export interface FilterField {
  /** Unique identifier for the filter */
  key: string;
  /** Display label for the field */
  label: string;
  /** Type of input to render */
  type: 'text' | 'select';
  /** Placeholder text */
  placeholder?: string;
  /** Options for select type */
  options?: { label: string; value: string }[];
}

export interface FilterBarProps {
  /** Array of filter field configurations */
  filters: FilterField[];
  /** Current filter values (keyed by filter key) */
  values: Record<string, string>;
  /** Callback when a filter value changes */
  onChange: (key: string, value: string) => void;
  /** Callback when clear filters is clicked */
  onClear: () => void;
  /** Optional callback when apply/submit is clicked */
  onSubmit?: () => void;
  /** Title displayed above filters. Default: "Filters" */
  title?: string;
  /** Show the title. Default: true */
  showTitle?: boolean;
  /** Number of columns at different breakpoints. Default: filters.length or 4 max */
  columns?: 1 | 2 | 3 | 4;
  /** Show apply/clear buttons. Default: false (live filtering) */
  showButtons?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Reusable filter bar component for admin pages and lists.
 * Supports text inputs and select dropdowns with consistent styling.
 *
 * @example
 * ```tsx
 * const [filters, setFilters] = useState({ type: '', status: '' });
 *
 * <FilterBar
 *   filters={[
 *     { key: 'type', label: 'Type', type: 'select', options: [...] },
 *     { key: 'search', label: 'Search', type: 'text', placeholder: 'Search...' },
 *   ]}
 *   values={filters}
 *   onChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
 *   onClear={() => setFilters({ type: '', status: '' })}
 * />
 * ```
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  values,
  onChange,
  onClear,
  onSubmit,
  title = 'Filters',
  showTitle = true,
  columns,
  showButtons = false,
  className,
}) => {
  const hasActiveFilters = Object.values(values).some((v) => v !== '');

  // Determine grid columns based on filter count
  const gridCols = columns || Math.min(filters.length + (showButtons ? 1 : 0), 4);
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }[gridCols];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  const renderField = (filter: FilterField) => {
    const value = values[filter.key] || '';

    if (filter.type === 'select') {
      return (
        <Select value={value} onChange={(e) => onChange(filter.key, e.target.value)}>
          <option value="">{filter.placeholder || `All ${filter.label}`}</option>
          {filter.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      );
    }

    return (
      <Input
        type="text"
        placeholder={filter.placeholder || `Search ${filter.label.toLowerCase()}...`}
        value={value}
        onChange={(e) => onChange(filter.key, e.target.value)}
      />
    );
  };

  const content = (
    <div className={`grid ${gridColsClass} gap-4`}>
      {filters.map((filter) => (
        <div key={filter.key}>
          <label className="block text-sm font-medium text-fg-2 mb-1">{filter.label}</label>
          {renderField(filter)}
        </div>
      ))}

      {/* Apply/Clear buttons */}
      {showButtons && (
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary" className="flex-1">
            Apply
          </Button>
          <Button type="button" variant="outline" onClick={onClear} className="flex-1">
            Clear
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'bg-surface rounded-lg shadow-sm border border-[color:var(--border)] p-4 md:p-6',
        className,
      )}
    >
      {showTitle && <h2 className="text-lg font-semibold text-fg mb-4">{title}</h2>}

      {showButtons ? (
        <form onSubmit={handleSubmit}>{content}</form>
      ) : (
        <>
          {content}
          {/* Inline clear for live filtering mode */}
          {hasActiveFilters && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-fg-2">Active filters applied</span>
              <Button variant="outline" size="sm" onClick={onClear}>
                Clear Filters
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FilterBar;
