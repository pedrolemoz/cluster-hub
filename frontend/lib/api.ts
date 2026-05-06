import { Machine, MachineForm, DailyStats } from './types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getMachines = () => req<Machine[]>('/api/machines');

export const addMachine = (data: MachineForm) =>
  req<Machine>('/api/machines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateMachine = (id: number, data: MachineForm) =>
  req<Machine>(`/api/machines/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteMachine = (id: number) =>
  fetch(`/api/machines/${id}`, { method: 'DELETE' });

export const wakeMachine = (id: number) =>
  req<{ status: string }>(`/api/machines/${id}/wake`, { method: 'POST' });

export const shutdownMachine = (id: number) =>
  req<{ status: string }>(`/api/machines/${id}/shutdown`, { method: 'POST' });

export const getMachineMetrics = (id: number) =>
  fetch(`/api/machines/${id}/metrics`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export const checkVersion = () =>
  req<{ current: string; latest: string; update_available: boolean }>('/api/version');

export const getMachineStatsHistory = (id: number, days: number) =>
  req<DailyStats[]>(`/api/machines/${id}/stats?days=${days}`);
