'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fallback?: React.ReactNode;
  placeholderClassName?: string;
  // Threshold for intersection observer (0-1, where 0.1 = 10% visible)
  threshold?: number;
  // Root margin for preloading (e.g., "100px" loads 100px before entering viewport)
  rootMargin?: string;
}

/**
 * Lazy-loaded image component using Intersection Observer
 * - Only loads images when they enter (or are about to enter) the viewport
 * - Shows a placeholder/skeleton while loading
 * - Handles loading errors gracefully
 * - Memoized to prevent unnecessary re-renders
 */
export const LazyImage: React.FC<LazyImageProps> = memo(
  ({
    src,
    alt,
    width,
    height,
    className,
    fallback,
    placeholderClassName,
    threshold = 0.1,
    rootMargin = '100px',
  }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const element = imgRef.current;
      if (!element) return;

      // Check if IntersectionObserver is supported
      if (!('IntersectionObserver' in window)) {
        // Fallback: load immediately for older browsers
        setIsInView(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              // Once loaded, no need to observe anymore
              observer.unobserve(element);
            }
          });
        },
        {
          threshold,
          rootMargin,
        },
      );

      observer.observe(element);

      return () => {
        observer.disconnect();
      };
    }, [threshold, rootMargin]);

    const handleLoad = () => {
      setIsLoaded(true);
    };

    const handleError = () => {
      setHasError(true);
    };

    // Default fallback is initials-style placeholder
    const defaultFallback = (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-3 dark:bg-gray-700 text-fg-3',
          placeholderClassName || className,
        )}
        style={{ width, height }}
      >
        <svg className="w-1/2 h-1/2 max-w-8 max-h-8" fill="currentColor" viewBox="0 0 24 24">
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );

    if (hasError) {
      return <>{fallback || defaultFallback}</>;
    }

    return (
      <div ref={imgRef} className="relative" style={{ width, height }}>
        {/* Placeholder/skeleton shown while loading */}
        {!isLoaded && (
          <div
            className={cn(
              'absolute inset-0 bg-surface-3 dark:bg-gray-700 animate-pulse',
              placeholderClassName || className,
            )}
          />
        )}

        {/* Only render img when in view */}
        {isInView && (
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            className={cn(
              className,
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy" // Native lazy loading as additional fallback
          />
        )}
      </div>
    );
  },
);

LazyImage.displayName = 'LazyImage';

/**
 * Lazy-loaded avatar component - circular image with fallback to initials
 */
interface LazyAvatarProps {
  src?: string | null;
  alt: string;
  initials?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const pixelSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

export const LazyAvatar: React.FC<LazyAvatarProps> = memo(
  ({ src, alt, initials, size = 'md', className }) => {
    const [hasError, setHasError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const avatarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const element = avatarRef.current;
      if (!element || !src) return;

      if (!('IntersectionObserver' in window)) {
        setIsInView(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              observer.unobserve(element);
            }
          });
        },
        { threshold: 0.1, rootMargin: '50px' },
      );

      observer.observe(element);

      return () => observer.disconnect();
    }, [src]);

    // No src or error - show initials fallback
    if (!src || hasError) {
      return (
        <div
          className={cn(
            sizeClasses[size],
            'rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center font-medium text-[color:var(--primary)] dark:text-primary-300',
            className,
          )}
        >
          {initials || alt.charAt(0).toUpperCase()}
        </div>
      );
    }

    return (
      <div
        ref={avatarRef}
        className={cn(sizeClasses[size], 'relative rounded-full overflow-hidden', className)}
      >
        {/* Placeholder */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-surface-3 dark:bg-gray-700 animate-pulse rounded-full" />
        )}

        {/* Image */}
        {isInView && (
          <img
            src={src}
            alt={alt}
            width={pixelSizes[size]}
            height={pixelSizes[size]}
            className={cn(
              'w-full h-full object-cover rounded-full transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            loading="lazy"
          />
        )}
      </div>
    );
  },
);

LazyAvatar.displayName = 'LazyAvatar';

export default LazyImage;
