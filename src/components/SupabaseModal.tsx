import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Zap,
  Server,
  Code2,
} from 'lucide-react';
import {
  checkSupabaseHealth,
  SupabaseHealth,
  SUPABASE_SQL_SETUP_SCRIPT,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  fetchProductsFromSupabase,
} from '../utils/supabaseClient';
import { ShoeItem } from '../types/inventory';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shoesCount: number;
  onSyncProductsFromSupabase?: (shoes: ShoeItem[]) => void;
}

export const SupabaseModal: React.FC<Props> = ({
  isOpen,
  onClose,
  shoesCount,
  onSyncProductsFromSupabase,
}) => {
  const [health, setHealth] = useState<SupabaseHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const testConnection = async () => {
    setIsLoading(true);
    setSyncMessage(null);
    try {
      const res = await checkSupabaseHealth();
      setHealth(res);
    } catch {
      setHealth({
        connected: false,
        tableExists: false,
        errorMessage: 'تعذر الاتصال بـ Supabase، يرجى فحص الشبكة',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      testConnection();
    }
  }, [isOpen]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const supabaseShoes = await fetchProductsFromSupabase();
      if (supabaseShoes) {
        if (onSyncProductsFromSupabase) {
          onSyncProductsFromSupabase(supabaseShoes);
        }
        setSyncMessage(`تم جلب ومزامنة ${supabaseShoes.length} منتج بنجاح من جدول products في سوبابيس!`);
        testConnection();
      } else {
        setSyncMessage('تعذر جلب البيانات. تأكد من تشغيل كود SQL لإنشاء جدول products أولاً.');
      }
    } catch (err: any) {
      setSyncMessage('حدث خطأ أثناء المزامنة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#140b25] border border-emerald-500/40 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-purple-900/60 bg-gradient-to-r from-[#1c0f33] via-[#150d26] to-[#0c1a17] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <span>ربط قاعدة بيانات Supabase الحية</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    جدول products
                  </span>
                </h2>
                <p className="text-xs text-purple-300/80 mt-0.5">
                  حفظ المنتجات والمقاسات والألوان ومزامنتها لحظياً لجميع الموظفين عبر سوبابيس
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs sm:text-sm">
            {/* Status Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1a1030] to-[#0e1622] border border-purple-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isLoading ? (
                    <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                  ) : health?.connected && health?.tableExists ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : health?.connected ? (
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-rose-500" />
                  )}
                </div>
                <div>
                  <div className="font-black text-white flex items-center gap-2">
                    <span>حالة الاتصال بـ Supabase:</span>
                    {isLoading ? (
                      <span className="text-purple-300">جارٍ فحص الاتصال...</span>
                    ) : health?.connected && health?.tableExists ? (
                      <span className="text-emerald-400 font-bold">متصل وجدول products جاهز بنجاح! ✅</span>
                    ) : health?.connected ? (
                      <span className="text-amber-300 font-bold">متصل، ويتبقى تشغيل كود SQL لإنشاء الجدول ⚠️</span>
                    ) : (
                      <span className="text-rose-400 font-bold">غير متصل ❌</span>
                    )}
                  </div>
                  <p className="text-xs text-purple-300/80 mt-1">
                    {health?.errorMessage ||
                      (health?.tableExists
                        ? `الجدول جاهز ويحتوي حالياً على ${health.productCount ?? 0} منتج في Supabase.`
                        : 'تم التحقق من رابط ومفتاح سوبابيس بنجاح، يُرجى تشغيل كود SQL أدناه لإنشاء الجدول.')}
                  </p>
                  {health?.latencyMs && (
                    <div className="text-[11px] text-emerald-300/80 mt-1">
                      سرعة الاستجابة (Latency): {health.latencyMs}ms
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={testConnection}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 hover:text-white border border-purple-700/60 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>إعادة فحص الاتصال</span>
                </button>

                <button
                  onClick={handleManualSync}
                  disabled={isSyncing || isLoading}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isSyncing ? 'جارٍ المزامنة...' : 'مزامنة المنتجات الآن'}</span>
                </button>
              </div>
            </div>

            {syncMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-xs">
                {syncMessage}
              </div>
            )}

            {/* Connection Credentials Info */}
            <div className="p-4 rounded-2xl bg-[#0e071c] border border-purple-900/50 space-y-3">
              <div className="text-xs font-bold text-purple-300 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>بيانات الاتصال المربوطة حالياً في النظام:</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-purple-900/40 font-mono text-xs">
                  <span className="text-purple-400 shrink-0">Supabase URL:</span>
                  <span className="text-slate-200 truncate ltr text-left" dir="ltr">{SUPABASE_URL}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(SUPABASE_URL);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    className="p-1 rounded hover:bg-purple-900/40 text-purple-300"
                    title="نسخ"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-purple-900/40 font-mono text-xs">
                  <span className="text-purple-400 shrink-0">Anon/Publishable Key:</span>
                  <span className="text-slate-200 truncate ltr text-left" dir="ltr">{SUPABASE_ANON_KEY}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(SUPABASE_ANON_KEY);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1 rounded hover:bg-purple-900/40 text-purple-300"
                    title="نسخ"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* SQL Setup Instruction & Code Box */}
            <div className="p-4 rounded-2xl bg-[#0b0517] border border-amber-500/40 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Code2 className="w-4 h-4 text-amber-400" />
                  <span>كود إنشاء جدول المنتجات (SQL Schema) في سوبابيس:</span>
                </div>
                <button
                  onClick={handleCopySql}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم نسخ كود SQL بنجاح!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ كود الـ SQL بنقرة واحدة</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-purple-300/80">
                إذا لم تكن قد أنشأت الجدول بعد في لوحة تحكم Supabase، ادخل على مشروعك في سوبابيس ⬅ افتح <strong>SQL Editor</strong> ⬅ الصق الكود أدناه واضغط <strong>Run</strong>.
              </p>

              <div className="p-3 rounded-xl bg-[#05020a] border border-purple-950 font-mono text-xs text-emerald-300 overflow-x-auto max-h-56 leading-relaxed" dir="ltr">
                <pre>{SUPABASE_SQL_SETUP_SCRIPT}</pre>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3.5 border-t border-purple-900/60 bg-[#150d26] flex items-center justify-between gap-3 text-xs text-purple-300">
            <span>المنتجات الحالية في النظام: {shoesCount} موديل حذاء</span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-white font-bold transition cursor-pointer"
            >
              إغلاق النافذة
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
