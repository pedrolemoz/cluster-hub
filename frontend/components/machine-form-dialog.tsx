'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MachineForm } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: MachineForm;
  title: string;
  onSubmit: (data: MachineForm) => Promise<void>;
}

const DEFAULT_PORT = 8732;
const empty: MachineForm = { name: '', ip: '', secondary_ip: '', mac: '', port: DEFAULT_PORT, use_wowlan: false };

function validateAddress(addr: string): string | null {
  const trimmed = addr.trim();
  if (!trimmed) return 'Address is required';
  if (/\s/.test(trimmed)) return 'Address must not contain spaces';
  return null;
}

function validateSecondaryAddress(addr: string): string | null {
  if (!addr.trim()) return null;
  return validateAddress(addr);
}

function validateMAC(mac: string): string | null {
  const trimmed = mac.trim();
  if (/^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/.test(trimmed)) return null;
  return 'MAC must be in format AA:BB:CC:DD:EE:FF';
}

function validatePort(port: number): string | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return 'Port must be 1–65535';
  return null;
}

interface FieldErrors {
  name?: string;
  ip?: string;
  secondary_ip?: string;
  mac?: string;
  port?: string;
}

export function MachineFormDialog({ open, onOpenChange, initial, title, onSubmit }: Props) {
  const [form, setForm] = useState<MachineForm>(initial ?? empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? empty);
      setErrors({});
      setSubmitError('');
    }
  }, [open, initial]);

  const set = (k: keyof MachineForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = k === 'port' ? Number(e.target.value) : k === 'use_wowlan' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: val }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    const ipErr = validateAddress(form.ip);
    if (ipErr) errs.ip = ipErr;
    const secIpErr = validateSecondaryAddress(form.secondary_ip);
    if (secIpErr) errs.secondary_ip = secIpErr;
    const macErr = validateMAC(form.mac);
    if (macErr) errs.mac = macErr;
    const portErr = validatePort(form.port);
    if (portErr) errs.port = portErr;
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setLoading(true);
    setSubmitError('');
    try {
      await onSubmit({ ...form, ip: form.ip.trim(), mac: form.mac.trim() });
      onOpenChange(false);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfd-name">Name</Label>
            <Input
              id="mfd-name"
              placeholder="My Desktop"
              value={form.name}
              onChange={set('name')}
              className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mfd-ip">IP Address or Hostname</Label>
            <Input
              id="mfd-ip"
              placeholder="192.168.1.100 or hostname"
              value={form.ip}
              onChange={set('ip')}
              className={errors.ip ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.ip && <p className="text-xs text-destructive">{errors.ip}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mfd-secondary-ip">VPN / Secondary IP <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="mfd-secondary-ip"
              placeholder="100.x.y.z or i5-9600k"
              value={form.secondary_ip}
              onChange={set('secondary_ip')}
              className={errors.secondary_ip ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.secondary_ip && <p className="text-xs text-destructive">{errors.secondary_ip}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mfd-mac">MAC Address</Label>
            <Input
              id="mfd-mac"
              placeholder="AA:BB:CC:DD:EE:FF"
              value={form.mac}
              onChange={set('mac')}
              className={errors.mac ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.mac && <p className="text-xs text-destructive">{errors.mac}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mfd-port">Agent Port</Label>
            <Input
              id="mfd-port"
              type="number"
              min={1}
              max={65535}
              placeholder={String(DEFAULT_PORT)}
              value={form.port}
              onChange={set('port')}
              className={errors.port ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.port && <p className="text-xs text-destructive">{errors.port}</p>}
          </div>

          <div className="flex items-center gap-3 py-1">
            <input
              id="mfd-wowlan"
              type="checkbox"
              checked={form.use_wowlan}
              onChange={set('use_wowlan')}
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
            />
            <div>
              <Label htmlFor="mfd-wowlan" className="cursor-pointer">Wake on WiFi (WoWLAN)</Label>
              <p className="text-xs text-muted-foreground">Send magic packet to subnet broadcast instead of 255.255.255.255</p>
            </div>
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
