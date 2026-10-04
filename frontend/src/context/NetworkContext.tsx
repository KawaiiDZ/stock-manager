import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getRemoteHostUrl, setRemoteHostUrl, setAuthToken } from '../services/api';
import {
  getPendingCommits,
  getPendingCount,
  removeCommits,
  getClientId,
  getStationName
} from '../services/offlineQueue';
import { SyncPushResponse, MergedItemSummary } from '../types';

interface NetworkContextType {
  isOnline: boolean;
  isHost: boolean;
  remoteHostUrl: string | null;
  stationName: string;
  lanIp: string;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastSyncResult: MergedItemSummary[] | null;
  syncStatusMessage: string | null;
  connectToHost: (url: string, username?: string, password?: string) => Promise<{ success: boolean; message: string }>;
  disconnectFromHost: () => void;
  syncNow: () => Promise<SyncPushResponse | null>;
  refreshStatus: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [remoteHostUrl, setRemoteHostUrlState] = useState<string | null>(getRemoteHostUrl() || null);
  const [stationName, setStationNameState] = useState<string>('Main Host Register');
  const [lanIp, setLanIp] = useState<string>('127.0.0.1');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(getPendingCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<MergedItemSummary[] | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);
  const isOnlineRef = useRef<boolean>(true);

  // Sync ref to state
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const updatePendingCount = useCallback(() => {
    setPendingSyncCount(getPendingCount());
  }, []);

  // Listen to local queue updates
  useEffect(() => {
    window.addEventListener('offlineQueueUpdated', updatePendingCount);
    return () => window.removeEventListener('offlineQueueUpdated', updatePendingCount);
  }, [updatePendingCount]);

  // Fetch local host networking details
  const fetchHostInfo = useCallback(async () => {
    try {
      const info = await api.network.getInfo();
      if (info) {
        setLanIp(info.lan_ip || '127.0.0.1');
        if (!getRemoteHostUrl()) {
          setStationNameState(info.station_name || 'Main Host Register');
        }
      }
    } catch {
      // Local host offline or starting up
    }
  }, []);

  // Sync pending commits to host
  const syncNow = useCallback(async (): Promise<SyncPushResponse | null> => {
    if (isSyncingRef.current) return null;
    const pending = getPendingCommits();
    if (pending.length === 0) {
      setSyncStatusMessage('Everything is up to date.');
      return null;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncStatusMessage(`Pushing ${pending.length} offline changes to Host...`);

    try {
      const payload = {
        client_id: getClientId(),
        station_name: getStationName(),
        commits: pending,
      };

      const response = await api.sync.push(payload);
      if (response && response.success) {
        // Find which commits succeeded or were already processed
        const finishedIds = response.results
          .filter(r => r.status === 'CREATED_NEW' || r.status === 'ADDITIVE_MERGED' || r.status === 'ALREADY_PROCESSED')
          .map(r => r.commit_id);

        if (finishedIds.length > 0) {
          removeCommits(finishedIds);
        }

        setLastSyncTime(new Date());
        setLastSyncResult(response.results);
        setSyncStatusMessage(
          `Sync successful: ${response.processed_count} processed, ${response.skipped_count} skipped.`
        );
        setIsOnline(true);
        return response;
      } else {
        setSyncStatusMessage(response?.message || 'Sync failed.');
        return response;
      }
    } catch (err: any) {
      console.warn('Sync push failed:', err);
      setSyncStatusMessage(`Sync failed: ${err.message || 'Host unreachable'}`);
      setIsOnline(false);
      return null;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      updatePendingCount();
    }
  }, [updatePendingCount]);

  // Heartbeat check: Ping host every 6 seconds
  const pingHost = useCallback(async () => {
    try {
      await api.network.ping();
      if (!isOnlineRef.current) {
        setIsOnline(true);
        // Connection just restored! Auto-push offline commits if any
        if (getPendingCount() > 0) {
          syncNow();
        }
      }
    } catch {
      if (isOnlineRef.current) {
        setIsOnline(false);
      }
    }
  }, [syncNow]);

  useEffect(() => {
    fetchHostInfo();
    pingHost();

    const interval = setInterval(() => {
      pingHost();
    }, 6000);

    return () => clearInterval(interval);
  }, [fetchHostInfo, pingHost]);

  // Connect to a remote host terminal
  const connectToHost = useCallback(
    async (
      rawUrl: string,
      username?: string,
      password?: string
    ): Promise<{ success: boolean; message: string }> => {
      const cleanUrl = rawUrl.trim().replace(/\/+$/, '');
      if (!cleanUrl) {
        return { success: false, message: 'Invalid Host URL.' };
      }

      setIsSyncing(true);
      try {
        // 1. Test reachability
        const testRes = await api.network.testHost(cleanUrl);
        if (!testRes.reachable) {
          setIsSyncing(false);
          return { success: false, message: testRes.message || 'Host unreachable.' };
        }

        // 2. If credentials provided, login to get JWT token
        if (username && password) {
          const loginRes = await fetch(`${cleanUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const loginData = await loginRes.json();
          if (!loginRes.ok) {
            setIsSyncing(false);
            return {
              success: false,
              message: loginData.detail || 'Authentication failed on host.'
            };
          }
          if (loginData.token) {
            setAuthToken(loginData.token);
          }
        }

        // 3. Save remote host url
        setRemoteHostUrl(cleanUrl);
        setRemoteHostUrlState(cleanUrl);
        setStationNameState(testRes.station_name || 'Remote Host');
        setIsOnline(true);

        // 4. Trigger sync immediately if there are pending commits
        if (getPendingCount() > 0) {
          syncNow();
        }

        setIsSyncing(false);
        return { success: true, message: `Connected to ${testRes.station_name || 'Host'} successfully!` };
      } catch (err: any) {
        setIsSyncing(false);
        return { success: false, message: err.message || 'Connection error.' };
      }
    },
    [syncNow]
  );

  // Disconnect from remote host and revert to standalone host mode
  const disconnectFromHost = useCallback(() => {
    setRemoteHostUrl(null);
    setRemoteHostUrlState(null);
    setAuthToken(null);
    fetchHostInfo();
    setIsOnline(true);
    setSyncStatusMessage('Disconnected. Operating as Standalone / Host.');
  }, [fetchHostInfo]);

  const refreshStatus = useCallback(async () => {
    await pingHost();
    await fetchHostInfo();
    updatePendingCount();
  }, [pingHost, fetchHostInfo, updatePendingCount]);

  const value: NetworkContextType = {
    isOnline,
    isHost: !remoteHostUrl,
    remoteHostUrl,
    stationName,
    lanIp,
    pendingSyncCount,
    isSyncing,
    lastSyncTime,
    lastSyncResult,
    syncStatusMessage,
    connectToHost,
    disconnectFromHost,
    syncNow,
    refreshStatus,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export const useNetwork = (): NetworkContextType => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
