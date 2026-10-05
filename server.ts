import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import {
  INITIAL_SHOES,
  sortWithFavoritesFirst,
  stripReadyMadeImagesFromShoes,
} from './src/utils/storage.js';
import {
  INITIAL_ORDERS,
  INITIAL_DEDUCTIONS,
  INITIAL_LOGIN_LOGS,
  stripReadyMadeImagesFromOrders,
  stripLegacyDemoDeductions,
} from './src/utils/authStorage.js';
import {
  ShoeItem,
  OrderPost,
  StockDeductionLog,
  SecurityAlert,
  EmployeeLoginLog,
} from './src/types/inventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE_PATH = path.join(__dirname, 'warehouse_db.json');

// Supabase Configuration
const SUPABASE_RAW_URL = process.env.SUPABASE_URL || 'https://vfmaseffpvhjthxgwnbb.supabase.co';
const SUPABASE_URL = SUPABASE_RAW_URL.replace('.supabase.com', '.supabase.co').replace(/\/+$/, '');
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_LPxFPt7PsPgB-DbvSU9_3w_FYPXj7iK';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let isSupabaseTableReady = false;

interface WarehouseState {
  shoes: ShoeItem[];
  deletedShoeIds: string[];
  deductions: StockDeductionLog[];
  orders: OrderPost[];
  securityAlerts: SecurityAlert[];
  loginLogs: EmployeeLoginLog[];
  updatedAt: number;
}

function loadWarehouseState(): WarehouseState {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      const deletedShoeIds: string[] = Array.isArray(parsed.deletedShoeIds)
        ? parsed.deletedShoeIds
        : [];
      const deletedSet = new Set(deletedShoeIds);
      const cleanedShoes = Array.isArray(parsed.shoes)
        ? sortWithFavoritesFirst(stripReadyMadeImagesFromShoes(parsed.shoes)).filter(
            (s) => s && s.id && !deletedSet.has(s.id)
          )
        : sortWithFavoritesFirst(INITIAL_SHOES);
      const cleanedOrders = Array.isArray(parsed.orders)
        ? stripReadyMadeImagesFromOrders(parsed.orders)
        : INITIAL_ORDERS;
      const cleanedDeductions = Array.isArray(parsed.deductions)
        ? stripLegacyDemoDeductions(parsed.deductions)
        : INITIAL_DEDUCTIONS;
      const loadedState: WarehouseState = {
        shoes: cleanedShoes,
        deletedShoeIds,
        deductions: cleanedDeductions,
        orders: cleanedOrders,
        securityAlerts: Array.isArray(parsed.securityAlerts) ? parsed.securityAlerts : [],
        loginLogs:
          Array.isArray(parsed.loginLogs) && parsed.loginLogs.length > 0
            ? parsed.loginLogs
            : INITIAL_LOGIN_LOGS,
        updatedAt: parsed.updatedAt || Date.now(),
      };
      saveWarehouseState(loadedState);
      return loadedState;
    }
  } catch (err) {
    console.error('Failed to read warehouse_db.json, initializing defaults:', err);
  }

  const initialState: WarehouseState = {
    shoes: sortWithFavoritesFirst(INITIAL_SHOES),
    deletedShoeIds: [],
    deductions: INITIAL_DEDUCTIONS,
    orders: INITIAL_ORDERS,
    securityAlerts: [],
    loginLogs: INITIAL_LOGIN_LOGS,
    updatedAt: Date.now(),
  };
  saveWarehouseState(initialState);
  return initialState;
}

function saveWarehouseState(state: WarehouseState): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save warehouse_db.json:', err);
  }
}

function applyShoeUpdates(
  incomingShoes: ShoeItem[] | undefined,
  incomingDeletedIds: string[] | undefined,
  eventType?: string,
  latestDeduction?: StockDeductionLog | null
) {
  if (Array.isArray(incomingDeletedIds)) {
    for (const id of incomingDeletedIds) {
      if (id && !warehouseState.deletedShoeIds.includes(id)) {
        warehouseState.deletedShoeIds.push(id);
      }
    }
  }

  if (eventType === 'delete_piece' && latestDeduction?.shoeId) {
    if (!warehouseState.deletedShoeIds.includes(latestDeduction.shoeId)) {
      warehouseState.deletedShoeIds.push(latestDeduction.shoeId);
    }
  }

  const deletedSet = new Set(warehouseState.deletedShoeIds);

  const map = new Map<string, ShoeItem>();
  for (const s of warehouseState.shoes) {
    if (s && s.id && !deletedSet.has(s.id)) {
      map.set(s.id, s);
    }
  }

  if (Array.isArray(incomingShoes)) {
    const cleaned = stripReadyMadeImagesFromShoes(incomingShoes);
    for (const incoming of cleaned) {
      if (incoming && incoming.id && !deletedSet.has(incoming.id)) {
        if (!map.has(incoming.id)) {
          map.set(incoming.id, incoming);
        } else {
          const existing = map.get(incoming.id)!;
          if ((incoming.updatedAt || 0) >= (existing.updatedAt || 0)) {
            map.set(incoming.id, incoming);
          }
        }
      }
    }
  }

  warehouseState.shoes = sortWithFavoritesFirst(Array.from(map.values()));

  // Async sync to Supabase products table
  if (isSupabaseTableReady) {
    if (Array.isArray(incomingShoes)) {
      for (const s of incomingShoes) {
        if (s && s.id && !deletedSet.has(s.id)) {
          persistShoeToSupabase(s).catch(() => {});
        }
      }
    }
    if (Array.isArray(incomingDeletedIds)) {
      for (const dId of incomingDeletedIds) {
        deleteShoeFromSupabase(dId).catch(() => {});
      }
    }
  }
}

async function persistShoeToSupabase(shoe: ShoeItem) {
  try {
    const row = {
      id: shoe.id,
      code: shoe.code || '',
      name: shoe.name || '',
      price: Number(shoe.price) || 0,
      currency: shoe.currency || 'د.ع',
      additional_info: shoe.additionalInfo || '',
      primary_image: shoe.primaryImage || '',
      is_favorite: Boolean(shoe.isFavorite),
      favorited_at: shoe.favoritedAt || null,
      colors: Array.isArray(shoe.colors) ? shoe.colors : [],
      created_at: shoe.createdAt || Date.now(),
      updated_at: shoe.updatedAt || Date.now(),
    };
    const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
    if (error) {
      if (error.code === 'PGRST205') isSupabaseTableReady = false;
      console.warn('[Supabase] Upsert product warning:', error.message);
    } else {
      isSupabaseTableReady = true;
    }
  } catch (err) {
    console.error('[Supabase] Persist exception:', err);
  }
}

async function deleteShoeFromSupabase(shoeId: string) {
  try {
    const { error } = await supabase.from('products').delete().eq('id', shoeId);
    if (error && error.code === 'PGRST205') isSupabaseTableReady = false;
  } catch (err) {
    console.error('[Supabase] Delete exception:', err);
  }
}

async function syncWithSupabase() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        isSupabaseTableReady = false;
        console.log('[Supabase] Connected to project! Notice: Table "products" has not been created yet in SQL Editor.');
      } else {
        console.warn('[Supabase] Fetch error:', error.message);
      }
      return;
    }

    isSupabaseTableReady = true;
    if (Array.isArray(data) && data.length > 0) {
      const fetchedShoes: ShoeItem[] = data.map((row: any) => ({
        id: String(row.id),
        code: String(row.code || ''),
        name: row.name || undefined,
        price: Number(row.price) || 0,
        currency: row.currency || 'د.ع',
        additionalInfo: row.additional_info ?? row.additionalInfo ?? '',
        primaryImage: row.primary_image ?? row.primaryImage ?? '',
        isFavorite: Boolean(row.is_favorite ?? row.isFavorite ?? false),
        favoritedAt: row.favorited_at ? Number(row.favorited_at) : undefined,
        colors: Array.isArray(row.colors) ? row.colors : [],
        createdAt: Number(row.created_at ?? row.createdAt) || Date.now(),
        updatedAt: Number(row.updated_at ?? row.updatedAt) || Date.now(),
      }));

      applyShoeUpdates(fetchedShoes, warehouseState.deletedShoeIds, 'supabase_sync');
      saveWarehouseState(warehouseState);
      console.log(`[Supabase] Successfully loaded ${fetchedShoes.length} products from Supabase!`);
    } else {
      console.log('[Supabase] Table "products" is connected and ready.');
    }
  } catch (err) {
    console.error('[Supabase] Sync exception:', err);
  }
}

let warehouseState: WarehouseState = loadWarehouseState();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Increase payload limit for base64 shoe images
  app.use(express.json({ limit: '25mb' }));

  const clients = new Set<WebSocket>();

  function broadcastToAll(message: object, excludeWs?: WebSocket) {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    clients.add(ws);

    // Send initial authoritative state on connect
    ws.send(
      JSON.stringify({
        type: 'state:init',
        state: warehouseState,
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'state:update' && msg.payload) {
          const {
            shoes,
            deletedShoeIds,
            deductions,
            orders,
            securityAlerts,
            loginLogs,
            eventType,
            latestDeduction,
            latestLogin,
            senderId,
          } = msg.payload;

          applyShoeUpdates(shoes, deletedShoeIds, eventType, latestDeduction);

          if (Array.isArray(deductions)) {
            warehouseState.deductions = deductions;
          }
          if (Array.isArray(orders)) {
            warehouseState.orders = orders;
          }
          if (Array.isArray(securityAlerts)) {
            warehouseState.securityAlerts = securityAlerts;
          }
          if (Array.isArray(loginLogs)) {
            warehouseState.loginLogs = loginLogs;
          }
          warehouseState.updatedAt = Date.now();
          saveWarehouseState(warehouseState);

          broadcastToAll(
            {
              type: 'state:updated',
              state: warehouseState,
              eventType: eventType || 'sync',
              latestDeduction: latestDeduction || null,
              latestLogin: latestLogin || null,
              senderId: senderId || null,
            },
            ws
          );
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Handle WebSocket upgrade on /ws path only so Vite HMR / other paths aren't hijacked if any
  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // REST API routes for authoritative state & fallback sync
  app.get('/api/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json(warehouseState);
  });

  app.post('/api/sync', (req, res) => {
    const {
      shoes,
      deletedShoeIds,
      deductions,
      orders,
      securityAlerts,
      loginLogs,
      eventType,
      latestDeduction,
      latestLogin,
      senderId,
    } = req.body || {};

    applyShoeUpdates(shoes, deletedShoeIds, eventType, latestDeduction);

    if (Array.isArray(deductions)) {
      warehouseState.deductions = deductions;
    }
    if (Array.isArray(orders)) {
      warehouseState.orders = orders;
    }
    if (Array.isArray(securityAlerts)) {
      warehouseState.securityAlerts = securityAlerts;
    }
    if (Array.isArray(loginLogs)) {
      warehouseState.loginLogs = loginLogs;
    }
    warehouseState.updatedAt = Date.now();
    saveWarehouseState(warehouseState);

    broadcastToAll({
      type: 'state:updated',
      state: warehouseState,
      eventType: eventType || 'sync',
      latestDeduction: latestDeduction || null,
      latestLogin: latestLogin || null,
      senderId: senderId || null,
    });

    res.json({ ok: true, state: warehouseState });
  });

  // Supabase Status & Schema Health
  app.get('/api/supabase/status', async (_req, res) => {
    try {
      const { data, error, count } = await supabase
        .from('products')
        .select('id', { count: 'exact' })
        .limit(1);
      if (error) {
        return res.json({
          connected: true,
          tableExists: false,
          error: error.message,
          code: error.code,
        });
      }
      isSupabaseTableReady = true;
      res.json({
        connected: true,
        tableExists: true,
        count: count ?? data?.length ?? 0,
      });
    } catch (e: any) {
      res.json({ connected: false, tableExists: false, error: e?.message });
    }
  });

  // Supabase Manual Re-Sync trigger
  app.post('/api/supabase/sync', async (_req, res) => {
    await syncWithSupabase();
    res.json({ ok: true, state: warehouseState, isSupabaseTableReady });
  });

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Iavenda Warehouse Server running on http://0.0.0.0:${PORT}`);
    // Sync initial state with Supabase products table
    syncWithSupabase().catch((err) => {
      console.warn('[Supabase] Startup sync warning:', err);
    });
  });
}

startServer();
