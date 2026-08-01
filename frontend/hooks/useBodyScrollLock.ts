import { useEffect, useRef } from 'react';

// Global counter to track how many components are locking scroll
let lockCount = 0;

/**
 * Hook to manage body scroll lock.
 * Uses a reference counter to ensure scroll is only unlocked
 * when all components that locked it have unmounted.
 */
export function useBodyScrollLock(isLocked: boolean) {
  const wasLockedRef = useRef(false);

  useEffect(() => {
    if (isLocked && !wasLockedRef.current) {
      // Lock scroll
      lockCount++;
      wasLockedRef.current = true;
      document.body.style.overflow = 'hidden';
    } else if (!isLocked && wasLockedRef.current) {
      // Unlock scroll (only if this was the last lock)
      lockCount--;
      wasLockedRef.current = false;
      if (lockCount === 0) {
        document.body.style.overflow = 'unset';
      }
    }

    // Cleanup on unmount
    return () => {
      if (wasLockedRef.current) {
        lockCount--;
        wasLockedRef.current = false;
        if (lockCount === 0) {
          document.body.style.overflow = 'unset';
        }
      }
    };
  }, [isLocked]);
}
