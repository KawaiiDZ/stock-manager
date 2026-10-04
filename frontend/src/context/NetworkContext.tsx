import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, getRemoteHostUrl, setRemoteHostUrl, setAuthToken } from '../services/api';
import {
  getPendingCommits,
  getPendingCount,
  removeCommits,
  getClientId,
  getStationName
} from '../services/offlineQueue';
import { offlineStorage } from '../services/offlineStorage';
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
  lastSnapshotTime: string | null;
  lastSyncResult: MergedItemSummary[] | null;
  syncStatusMessage: string | null;
  connectToHost: (url: string, username?: string, password?: string) => Promise<{ success: boolean; message: string }>;
  disconnectFromHost: () => void;
  syncNow: () => Promise<SyncPushResponse | null>;
  pullHostSnapshot: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [remoteHostUrl, setRemoteHostUrlState] = useState<string | null>(getRemoteHostUrl() || null);
  const [stationName, setStationNameState] = useState<string>('Main Counter');
  const [lanIp, setLanIp] = useState<string>('127.0.0.1');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(getPendingCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSnapshotTime, setLastSnapshotTimeState] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<MergedItemSummary[] | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);
  const isOnlineRef = useRef<boolean>(true);

  // Sync ref to state
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // Load cached snapshot timestamp on mount
  useEffect(() => {
    offlineStorage.getLastSnapshotTime().then(t => {
      if (t) setLastSnapshotTimeState(t);
    });
  }, []);

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
          setStationNameState(info.station_name || 'Main Counter');
        }
      }
    } catch {
      // Local host starting up or quiet
    }
  }, []);

  // Pull complete store snapshot from Main Counter into local offline cache
  const pullHostSnapshot = useCallback(async (): Promise<boolean> => {
    try {
      const snapshot = await api.sync.getSnapshot();
      if (snapshot) {
        await offlineStorage.saveSnapshot(snapshot);
        setLastSnapshotTimeState(snapshot.timestamp);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Failed to refresh items from Main Counter:', err);
      return false;
    }
  }, []);

  // Send pending saved changes to Main Counter
  const syncNow = useCallback(async (): Promise<SyncPushResponse | null> => {
    if (isSyncingRef.current) return null;
    const pending = getPendingCommits();
    if (pending.length === 0) {
      setSyncStatusMessage('All saved changes have already been sent.');
      return null;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncStatusMessage(`Sending ${pending.length} saved change${pending.length > 1 ? 's' : ''} to Main Counter...`);

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

        // Refresh snapshot so local catalog reflects reconciled inventory
        pullHostSnapshot();

        setLastSyncTime(new Date());
        setLastSyncResult(response.results);
        setSyncStatusMessage(
          `Changes sent successfully! (${response.processed_count} item${response.processed_count === 1 ? '' : 's'} updated)`
        );
        setIsOnline(true);
        return response;
      } else {
        setSyncStatusMessage(response?.message || 'Could not send changes.');
        return response;
      }
    } catch (err: any) {
      console.warn('Sync push failed:', err);
      setSyncStatusMessage(`Could not send changes: ${err.message || 'Main Counter unreachable'}`);
      setIsOnline(false);
      return null;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      updatePendingCount();
    }
  }, [updatePendingCount, pullHostSnapshot]);

  // Heartbeat check: Ping host every 6 seconds
  const pingHost = useCallback(async () => {
    try {
      await api.network.ping();
      if (!isOnlineRef.current) {
        setIsOnline(true);
        // Connection just restored! Auto-send pending saved changes if any
        if (getPendingCount() > 0) {
          syncNow();
        }
        // Refresh local items from Main Counter
        pullHostSnapshot();
      }
    } catch {
      if (isOnlineRef.current) {
        setIsOnline(false);
      }
    }
  }, [syncNow, pullHostSnapshot]);

  useEffect(() => {
    fetchHostInfo();
    pingHost();
    if (getRemoteHostUrl()) {
      pullHostSnapshot();
    }

    const interval = setInterval(() => {
      pingHost();
    }, 6000);

    return () => clearInterval(interval);
  }, [fetchHostInfo, pingHost, pullHostSnapshot]);

  // Connect to a remote Main Counter
  const connectToHost = useCallback(
    async (
      rawUrl: string,
      username?: string,
      password?: string
    ): Promise<{ success: boolean; message: string }> => {
      const cleanUrl = rawUrl.trim().replace(/\/+$/, '');
      if (!cleanUrl) {
        return { success: false, message: 'Please enter a valid Main Counter Address.' };
      }

      setIsSyncing(true);
      try {
        // 1. Test reachability
        const testRes = await api.network.testHost(cleanUrl);
        if (!testRes.reachable) {
          setIsSyncing(false);
          return { success: false, message: testRes.message || 'Could not reach Main Counter at this address.' };
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
              message: loginData.detail || 'Incorrect username or password on Main Counter.'
            };
          }
          if (loginData.token) {
            setAuthToken(loginData.token);
          }
        }

        // 3. Save remote host url
        setRemoteHostUrl(cleanUrl);
        setRemoteHostUrlState(cleanUrl);
        setStationNameState(testRes.station_name || 'Main Counter');
        setIsOnline(true);

        // 4. Download complete store snapshot to local offline storage
        try {
          const snapshot = await api.sync.getSnapshot();
          if (snapshot) {
            await offlineStorage.saveSnapshot(snapshot);
            setLastSnapshotTimeState(snapshot.timestamp);
          }
        } catch (e) {
          console.warn('Initial snapshot download error:', e);
        }

        // 5. Trigger sync immediately if there are pending commits
        if (getPendingCount() > 0) {
          syncNow();
        }

        setIsSyncing(false);
        return { success: true, message: `Connected to ${testRes.station_name || 'Main Counter'} successfully!` };
      } catch (err: any) {
        setIsSyncing(false);
        return { success: false, message: err.message || 'Connection error.' };
      }
    },
    [syncNow]
  );

  // Disconnect from remote host and revert to standalone mode
  const disconnectFromHost = useCallback(() => {
    setRemoteHostUrl(null);
    setRemoteHostUrlState(null);
    setAuthToken(null);
    fetchHostInfo();
    setIsOnline(true);
    setSyncStatusMessage('Disconnected. Operating on this device.');
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
    lastSnapshotTime,
    lastSyncResult,
    syncStatusMessage,
    connectToHost,
    disconnectFromHost,
    syncNow,
    pullHostSnapshot,
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
