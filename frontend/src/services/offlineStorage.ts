import {
  BusinessSettings,
  Category,
  CustomField,
  Product,
  Customer,
  Supplier,
  SyncSnapshotResponse,
  SyncCommit,
} from '../types';

const DB_NAME = 'stokflow_client_cache';
const DB_VERSION = 1;

const STORES = {
  META: 'meta',
  SETTINGS: 'settings',
  CATEGORIES: 'categories',
  CUSTOM_FIELDS: 'custom_fields',
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
} as const;

// Memory cache fallback in case IndexedDB is blocked or disabled
const memoryFallback: {
  meta: Record<string, any>;
  settings: BusinessSettings | null;
  categories: Category[];
  custom_fields: CustomField[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
} = {
  meta: {},
  settings: null,
  categories: [],
  custom_fields: [],
  products: [],
  customers: [],
  suppliers: [],
};

// Open or initialize IndexedDB
let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getDb(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Meta store
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'key' });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        }

        // Custom fields store
        if (!db.objectStoreNames.contains(STORES.CUSTOM_FIELDS)) {
          db.createObjectStore(STORES.CUSTOM_FIELDS, { keyPath: 'id' });
        }

        // Products store with indices
        if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
          const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
          productStore.createIndex('barcode', 'barcode', { unique: false });
          productStore.createIndex('sku', 'sku', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('category_id', 'category_id', { unique: false });
        }

        // Customers store
        if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
          db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        }

        // Suppliers store
        if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
          db.createObjectStore(STORES.SUPPLIERS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('IndexedDB failed to open, using memory fallback:', request.error);
        reject(request.error);
      };
    } catch (err) {
      reject(err);
    }
  });

  return dbPromise;
}

// LocalStorage helpers for small critical items as extra safety
function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.warn(`LocalStorage write error for ${key}:`, err);
  }
}

export const offlineStorage = {
  /**
   * Save an atomic store snapshot from the main counter host
   */
  async saveSnapshot(snapshot: SyncSnapshotResponse): Promise<void> {
    const nowIso = snapshot.timestamp || new Date().toISOString();

    // Cache locally in localStorage as fast fallback
    if (snapshot.settings) {
      writeLocalStorage('stokflow_cached_settings', snapshot.settings);
    }
    writeLocalStorage('stokflow_last_snapshot_time', nowIso);
    writeLocalStorage('stokflow_cached_categories', snapshot.categories || []);
    writeLocalStorage('stokflow_cached_custom_fields', snapshot.custom_fields || []);

    // Update in-memory fallback
    memoryFallback.settings = (snapshot.settings as BusinessSettings) || null;
    memoryFallback.categories = snapshot.categories || [];
    memoryFallback.custom_fields = snapshot.custom_fields || [];
    memoryFallback.products = snapshot.products || [];
    memoryFallback.customers = snapshot.customers || [];
    memoryFallback.suppliers = snapshot.suppliers || [];
    memoryFallback.meta['last_snapshot_time'] = nowIso;

    if (!isIndexedDBAvailable()) {
      window.dispatchEvent(new Event('offlineCatalogUpdated'));
      return;
    }

    try {
      const db = await getDb();
      const tx = db.transaction(
        [
          STORES.META,
          STORES.SETTINGS,
          STORES.CATEGORIES,
          STORES.CUSTOM_FIELDS,
          STORES.PRODUCTS,
          STORES.CUSTOMERS,
          STORES.SUPPLIERS,
        ],
        'readwrite'
      );

      // Meta
      const metaStore = tx.objectStore(STORES.META);
      metaStore.put({ key: 'last_snapshot_time', value: nowIso });

      // Settings
      if (snapshot.settings) {
        const settingsStore = tx.objectStore(STORES.SETTINGS);
        settingsStore.put({ key: 'main_settings', value: snapshot.settings });
      }

      // Categories
      const catStore = tx.objectStore(STORES.CATEGORIES);
      catStore.clear();
      (snapshot.categories || []).forEach(cat => {
        catStore.put(cat);
      });

      // Custom fields
      const cfStore = tx.objectStore(STORES.CUSTOM_FIELDS);
      cfStore.clear();
      (snapshot.custom_fields || []).forEach(cf => {
        cfStore.put(cf);
      });

      // Products
      const prodStore = tx.objectStore(STORES.PRODUCTS);
      prodStore.clear();
      (snapshot.products || []).forEach(prod => {
        prodStore.put(prod);
      });

      // Customers
      const custStore = tx.objectStore(STORES.CUSTOMERS);
      custStore.clear();
      (snapshot.customers || []).forEach(cust => {
        custStore.put(cust);
      });

      // Suppliers
      const suppStore = tx.objectStore(STORES.SUPPLIERS);
      suppStore.clear();
      (snapshot.suppliers || []).forEach(supp => {
        suppStore.put(supp);
      });

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      });

      window.dispatchEvent(new Event('offlineCatalogUpdated'));
    } catch (err) {
      console.warn('Failed to save snapshot to IndexedDB, fallback was saved:', err);
    }
  },

  /**
   * Retrieve cached Business Settings
   */
  async getSettings(): Promise<BusinessSettings | null> {
    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.SETTINGS, 'readonly');
        const store = tx.objectStore(STORES.SETTINGS);
        const req = store.get('main_settings');
        const res = await new Promise<{ key: string; value: BusinessSettings } | undefined>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (res && res.value) {
          return res.value;
        }
      }
    } catch (e) {
      console.warn('Error reading settings from IndexedDB:', e);
    }

    // Fallback to localStorage or memory
    const fromLs = readLocalStorage<BusinessSettings | null>('stokflow_cached_settings', null);
    if (fromLs) return fromLs;
    return memoryFallback.settings;
  },

  /**
   * Save settings directly to cache
   */
  async saveSettings(settings: BusinessSettings): Promise<void> {
    writeLocalStorage('stokflow_cached_settings', settings);
    memoryFallback.settings = settings;

    if (!isIndexedDBAvailable()) return;
    try {
      const db = await getDb();
      const tx = db.transaction(STORES.SETTINGS, 'readwrite');
      tx.objectStore(STORES.SETTINGS).put({ key: 'main_settings', value: settings });
    } catch (e) {
      console.warn('Error saving settings to IndexedDB:', e);
    }
  },

  /**
   * Retrieve cached categories
   */
  async getCategories(activeOnly: boolean = true): Promise<Category[]> {
    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.CATEGORIES, 'readonly');
        const store = tx.objectStore(STORES.CATEGORIES);
        const req = store.getAll();
        const items = await new Promise<Category[]>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        if (items && items.length > 0) {
          return activeOnly ? items.filter(c => c.is_active) : items;
        }
      }
    } catch (e) {
      console.warn('Error reading categories from IndexedDB:', e);
    }

    const fromLs = readLocalStorage<Category[]>('stokflow_cached_categories', []);
    const list = fromLs.length > 0 ? fromLs : memoryFallback.categories;
    return activeOnly ? list.filter(c => c.is_active) : list;
  },

  /**
   * Retrieve cached custom fields
   */
  async getCustomFields(categoryId?: number, activeOnly: boolean = true): Promise<CustomField[]> {
    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.CUSTOM_FIELDS, 'readonly');
        const store = tx.objectStore(STORES.CUSTOM_FIELDS);
        const req = store.getAll();
        const items = await new Promise<CustomField[]>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        if (items && items.length > 0) {
          let filtered = activeOnly ? items.filter(f => f.is_active) : items;
          if (categoryId !== undefined) {
            filtered = filtered.filter(f => !f.category_id || f.category_id === categoryId);
          }
          return filtered;
        }
      }
    } catch (e) {
      console.warn('Error reading custom fields from IndexedDB:', e);
    }

    const fromLs = readLocalStorage<CustomField[]>('stokflow_cached_custom_fields', []);
    let list = fromLs.length > 0 ? fromLs : memoryFallback.custom_fields;
    if (activeOnly) list = list.filter(f => f.is_active);
    if (categoryId !== undefined) list = list.filter(f => !f.category_id || f.category_id === categoryId);
    return list;
  },

  /**
   * Retrieve cached products with search, category filtering, and pagination
   */
  async getProducts(params?: {
    search?: string;
    category_id?: number;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<Product[]> {
    let allProducts: Product[] = [];

    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.PRODUCTS, 'readonly');
        const store = tx.objectStore(STORES.PRODUCTS);
        const req = store.getAll();
        allProducts = await new Promise<Product[]>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      }
    } catch (e) {
      console.warn('Error reading products from IndexedDB:', e);
    }

    if (allProducts.length === 0) {
      allProducts = memoryFallback.products;
    }

    // Apply filtering
    let results = allProducts;

    if (params?.is_active !== undefined) {
      results = results.filter(p => p.is_active === params.is_active);
    }

    if (params?.category_id !== undefined) {
      results = results.filter(p => p.category_id === params.category_id);
    }

    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      results = results.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    }

    // Pagination
    const skip = params?.skip || 0;
    const limit = params?.limit !== undefined ? params.limit : results.length;

    return results.slice(skip, skip + limit);
  },

  /**
   * Lookup product by exact barcode in offline cache
   */
  async getProductByBarcode(barcode: string): Promise<Product | null> {
    if (!barcode || !barcode.trim()) return null;
    const target = barcode.trim();

    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.PRODUCTS, 'readonly');
        const store = tx.objectStore(STORES.PRODUCTS);
        const index = store.index('barcode');
        const req = index.get(target);
        const product = await new Promise<Product | undefined>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (product) return product;
      }
    } catch (e) {
      console.warn('Error reading product by barcode from IndexedDB:', e);
    }

    // Fallback: search memory
    const found = memoryFallback.products.find(p => p.barcode === target);
    return found || null;
  },

  /**
   * Lookup single product by ID in offline cache
   */
  async getProduct(id: number): Promise<Product | null> {
    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.PRODUCTS, 'readonly');
        const store = tx.objectStore(STORES.PRODUCTS);
        const req = store.get(id);
        const product = await new Promise<Product | undefined>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (product) return product;
      }
    } catch (e) {
      console.warn('Error reading product by id from IndexedDB:', e);
    }

    const found = memoryFallback.products.find(p => p.id === id);
    return found || null;
  },

  /**
   * Retrieve cached customers
   */
  async getCustomers(params?: { search?: string; is_active?: boolean }): Promise<Customer[]> {
    let list: Customer[] = [];

    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.CUSTOMERS, 'readonly');
        const store = tx.objectStore(STORES.CUSTOMERS);
        const req = store.getAll();
        list = await new Promise<Customer[]>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      }
    } catch (e) {
      console.warn('Error reading customers from IndexedDB:', e);
    }

    if (list.length === 0) {
      list = memoryFallback.customers;
    }

    if (params?.is_active !== undefined) {
      list = list.filter(c => c.is_active === params.is_active);
    }

    if (params?.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
      );
    }

    return list;
  },

  /**
   * Get timestamp of the last successful snapshot pull from main counter
   */
  async getLastSnapshotTime(): Promise<string | null> {
    try {
      if (isIndexedDBAvailable()) {
        const db = await getDb();
        const tx = db.transaction(STORES.META, 'readonly');
        const store = tx.objectStore(STORES.META);
        const req = store.get('last_snapshot_time');
        const res = await new Promise<{ key: string; value: string } | undefined>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (res && res.value) return res.value;
      }
    } catch {
      // ignore
    }

    const lsTime = localStorage.getItem('stokflow_last_snapshot_time');
    if (lsTime) return lsTime;
    return memoryFallback.meta['last_snapshot_time'] || null;
  },

  /**
   * Optimistically apply an offline commit into the local offline catalog cache.
   * This guarantees that when a user creates a new product or restocks an item while offline,
   * the local inventory and barcode scanner reflect the change immediately.
   */
  async applyOptimisticCommit(commit: SyncCommit): Promise<void> {
    const { action, data } = commit;

    try {
      if (action === 'ADD_PRODUCT') {
        const existingByBarcode = data.barcode ? await this.getProductByBarcode(data.barcode) : null;
        if (existingByBarcode) {
          // Add to existing product stock
          existingByBarcode.current_stock =
            Number(existingByBarcode.current_stock || 0) + Number(data.opening_stock || data.current_stock || 0);
          if (data.selling_price) existingByBarcode.selling_price = Number(data.selling_price);
          if (data.purchase_price) existingByBarcode.purchase_price = Number(data.purchase_price);

          if (isIndexedDBAvailable()) {
            const db = await getDb();
            const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
            tx.objectStore(STORES.PRODUCTS).put(existingByBarcode);
          }
        } else {
          // Generate an optimistic local product
          const tempProduct: Product = {
            id: -(Date.now() % 10000000), // Negative temporary ID
            product_id: 'PRD-OFFLINE-' + Math.floor(Math.random() * 9000 + 1000),
            name: data.name || 'New Product',
            sku: data.sku || null,
            barcode: data.barcode || null,
            category_id: data.category_id || null,
            purchase_price: Number(data.purchase_price || 0),
            selling_price: Number(data.selling_price || 0),
            current_stock: Number(data.opening_stock || data.current_stock || 0),
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (isIndexedDBAvailable()) {
            const db = await getDb();
            const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
            tx.objectStore(STORES.PRODUCTS).put(tempProduct);
          }
          memoryFallback.products.push(tempProduct);
        }
      } else if (action === 'RESTOCK_DELTA') {
        let product: Product | null = null;
        if (data.barcode) {
          product = await this.getProductByBarcode(data.barcode);
        }
        if (!product && data.product_id) {
          product = await this.getProduct(Number(data.product_id));
        }

        if (product) {
          product.current_stock = Number(product.current_stock || 0) + Number(data.delta_quantity || 0);
          if (isIndexedDBAvailable()) {
            const db = await getDb();
            const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
            tx.objectStore(STORES.PRODUCTS).put(product);
          }
        }
      }

      window.dispatchEvent(new Event('offlineCatalogUpdated'));
    } catch (err) {
      console.warn('Failed to apply optimistic commit to offline storage:', err);
    }
  },
};
