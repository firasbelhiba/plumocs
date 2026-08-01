'use client';

import React from 'react';

/**
 * Presence shim.
 *
 * The project-management console tracks presence over its own WebSocket
 * context, and `UserAvatar` reads `onlineUserIds` from it. The support console
 * already knows who is around — each agent carries an `availability` field
 * from `/users` — so this provider adapts that into the same shape rather
 * than opening a second socket. Copied components work unchanged.
 */
interface WebSocketContextValue {
  onlineUserIds: string[];
}

const WebSocketContext = React.createContext<WebSocketContextValue>({ onlineUserIds: [] });

export function PresenceProvider({
  onlineUserIds = [],
  children,
}: {
  onlineUserIds?: string[];
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ onlineUserIds }), [onlineUserIds.join(',')]);
  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket(): WebSocketContextValue {
  return React.useContext(WebSocketContext);
}
