'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Monitor, Wifi, WifiOff, Power, Zap, Pencil, Trash2, Clock, Signal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MachineFormDialog } from '@/components/machine-form-dialog';
import { Machine, MachineForm } from '@/lib/types';
import { deleteMachine, wakeMachine, shutdownMachine, updateMachine } from '@/lib/api';
import { fmtRelTime } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  machine: Machine;
  onRefresh: () => void;
}

export function MachineCard({ machine: m, onRefresh }: Props) {
  const [confirmShutdown, setConfirmShutdown] = useState(false);
  const [confirmWake, setConfirmWake] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doShutdown() {
    setBusy(true);
    try {
      await shutdownMachine(m.id);
      toast.success(`${m.name} is shutting down`);
      setConfirmShutdown(false);
      setTimeout(onRefresh, 1000);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to shutdown');
    } finally {
      setBusy(false);
    }
  }

  async function doWake() {
    setBusy(true);
    try {
      await wakeMachine(m.id);
      toast.success(`Wake-on-LAN sent to ${m.name}`);
      setConfirmWake(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send WOL');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await deleteMachine(m.id);
      toast.success(`${m.name} removed`);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  async function doEdit(data: MachineForm) {
    await updateMachine(m.id, data);
    toast.success('Machine updated');
    onRefresh();
  }

  return (
    <>
      <div className="glass glass-hover rounded-2xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl ${m.is_online ? 'bg-emerald-500/15' : 'bg-muted'}`}>
              <Monitor className={`h-4 w-4 ${m.is_online ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{m.name}</h3>
              <p className="text-xs text-muted-foreground">{m.ip}:{m.port}</p>
            </div>
          </div>
          <Badge variant={m.is_online ? 'online' : 'offline'}>
            {m.is_online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {m.is_online ? 'Online' : 'Offline'}
          </Badge>
        </div>

        {/* Meta */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-mono truncate" title={m.uuid}>
            {m.uuid.slice(0, 18)}…
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {fmtRelTime(m.last_seen_at)}
            {m.ping_ms != null && (
              <>
                <Signal className="h-3 w-3 ml-2" />
                {m.ping_ms}ms
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/machines?id=${m.id}`}
            className="flex-1"
            onClick={() => sessionStorage.setItem(`machine_${m.id}`, JSON.stringify(m))}
          >
            <Button size="sm" className="w-full font-medium bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600">
              View
            </Button>
          </Link>

          {m.is_online ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmShutdown(true)}
              disabled={busy}
              className="flex-1"
            >
              <Power className="h-3.5 w-3.5" />
              Shutdown
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setConfirmWake(true)}
              disabled={busy}
              className="flex-1"
            >
              <Zap className="h-3.5 w-3.5" />
              Wake
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            title="Delete"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmShutdown}
        onOpenChange={setConfirmShutdown}
        title="Shutdown PC?"
        description={`Send shutdown command to ${m.name}?`}
        confirmLabel="Shutdown"
        variant="destructive"
        onConfirm={doShutdown}
        loading={busy}
      />
      <ConfirmDialog
        open={confirmWake}
        onOpenChange={setConfirmWake}
        title="Wake PC?"
        description={`Send Wake-on-LAN packet to ${m.name}?`}
        confirmLabel="Wake"
        onConfirm={doWake}
        loading={busy}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove machine?"
        description={`Remove ${m.name} from Cluster Hub?`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={doDelete}
        loading={busy}
      />
      <MachineFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{ name: m.name, ip: m.ip, mac: m.mac, port: m.port }}
        title="Edit Machine"
        onSubmit={doEdit}
      />
    </>
  );
}
