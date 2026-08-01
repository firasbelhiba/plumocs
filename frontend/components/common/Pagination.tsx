'use client';

import React from 'react';
import { Button } from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPageInfo?: boolean;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  showPageInfo = true,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {showPageInfo && (
        <div className="text-sm text-fg-2">
          Page {currentPage} of {totalPages}
        </div>
      )}
      <div className={`flex gap-2 ${!showPageInfo ? 'ml-auto' : ''}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default Pagination;
