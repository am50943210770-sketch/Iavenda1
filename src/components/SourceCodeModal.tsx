import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Code2, FileCode, Terminal, Download, FolderArchive } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface CodeFileItem {
  id: string;
  name: string;
  path: string;
  description: string;
  language: string;
  content: string;
}

export const SourceCodeModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeFileId, setActiveFileId] = useState<string>('server');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const files: CodeFileItem[] = [
    {
      id: 'server',
      name: 'server.ts',
      path: '/server.ts',
      description: 'خادم Node.js مع Express و WebSocket للمزامنة اللحظية بين جميع الموظفين وحفظ قاعدة البيانات',
      language: 'typescript',
      content: `import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
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
}

let warehouseState: WarehouseState = loadWarehouseState();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

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

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

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
    console.log(\`Iavenda Warehouse Server running on http://0.0.0.0:\${PORT}\`);
  });
}

startServer();`,
    },
    {
      id: 'types',
      name: 'types/inventory.ts',
      path: '/src/types/inventory.ts',
      description: 'تعريفات TypeScript لجميع النماذج والبيانات والأدوار',
      language: 'typescript',
      content: `export interface SizeStock {
  size: number | string;
  quantity: number;
}

export interface ColorVariant {
  id: string;
  colorName: string; // "أبيض", "أسود", "وردي", "نيلي", "جوزي", "بيج"
  colorHex: string;
  images: string[]; // Image URLs or Base64 data
  sizes: SizeStock[];
  additionalNotes?: string;
  sku?: string;
}

export interface ShoeItem {
  id: string;
  code: string; // كود الموديل
  name?: string; // اسم القطعة
  price: number; // السعر
  currency: string; // د.ع
  additionalInfo: string; // معلومات إضافية
  primaryImage: string; // صورة سريعة للبطاقة الخارجية
  isFavorite: boolean; // تفضيل بقلب ❤️
  favoritedAt?: number;
  colors: ColorVariant[];
  createdAt: number;
  updatedAt: number;
}

export interface ColorOption {
  name: string;
  hex: string;
  textColor?: string;
}

export const PRESET_COLORS: ColorOption[] = [
  { name: 'أبيض', hex: '#FFFFFF', textColor: '#1e293b' },
  { name: 'أسود', hex: '#18181B', textColor: '#ffffff' },
  { name: 'وردي', hex: '#F472B6', textColor: '#831843' },
  { name: 'نيلي', hex: '#1E3A8A', textColor: '#ffffff' },
  { name: 'جوزي', hex: '#78350F', textColor: '#ffffff' },
  { name: 'بيج', hex: '#D4B996', textColor: '#451a03' },
];

export const DEFAULT_SIZES = [36, 37, 38, 39, 40, 41, 42, 43];

export interface DeleteConfirmTarget {
  type: 'item' | 'shoe' | 'color' | 'size';
  itemId: string;
  shoeId?: string;
  colorId?: string;
  size?: number | string;
  code: string;
  shoeName?: string;
  colorName?: string;
  sizesSummary?: string;
  title?: string;
}

export interface AdminUser {
  id: string; // 'حذيفة' | 'احمد'
  displayName: string;
  roleTitle: string; // 'مشرف' | 'موظف'
  isSupervisor: boolean;
  canViewDeductions: boolean;
  canViewSecurityAlerts: boolean;
}

export interface AuthSession {
  adminId: string;
  displayName: string;
  isSupervisor: boolean;
  loginTime: number; // 12-hour session expiry
}

export type ChatRoomId = 'orders' | 'notes';

export interface OrderPost {
  id: string;
  roomId?: ChatRoomId;
  authorId: string;
  authorName: string;
  text: string;
  image?: string;
  isConfirmed: boolean;
  confirmedAt?: number;
  confirmedBy?: string;
  createdAt: number;
  updatedAt?: number;
  editedBy?: string;
  editedByName?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedByName?: string;
  deletedAt?: number;
  previousText?: string;
  previousImage?: string;
}

export interface StockDeductionLog {
  id: string;
  shoeId: string;
  shoeCode: string;
  shoeName?: string;
  colorName: string;
  size: number | string;
  quantityDecreased: number;
  operationCategory?: 'deduct' | 'add';
  adminId: string;
  adminName: string;
  timestamp: number;
  actionType?:
    | 'pair_deduct'
    | 'color_delete'
    | 'item_delete'
    | 'item_add'
    | 'color_add'
    | 'size_add'
    | 'stock_add';
  actionLabel?: string;
  isReadBySupervisor?: boolean;
}

export interface SecurityAlert {
  id: string;
  attemptedName: string;
  attemptedCode: string;
  timestamp: number;
  reason: string;
  isRead?: boolean;
}

export interface EmployeeLoginLog {
  id: string;
  adminId: string;
  adminName: string;
  roleTitle: string;
  isSupervisor: boolean;
  timestamp: number;
  isReadBySupervisor?: boolean;
}`,
    },
    {
      id: 'realtimeSync',
      name: 'realtimeSync.ts',
      path: '/src/utils/realtimeSync.ts',
      description: 'نظام المزامنة اللحظية WebSocket مع ميزة BroadcastChannel للمتصفح وإعادة الاتصال التلقائي',
      language: 'typescript',
      content: `import {
  ShoeItem,
  OrderPost,
  StockDeductionLog,
  SecurityAlert,
  EmployeeLoginLog,
} from '../types/inventory';

export interface WarehouseSyncState {
  shoes: ShoeItem[];
  deletedShoeIds?: string[];
  deductions: StockDeductionLog[];
  orders: OrderPost[];
  securityAlerts: SecurityAlert[];
  loginLogs?: EmployeeLoginLog[];
  updatedAt?: number;
}

export interface SyncUpdatePayload {
  shoes?: ShoeItem[];
  deletedShoeIds?: string[];
  deductions?: StockDeductionLog[];
  orders?: OrderPost[];
  securityAlerts?: SecurityAlert[];
  loginLogs?: EmployeeLoginLog[];
  eventType?: 'delete_piece' | 'deduct_pair' | 'employee_login' | 'sync';
  latestDeduction?: StockDeductionLog | null;
  latestLogin?: EmployeeLoginLog | null;
  senderId?: string;
}

type StateListener = (
  state: WarehouseSyncState,
  meta?: {
    eventType?: string;
    latestDeduction?: StockDeductionLog | null;
    latestLogin?: EmployeeLoginLog | null;
    senderId?: string | null;
  }
) => void;

const CLIENT_INSTANCE_ID = \`client-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;
const CHANNEL_NAME = 'iavenda_warehouse_realtime_channel';

class RealtimeSyncManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<StateListener>();
  private channel: BroadcastChannel | null = null;
  private reconnectTimer: number | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          const data = event.data;
          if (data && data.senderId !== CLIENT_INSTANCE_ID && data.state) {
            this.notifyListeners(data.state, {
              eventType: data.eventType,
              latestDeduction: data.latestDeduction,
              latestLogin: data.latestLogin,
              senderId: data.senderId,
            });
          }
        };
      } catch {
        // BroadcastChannel fallback
      }
    }
  }

  public getClientId(): string {
    return CLIENT_INSTANCE_ID;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(
    state: WarehouseSyncState,
    meta?: {
      eventType?: string;
      latestDeduction?: StockDeductionLog | null;
      latestLogin?: EmployeeLoginLog | null;
      senderId?: string | null;
    }
  ) {
    for (const listener of this.listeners) {
      listener(state, meta);
    }
  }

  public async fetchInitialState(): Promise<WarehouseSyncState | null> {
    try {
      const res = await fetch(\`/api/state?t=\${Date.now()}\`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) return null;
      const data: WarehouseSyncState = await res.json();
      return data;
    } catch {
      return null;
    }
  }

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = \`\${protocol}//\${window.location.host}/ws\`;
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if ((msg.type === 'state:init' || msg.type === 'state:updated') && msg.state) {
            if (msg.senderId && msg.senderId === CLIENT_INSTANCE_ID) {
              return;
            }
            this.notifyListeners(msg.state, {
              eventType: msg.eventType,
              latestDeduction: msg.latestDeduction,
              latestLogin: msg.latestLogin,
              senderId: msg.senderId,
            });
          }
        } catch {
          // ignore
        }
      };

      socket.onclose = () => {
        this.ws = null;
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      // fallback
    }
  }

  public async publishUpdate(payload: SyncUpdatePayload): Promise<void> {
    const enrichedPayload: SyncUpdatePayload = {
      ...payload,
      senderId: CLIENT_INSTANCE_ID,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'state:update',
            payload: enrichedPayload,
          })
        );
      } catch {
        // fallback
      }
    }

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichedPayload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.state && this.channel) {
          this.channel.postMessage({
            state: data.state,
            eventType: enrichedPayload.eventType,
            latestDeduction: enrichedPayload.latestDeduction,
            latestLogin: enrichedPayload.latestLogin,
            senderId: CLIENT_INSTANCE_ID,
          });
        }
      }
    } catch {
      // Offline fallback
    }
  }
}

export const realtimeSync = new RealtimeSyncManager();`,
    },
    {
      id: 'package',
      name: 'package.json',
      path: '/package.json',
      description: 'حزم المشروع وأوامر التشغيل (Express + React 19 + Vite + Tailwind CSS + WebSockets)',
      language: 'json',
      content: `{
  "name": "iavenda-shoe-inventory",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/ws": "^8.18.1",
    "@vitejs/plugin-react": "^6.1.1",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "recharts": "^3.10.1",
    "vite": "^8.3.0",
    "ws": "^8.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2"
  }
}`,
    },
  ];

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleCopyAllFiles = () => {
    const combined = files
      .map((f) => `// ==========================================\n// File: ${f.path}\n// ${f.description}\n// ==========================================\n\n${f.content}\n\n`)
      .join('\n');
    navigator.clipboard.writeText(combined);
    setCopiedId('all');
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-[#150d26] border border-purple-500/40 rounded-3xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-purple-900/60 bg-gradient-to-r from-[#201138] to-[#160c29] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-inner">
                <Code2 className="w-6 h-6 text-purple-300" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <span>الأكواد البرمجية للمشروع</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    جاهزة للنسخ بنقرة واحدة
                  </span>
                </h2>
                <p className="text-xs text-purple-300/80 mt-0.5">
                  يمكنك استعراض ونسخ كود أي ملف من ملفات التطبيق والخادم والمزامنة اللحظية
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAllFiles}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition shadow-lg shadow-purple-900/40 cursor-pointer active:scale-95"
              >
                {copiedId === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>تم نسخ كل الملفات!</span>
                  </>
                ) : (
                  <>
                    <FolderArchive className="w-4 h-4" />
                    <span>نسخ كل الملفات معاً</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Container */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar with files */}
            <div className="w-full md:w-72 bg-[#10091d] border-b md:border-b-0 md:border-l border-purple-900/50 p-3 space-y-2 overflow-y-auto">
              <div className="text-[11px] font-black text-purple-400/90 px-2 py-1 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                <span>ملفات المشروع الرئيسية</span>
              </div>
              {files.map((file) => {
                const isActive = file.id === activeFileId;
                return (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`w-full text-right p-3 rounded-2xl transition cursor-pointer flex flex-col gap-1 border ${
                      isActive
                        ? 'bg-purple-600/30 border-purple-500 text-white shadow-md shadow-purple-950/40'
                        : 'bg-purple-950/20 border-purple-900/40 text-purple-200/80 hover:bg-purple-900/30 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-xs font-bold">{file.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-purple-300 font-mono">
                        {file.language}
                      </span>
                    </div>
                    <span className="text-[11px] text-purple-300/70 line-clamp-1">
                      {file.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Code Content Area */}
            <div className="flex-1 flex flex-col bg-[#0b0615] overflow-hidden">
              {/* File Meta Header */}
              <div className="p-3 bg-[#130a21] border-b border-purple-900/50 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 font-mono border border-purple-800/60 font-semibold">
                    {activeFile.path}
                  </span>
                  <span className="text-purple-300/80 text-[11px] truncate hidden sm:inline">
                    {activeFile.description}
                  </span>
                </div>

                <button
                  onClick={() => handleCopy(activeFile.content, activeFile.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/50 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
                >
                  {copiedId === activeFile.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>تم نسخ الكود!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ كود هذا الملف</span>
                    </>
                  )}
                </button>
              </div>

              {/* Pre / Code Block */}
              <div className="flex-1 p-4 overflow-auto font-mono text-xs sm:text-sm text-purple-100 bg-[#07030e] leading-relaxed selection:bg-purple-600 selection:text-white">
                <pre className="whitespace-pre overflow-x-auto text-left" dir="ltr">
                  <code>{activeFile.content}</code>
                </pre>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-purple-900/60 bg-[#160c29] flex flex-wrap items-center justify-between gap-3 text-xs text-purple-300/80">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span>تشغيل المشروع محلياً: <code className="bg-black/60 px-2 py-0.5 rounded text-emerald-400 font-mono">npm install && npm run dev</code></span>
            </div>
            <span>الخادم يعمل على المنفذ 3000 مع مزامنة فورية عبر WebSockets</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
