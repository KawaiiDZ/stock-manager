import { SyncCommit } from '../types';

const STORAGE_KEY = 'stokflow_offline_sync_queue';
const CLIENT_ID_KEY = 'stokflow_terminal_client_id';
const STATION_NAME_KEY = 'stokflow_terminal_station_name';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'commit_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = 'station_' + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function getStationName(): string {
  return localStorage.getItem(STATION_NAME_KEY) || 'Restock Terminal';
}

export function setStationName(name: string): void {
  localStorage.setItem(STATION_NAME_KEY, name.trim());
}

export function getPendingCommits(): SyncCommit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse offline sync queue from localStorage:', e);
    return [];
  }
}

export function getPendingCount(): number {
  return getPendingCommits().length;
}

export function enqueueCommit(action: 'ADD_PRODUCT' | 'RESTOCK_DELTA', data: Record<string, any>): SyncCommit {
  const commit: SyncCommit = {
    id: generateId(),
    action,
    timestamp: new Date().toISOString(),
    data
  };

  const queue = getPendingCommits();
  queue.push(commit);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to persist commit to localStorage:', e);
  }

  // Dispatch custom storage event for reactive UI updates across components
  window.dispatchEvent(new Event('offlineQueueUpdated'));

  return commit;
}

export function enqueueAddProduct(productData: Record<string, any>): SyncCommit {
  return enqueueCommit('ADD_PRODUCT', {
    name: productData.name,
    barcode: productData.barcode,
    sku: productData.sku,
    category_id: productData.category_id,
    purchase_price: productData.purchase_price,
    selling_price: productData.selling_price,
    opening_stock: productData.opening_stock || productData.current_stock || 0,
    min_stock_alert: productData.min_stock_alert
  });
}

export function enqueueRestockDelta(
  productId: number | string,
  deltaQuantity: number,
  unitCost: number = 0,
  barcode?: string,
  name?: string
): SyncCommit {
  return enqueueCommit('RESTOCK_DELTA', {
    product_id: productId,
    delta_quantity: deltaQuantity,
    unit_cost: unitCost,
    barcode,
    name
  });
}

export function removeCommits(commitIds: string[]): void {
  const idSet = new Set(commitIds);
  const queue = getPendingCommits();
  const updated = queue.filter(c => !idSet.has(c.id));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to update localStorage after commit removal:', e);
  }
  window.dispatchEvent(new Event('offlineQueueUpdated'));
}

export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('offlineQueueUpdated'));
}
