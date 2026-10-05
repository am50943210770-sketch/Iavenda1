import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ShoeItem } from '../types/inventory';

// Normalize URL (Supabase API requires .supabase.co if .supabase.com is passed)
export function normalizeSupabaseUrl(url: string): string {
  let cleaned = (url || '').trim().replace(/\/+$/, '');
  if (cleaned.includes('.supabase.com')) {
    cleaned = cleaned.replace('.supabase.com', '.supabase.co');
  }
  return cleaned;
}

export const SUPABASE_URL = normalizeSupabaseUrl(
  import.meta.env?.VITE_SUPABASE_URL || 'https://vfmaseffpvhjthxgwnbb.supabase.co'
);

export const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_LPxFPt7PsPgB-DbvSU9_3w_FYPXj7iK';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const SUPABASE_SQL_SETUP_SCRIPT = `-- ========================================================
-- كود إنشاء جدول المنتجات (products) في Supabase لمستودع Iavenda
-- الصق هذا الكود في نافذة SQL Editor في لوحة تحكم Supabase واضغط Run
-- ========================================================

-- 1. إنشاء جدول المنتجات إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT,
  price NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'د.ع',
  additional_info TEXT DEFAULT '',
  primary_image TEXT DEFAULT '',
  is_favorite BOOLEAN DEFAULT false,
  favorited_at BIGINT,
  colors JSONB DEFAULT '[]'::jsonb,
  created_at BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated_at BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- 2. تفعيل الحماية والصلاحيات للقراءة والإضافة والتعديل للجميع
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read-write for products" ON public.products;
CREATE POLICY "Allow public read-write for products"
ON public.products
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. تفعيل التحديث اللحظي (Realtime) للجدول ليظهر لجميع الموظفين فوراً
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
END $$;
`;

export interface SupabaseHealth {
  connected: boolean;
  tableExists: boolean;
  errorMessage?: string;
  latencyMs?: number;
  productCount?: number;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const start = performance.now();
  try {
    const { data, error, count } = await supabase
      .from('products')
      .select('id', { count: 'exact' })
      .limit(1);

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      // PGRST205 means table products doesn't exist yet in the database schema
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return {
          connected: true,
          tableExists: false,
          errorMessage:
            'تم الاتصال بسوبابيس بنجاح، لكن جدول products غير موجود بعد. انسخ كود SQL وشغّله في نافذة SQL Editor في سوبابيس.',
          latencyMs,
          productCount: 0,
        };
      }
      return {
        connected: false,
        tableExists: false,
        errorMessage: error.message || 'فشل الاتصال بـ Supabase',
        latencyMs,
      };
    }

    return {
      connected: true,
      tableExists: true,
      latencyMs,
      productCount: count ?? data?.length ?? 0,
    };
  } catch (err: any) {
    return {
      connected: false,
      tableExists: false,
      errorMessage: err?.message || 'خطأ غير معروف في الاتصال بـ Supabase',
    };
  }
}

export function shoeToProductRow(shoe: ShoeItem) {
  return {
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
}

export function productRowToShoe(row: any): ShoeItem | null {
  if (!row || !row.id) return null;
  return {
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
  };
}

/**
 * Fetch all products directly from Supabase
 */
export async function fetchProductsFromSupabase(): Promise<ShoeItem[] | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('is_favorite', { ascending: false })
      .order('favorited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch products error:', error.message);
      return null;
    }

    if (!Array.isArray(data)) return [];

    const shoes: ShoeItem[] = [];
    for (const row of data) {
      const shoe = productRowToShoe(row);
      if (shoe) shoes.push(shoe);
    }
    return shoes;
  } catch (err) {
    console.error('Supabase fetchProductsFromSupabase exception:', err);
    return null;
  }
}

/**
 * Insert or update a single product in Supabase
 */
export async function upsertProductToSupabase(shoe: ShoeItem): Promise<boolean> {
  try {
    const row = shoeToProductRow(shoe);
    const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase upsert error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase upsertProductToSupabase exception:', err);
    return false;
  }
}

/**
 * Delete a product by ID from Supabase
 */
export async function deleteProductFromSupabase(shoeId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('products').delete().eq('id', shoeId);
    if (error) {
      console.warn('Supabase delete error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase deleteProductFromSupabase exception:', err);
    return false;
  }
}

/**
 * Listen to real-time Postgres changes on table 'products'
 */
export function subscribeToProductsRealtime(
  onInsert: (shoe: ShoeItem) => void,
  onUpdate: (shoe: ShoeItem) => void,
  onDelete: (deletedId: string) => void
) {
  try {
    const channel = supabase
      .channel('realtime:iavenda_products')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'products' },
        (payload) => {
          const shoe = productRowToShoe(payload.new);
          if (shoe) onInsert(shoe);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const shoe = productRowToShoe(payload.new);
          if (shoe) onUpdate(shoe);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'products' },
        (payload) => {
          const deletedId = payload.old?.id;
          if (deletedId) onDelete(String(deletedId));
        }
      )
      .subscribe((status) => {
        console.log('Supabase Realtime products subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Failed to subscribe to Supabase Realtime:', err);
    return () => {};
  }
}
