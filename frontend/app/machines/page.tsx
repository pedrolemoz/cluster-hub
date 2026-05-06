'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Cpu,
  MemoryStick,
  MonitorPlay,
  ChevronDown,
  ChevronUp,
  ServerCrash,
  Thermometer,
  Activity,
  WifiOff,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { getMachines, getMachineMetrics } from '@/lib/api';
import { Machine, Metrics, MetricsSchema } from '@/lib/types';
import { fmt, fmtMb } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

type ChartPoint = { i: number; v: number | null };

function MetricsSkeleton() {
  return (
    <>
      <div className="glass rounded-2xl p-5 space-y-4">
        <Skeleton className="h-5 w-16" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
      <div className="glass rounded-2xl p-5 space-y-3">
        <Skeleton className="h-5 w-12" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      <div className="glass rounded-2xl p-5 space-y-3">
        <Skeleton className="h-5 w-12" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    </>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function UsageBar({
  used,
  total,
  color = 'bg-primary',
}: {
  used: number | null | undefined;
  total: number | null | undefined;
  color?: string;
}) {
  if (!total || total === 0 || used == null) return null;
  const pct = Math.min(100, Math.round((used / total) * 100));
  return <Progress value={pct} indicatorClassName={color} className="h-2 mt-2" />;
}

function MachinePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = Number(searchParams.get('id'));

  const [machine, setMachine] = useState<Machine | null>(() => {
    if (typeof window === 'undefined') return null;
    const s = sessionStorage.getItem(`machine_${id}`);
    return s ? (JSON.parse(s) as Machine) : null;
  });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rawJson, setRawJson] = useState<unknown>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  const cpuHistRef = useRef<ChartPoint[]>([]);
  const gpuHistRef = useRef<ChartPoint[]>([]);
  const counterRef = useRef(0);
  const [cpuChart, setCpuChart] = useState<ChartPoint[]>([]);
  const [gpuChart, setGpuChart] = useState<ChartPoint[]>([]);

  const fetchMachine = useCallback(async () => {
    try {
      const all = await getMachines();
      const found = all.find((m) => m.id === id);
      if (found) setMachine(found);
    } catch {}
  }, [id]);

  const fetchMetrics = useCallback(async () => {
    try {
      const raw = await getMachineMetrics(id);
      setRawJson(raw);
      setOffline(false);
      const result = MetricsSchema.safeParse(raw);
      if (!result.success) {
        toast.error('Invalid metrics payload');
        return;
      }
      const m = result.data;
      setMetrics(m);

      const i = counterRef.current++;
      const cpuPoint: ChartPoint = { i, v: m.cpu?.usage_percentage ?? null };
      const gpuPoint: ChartPoint = { i, v: m.gpu?.usage_percentage ?? null };

      cpuHistRef.current = [...cpuHistRef.current.slice(-59), cpuPoint];
      gpuHistRef.current = [...gpuHistRef.current.slice(-59), gpuPoint];
      setCpuChart([...cpuHistRef.current]);
      setGpuChart([...gpuHistRef.current]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('503') || msg.includes('offline')) {
        setOffline(true);
        setMetrics(null);
        setRawJson(null);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchMachine();
    fetchMetrics();
    const machineIv = setInterval(fetchMachine, 10000);
    const metricsIv = setInterval(fetchMetrics, 2000);
    return () => {
      clearInterval(machineIv);
      clearInterval(metricsIv);
    };
  }, [fetchMachine, fetchMetrics]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-primary/20 shrink-0">
              <ServerCrash className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-base sm:text-lg truncate">
              {machine?.name ?? 'Loading…'}
            </span>
          </div>
          {machine && (
            <Badge variant={machine.is_online ? 'online' : 'offline'} className="shrink-0">
              {machine.is_online ? 'Online' : 'Offline'}
            </Badge>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 pb-safe space-y-4">
        {offline ? (
          <div className="glass rounded-2xl p-16 flex flex-col items-center gap-4 text-muted-foreground">
            <WifiOff className="h-12 w-12 opacity-40" />
            <p className="text-lg font-medium">Machine is offline</p>
            <p className="text-sm">Metrics unavailable until the machine comes back online</p>
          </div>
        ) : metrics === null ? <MetricsSkeleton /> : (<>

        {/* CPU Card */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            CPU
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Usage</p>
              <p className="text-2xl font-bold">{fmt(metrics?.cpu?.usage_percentage, '%')}</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Thermometer className="h-3 w-3" /> Temp
              </p>
              <p className="text-2xl font-bold">{fmt(metrics?.cpu?.temperature_in_celsius, '°')}</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Cores</p>
              <p className="text-2xl font-bold">{fmt(metrics?.cpu?.cores)}</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Threads</p>
              <p className="text-2xl font-bold">{fmt(metrics?.cpu?.threads)}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {metrics?.cpu?.name ?? 'Unknown CPU'}
          </p>

          {/* Chart */}
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="i" hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: unknown) => (v == null ? '--' : `${Number(v)}%`)}
                  labelFormatter={() => ''}
                  contentStyle={{
                    background: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="hsl(221 83% 60%)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RAM Card */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <MemoryStick className="h-4 w-4 text-purple-400" />
            RAM
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatRow label="Total" value={fmtMb(metrics?.ram?.total_in_mb)} />
            <StatRow label="Used" value={fmtMb(metrics?.ram?.in_use_in_mb)} />
            <StatRow label="Free" value={fmtMb(metrics?.ram?.free_in_mb)} />
          </div>
          <UsageBar
            used={metrics?.ram?.in_use_in_mb}
            total={metrics?.ram?.total_in_mb}
            color="bg-purple-500"
          />
          {metrics?.ram?.total_in_mb && metrics.ram.in_use_in_mb != null && (
            <p className="text-xs text-muted-foreground text-right">
              {Math.round((metrics.ram.in_use_in_mb / metrics.ram.total_in_mb) * 100)}% used
            </p>
          )}
        </div>

        {/* GPU Card */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <MonitorPlay className="h-4 w-4 text-amber-400" />
            GPU
          </div>
          {metrics?.gpu == null ? (
            <p className="text-muted-foreground text-sm">GPU metrics unavailable</p>
          ) : metrics.gpu.present === false ? (
            <p className="text-muted-foreground text-sm">No GPU detected</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{metrics.gpu.name ?? 'Unknown GPU'}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3" /> Usage
                  </p>
                  <p className="text-2xl font-bold">{fmt(metrics.gpu.usage_percentage, '%')}</p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <Thermometer className="h-3 w-3" /> Temp
                  </p>
                  <p className="text-2xl font-bold">
                    {fmt(metrics.gpu.temperature_in_celsius, '°')}
                  </p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">VRAM Used</p>
                  <p className="text-xl font-bold">{fmtMb(metrics.gpu.vram?.in_use_in_mb)}</p>
                </div>
                <div className="glass rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">VRAM Total</p>
                  <p className="text-xl font-bold">{fmtMb(metrics.gpu.vram?.total_in_mb)}</p>
                </div>
              </div>
              <UsageBar
                used={metrics.gpu.vram?.in_use_in_mb}
                total={metrics.gpu.vram?.total_in_mb}
                color="bg-amber-500"
              />

              {/* GPU chart */}
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gpuChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="i" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: unknown) => (v == null ? '--' : `${Number(v)}%`)}
                      labelFormatter={() => ''}
                      contentStyle={{
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke="hsl(38 92% 50%)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* Raw JSON */}
        {rawJson && (
          <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between glass rounded-2xl px-5 py-3 h-auto">
                <span className="text-sm font-medium">Raw JSON</span>
                {rawOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="glass rounded-2xl mt-1 p-4 overflow-auto max-h-96">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                  {JSON.stringify(rawJson, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        </>)}
      </main>
    </div>
  );
}

export default function MachinePageWrapper() {
  return (
    <Suspense>
      <MachinePage />
    </Suspense>
  );
}
