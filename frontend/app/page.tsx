'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Moon, Sun, Zap, Power, ServerCrash, Download, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MachineCard } from '@/components/machine-card';
import { MachineFormDialog } from '@/components/machine-form-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getMachines, addMachine, wakeMachine, shutdownMachine } from '@/lib/api';
import { Machine, MachineForm } from '@/lib/types';
import { toast } from 'sonner';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

export default function HomePage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [wakeAllConfirm, setWakeAllConfirm] = useState(false);
  const [shutdownAllConfirm, setShutdownAllConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const fetchMachines = useCallback(async () => {
    try {
      const data = await getMachines();
      setMachines(data);
    } catch {
      // silent on background polls
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
    const iv = setInterval(fetchMachines, 5000);
    return () => clearInterval(iv);
  }, [fetchMachines]);

  const filtered = machines.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.ip.includes(search)
  );

  const offlineMachines = machines.filter((m) => !m.is_online);
  const onlineMachines = machines.filter((m) => m.is_online);

  async function doWakeAll() {
    setBulkBusy(true);
    let ok = 0;
    for (const m of offlineMachines) {
      try {
        await wakeMachine(m.id);
        ok++;
      } catch {}
    }
    toast.success(`Wake-on-LAN sent to ${ok} machine(s)`);
    setWakeAllConfirm(false);
    setBulkBusy(false);
  }

  function exportMachines() {
    const data: MachineForm[] = machines.map(({ name, ip, mac, port, use_wowlan }) => ({ name, ip, mac, port, use_wowlan }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cluster-hub-machines.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importMachines(file: File) {
    let entries: unknown;
    try {
      entries = JSON.parse(await file.text());
    } catch {
      toast.error('Invalid JSON file');
      return;
    }
    if (!Array.isArray(entries)) {
      toast.error('Expected a JSON array');
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const entry of entries) {
      if (
        typeof entry !== 'object' || entry === null ||
        typeof (entry as MachineForm).name !== 'string' ||
        typeof (entry as MachineForm).ip !== 'string' ||
        typeof (entry as MachineForm).mac !== 'string' ||
        typeof (entry as MachineForm).port !== 'number'
      ) {
        fail++;
        continue;
      }
      try {
        await addMachine(entry as MachineForm);
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok > 0) toast.success(`Imported ${ok} machine(s)`);
    if (fail > 0) toast.error(`${fail} entr${fail === 1 ? 'y' : 'ies'} failed`);
    if (ok > 0) fetchMachines();
    if (importRef.current) importRef.current.value = '';
  }

  async function doShutdownAll() {
    setBulkBusy(true);
    let ok = 0;
    for (const m of onlineMachines) {
      try {
        await shutdownMachine(m.id);
        ok++;
      } catch {}
    }
    toast.success(`Shutdown sent to ${ok} machine(s)`);
    setShutdownAllConfirm(false);
    setBulkBusy(false);
    setTimeout(fetchMachines, 2000);
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <ServerCrash className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">Cluster Hub</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importMachines(f); }}
            />
            <Button variant="outline" size="sm" onClick={exportMachines} disabled={machines.length === 0} title="Export machines as JSON">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} title="Import machines from JSON">
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add PC
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">
              {onlineMachines.length} online · {offlineMachines.length} offline
            </span>
            {offlineMachines.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setWakeAllConfirm(true)}>
                <Zap className="h-3.5 w-3.5" />
                Wake All
              </Button>
            )}
            {onlineMachines.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShutdownAllConfirm(true)}>
                <Power className="h-3.5 w-3.5" />
                Shutdown All
              </Button>
            )}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <ServerCrash className="h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">
              {search ? 'No machines match your search' : 'No machines yet'}
            </p>
            {!search && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first PC
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4">
            {filtered.map((m) => (
              <MachineCard key={m.id} machine={m} onRefresh={fetchMachines} />
            ))}
          </div>
        )}
      </main>

      {/* Dialogs */}
      <MachineFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Machine"
        onSubmit={async (data) => {
          await addMachine(data);
          toast.success('Machine added');
          fetchMachines();
        }}
      />
      <ConfirmDialog
        open={wakeAllConfirm}
        onOpenChange={setWakeAllConfirm}
        title="Wake all offline PCs?"
        description={`Send Wake-on-LAN to ${offlineMachines.length} offline machine(s)?`}
        confirmLabel="Wake All"
        onConfirm={doWakeAll}
        loading={bulkBusy}
      />
      <ConfirmDialog
        open={shutdownAllConfirm}
        onOpenChange={setShutdownAllConfirm}
        title="Shutdown all online PCs?"
        description={`Send shutdown to ${onlineMachines.length} online machine(s)?`}
        confirmLabel="Shutdown All"
        variant="destructive"
        onConfirm={doShutdownAll}
        loading={bulkBusy}
      />
    </div>
  );
}
