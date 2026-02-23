'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  Heart,
  Moon,
  Zap,
  Activity,
  Upload,
  Users,
  Filter,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface WhoopRecord {
  Date: string;
  'First Name': string;
  'Last Name': string;
  player: string;
  Recovery?: number;
  HRV?: number;
  Strain?: number;
  'Sleep Performance'?: number;
  RHR?: number;
  [key: string]: string | number | undefined;
}

interface StatSummary {
  avg: number;
  max: number;
  min: number;
  count: number;
}

interface PlayerStats {
  player: string;
  sessions: number;
  avgRecovery: number | null;
  avgStrain: number | null;
  avgHRV: number | null;
  avgSleep: number | null;
  // HRV dots: last 5 days compared to prior week avg
  hrvDots: Array<'up' | 'same' | 'down' | 'none'>;
}

interface TrendPoint {
  date: string;
  Recovery: number | null;
  Strain: number | null;
  HRV: number | null;
}

const METRICS = ['Recovery', 'Strain', 'HRV', 'Sleep Performance'] as const;
type Metric = (typeof METRICS)[number];

// ── Helpers ────────────────────────────────────────────────────────────────
const metricIcon = (metric: Metric) => {
  switch (metric) {
    case 'Recovery': return Heart;
    case 'Strain': return Zap;
    case 'HRV': return Activity;
    case 'Sleep Performance': return Moon;
  }
};

const metricUnit = (metric: Metric) => {
  if (metric === 'Recovery' || metric === 'Sleep Performance') return '%';
  if (metric === 'HRV') return 'ms';
  return '';
};

/** Recovery color: green ≥67, yellow 30–66, red ≤29 */
function recoveryColor(val: number | null): { bg: string; text: string; border: string } {
  if (val === null) return { bg: 'bg-gray-100', text: 'text-gray-400', border: 'border-gray-300' };
  if (val >= 67) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-400' };
  if (val >= 30) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-400' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-400' };
}

/** Sleep color: same thresholds as recovery */
function sleepColor(val: number | null): { bg: string; text: string } {
  if (val === null) return { bg: 'bg-gray-100', text: 'text-gray-400' };
  if (val >= 67) return { bg: 'bg-green-50', text: 'text-green-700' };
  if (val >= 30) return { bg: 'bg-yellow-50', text: 'text-yellow-700' };
  return { bg: 'bg-red-50', text: 'text-red-700' };
}

/** HRV dot color */
function dotColor(dir: 'up' | 'same' | 'down' | 'none'): string {
  if (dir === 'up') return 'bg-green-500';
  if (dir === 'same') return 'bg-yellow-400';
  if (dir === 'down') return 'bg-red-500';
  return 'bg-gray-300';
}

/** Card left-border color based on recovery */
function cardBorder(val: number | null): string {
  if (val === null) return 'border-gray-300';
  if (val >= 67) return 'border-green-500';
  if (val >= 30) return 'border-yellow-400';
  return 'border-red-500';
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function WhoopDashboard() {
  const [currentPage, setCurrentPage] = useState<'upload' | 'dashboard'>('upload');
  const [whoopData, setWhoopData] = useState<WhoopRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'players'>('overview');
  const [reportRange, setReportRange] = useState<'7' | '14'>('7');
  const [selectedPlayer, setSelectedPlayer] = useState('All');
  const [timeRange, setTimeRange] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // per-card toggle: 'recovery' | 'hrv'
  const [cardView, setCardView] = useState<Record<string, 'recovery' | 'hrv'>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV Upload ─────────────────────────────────────────────────────────
  const handleWhoopFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) { alert('File must have header and data rows'); return; }

      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') { inQuotes = !inQuotes; }
          else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += line[i]; }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]);
      const processedData: WhoopRecord[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= headers.length * 0.5) {
          const record: WhoopRecord = { Date: '', 'First Name': '', 'Last Name': '', player: '' };
          headers.forEach((header, index) => {
            const value = values[index] || '';
            if (header === 'Date' || header === 'First Name' || header === 'Last Name') {
              record[header] = value;
            } else if (!isNaN(Number(value)) && value !== '') {
              record[header] = parseFloat(value);
            } else {
              record[header] = value;
            }
          });
          const firstName = ((record['First Name'] as string) || '').trim();
          const lastName = ((record['Last Name'] as string) || '').trim();
          record.player = (firstName + ' ' + lastName).trim();
          if (record.player && record.Date) processedData.push(record);
        }
      }

      if (processedData.length === 0) { alert('No valid data found'); return; }
      setWhoopData(processedData.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()));
      setCurrentPage('dashboard');
    } catch (error) {
      alert('Upload error: ' + (error as Error).message);
    }
  }, []);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleWhoopFileUpload(file);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleWhoopFileUpload(file);
  }, [handleWhoopFileUpload]);

  // ── Derived data ───────────────────────────────────────────────────────
  const players = useMemo(() => [...new Set(whoopData.map((d) => d.player))].sort(), [whoopData]);

  const filteredWhoopData = useMemo(() => {
    let filtered = whoopData;
    if (selectedPlayer !== 'All') filtered = filtered.filter((d) => d.player === selectedPlayer);
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter((d) => new Date(d.Date) >= cutoff);
    }
    return filtered;
  }, [whoopData, selectedPlayer, timeRange]);

  const summaryStats = useMemo(() => {
    const stats: Partial<Record<string, StatSummary>> = {};
    [...METRICS, 'RHR'].forEach((metric) => {
      const values = filteredWhoopData
        .map((d) => d[metric])
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(Number(v)) && v !== '');
      if (values.length > 0) {
        stats[metric] = {
          avg: values.reduce((s, v) => s + v, 0) / values.length,
          max: Math.max(...values),
          min: Math.min(...values),
          count: values.length,
        };
      }
    });
    return stats;
  }, [filteredWhoopData]);

  const trendData = useMemo((): TrendPoint[] => {
    const dateMap: Record<string, { date: string; Recovery: number[]; Strain: number[]; HRV: number[] }> = {};
    filteredWhoopData.forEach((record) => {
      const date = record.Date;
      if (!dateMap[date]) dateMap[date] = { date, Recovery: [], Strain: [], HRV: [] };
      if (record.Recovery) dateMap[date].Recovery.push(record.Recovery);
      if (record.Strain) dateMap[date].Strain.push(record.Strain);
      if (record.HRV) dateMap[date].HRV.push(record.HRV);
    });
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    return Object.values(dateMap)
      .map((day) => ({ date: day.date, Recovery: avg(day.Recovery), Strain: avg(day.Strain), HRV: avg(day.HRV) }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredWhoopData]);

  /** Compute HRV trend dots for a player.
   *  For each of the last 5 days with HRV data, compare that day's HRV
   *  to the player's average HRV from the 7 days before that day.
   *  up = >2ms above prior-week avg, down = >2ms below, same = within 2ms.
   */
  const computeHrvDots = useCallback(
    (playerRecords: WhoopRecord[]): Array<'up' | 'same' | 'down' | 'none'> => {
      const withHRV = playerRecords
        .filter((r) => r.HRV !== undefined && !isNaN(Number(r.HRV)))
        .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

      if (withHRV.length === 0) return Array(5).fill('none');

      const last5 = withHRV.slice(-5);
      // pad to 5 if fewer
      while (last5.length < 5) last5.unshift(undefined as unknown as WhoopRecord);

      return last5.map((rec) => {
        if (!rec) return 'none';
        const recDate = new Date(rec.Date).getTime();
        const priorWeek = withHRV.filter((r) => {
          const t = new Date(r.Date).getTime();
          return t < recDate && t >= recDate - 7 * 86400000;
        });
        if (priorWeek.length === 0) return 'none';
        const priorAvg = priorWeek.reduce((s, r) => s + (r.HRV as number), 0) / priorWeek.length;
        const diff = (rec.HRV as number) - priorAvg;
        if (diff > 2) return 'up';
        if (diff < -2) return 'down';
        return 'same';
      });
    },
    []
  );

  /** Player stats filtered to a given day window (for reports) */
  const buildPlayerStats = useCallback(
    (source: WhoopRecord[]): PlayerStats[] => {
      const map: Record<string, {
        player: string; sessions: number;
        Recovery: number[]; Strain: number[]; HRV: number[]; Sleep: number[];
        allRecords: WhoopRecord[];
      }> = {};

      source.forEach((record) => {
        if (!map[record.player]) {
          map[record.player] = { player: record.player, sessions: 0, Recovery: [], Strain: [], HRV: [], Sleep: [], allRecords: [] };
        }
        map[record.player].sessions++;
        map[record.player].allRecords.push(record);
        if (record.Recovery) map[record.player].Recovery.push(record.Recovery);
        if (record.Strain) map[record.player].Strain.push(record.Strain);
        if (record.HRV) map[record.player].HRV.push(record.HRV);
        if (record['Sleep Performance']) map[record.player].Sleep.push(record['Sleep Performance']);
      });

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

      return Object.values(map)
        .map((p) => ({
          player: p.player,
          sessions: p.sessions,
          avgRecovery: avg(p.Recovery),
          avgStrain: avg(p.Strain),
          avgHRV: avg(p.HRV),
          avgSleep: avg(p.Sleep),
          hrvDots: computeHrvDots(p.allRecords),
        }))
        .sort((a, b) => (b.avgRecovery ?? 0) - (a.avgRecovery ?? 0));
    },
    [computeHrvDots]
  );

  const playerComparison = useMemo(() => buildPlayerStats(filteredWhoopData), [filteredWhoopData, buildPlayerStats]);

  /** Report data: slice whoopData to last N days (ignores selectedPlayer/timeRange filters) */
  const reportData = useMemo(() => {
    const days = parseInt(reportRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const sliced = whoopData.filter((d) => new Date(d.Date) >= cutoff);
    return buildPlayerStats(sliced);
  }, [whoopData, reportRange, buildPlayerStats]);

  // ── Player card helper ─────────────────────────────────────────────────
  const toggleCardView = (player: string) => {
    setCardView((prev) => ({ ...prev, [player]: prev[player] === 'hrv' ? 'recovery' : 'hrv' }));
  };

  const PlayerCard = ({ p }: { p: PlayerStats }) => {
    const view = cardView[p.player] ?? 'recovery';
    const rc = recoveryColor(p.avgRecovery);
    const sc = sleepColor(p.avgSleep);
    const border = cardBorder(p.avgRecovery);

    return (
      <div className={`bg-white rounded-xl shadow-sm border-l-4 ${border} p-5`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-800 truncate pr-2">{p.player}</h4>
          <div className="flex items-center gap-2 shrink-0">
            {/* HRV dots */}
            <div className="flex gap-1">
              {p.hrvDots.map((dir, i) => (
                <span
                  key={i}
                  title={dir === 'none' ? 'No data' : dir}
                  className={`w-2.5 h-2.5 rounded-full ${dotColor(dir)}`}
                />
              ))}
            </div>
            {/* Toggle button */}
            <button
              onClick={() => toggleCardView(p.player)}
              className="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {view === 'recovery' ? 'HRV' : 'Recovery'}
            </button>
          </div>
        </div>

        {view === 'recovery' ? (
          <>
            {/* Recovery score */}
            <div className={`${rc.bg} rounded-lg px-3 py-2 mb-3`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Recovery</span>
                <span className={`text-xl font-bold ${rc.text}`}>
                  {p.avgRecovery !== null ? p.avgRecovery.toFixed(0) + '%' : '--'}
                </span>
              </div>
            </div>
            {/* Sleep score */}
            <div className={`${sc.bg} rounded-lg px-3 py-2 mb-3`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Sleep</span>
                <span className={`text-xl font-bold ${sc.text}`}>
                  {p.avgSleep !== null ? p.avgSleep.toFixed(0) + '%' : '--'}
                </span>
              </div>
            </div>
            {/* Strain + sessions */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-xs text-gray-500">Strain</p>
                <p className="text-sm font-bold text-amber-600">
                  {p.avgStrain !== null ? p.avgStrain.toFixed(1) : '--'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-xs text-gray-500">Sessions</p>
                <p className="text-sm font-bold text-gray-700">{p.sessions}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* HRV summary view */}
            <div className="bg-blue-50 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Avg HRV</span>
                <span className="text-xl font-bold text-blue-700">
                  {p.avgHRV !== null ? p.avgHRV.toFixed(0) + ' ms' : '--'}
                </span>
              </div>
            </div>
            <div className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-1">Last 5 Days Trend</p>
              <div className="flex items-center gap-2">
                {p.hrvDots.map((dir, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className={`w-4 h-4 rounded-full ${dotColor(dir)}`} />
                    <span className="text-xs text-gray-400">D{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center mt-3">
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-xs text-gray-500">Recovery</p>
                <p className={`text-sm font-bold ${rc.text}`}>
                  {p.avgRecovery !== null ? p.avgRecovery.toFixed(0) + '%' : '--'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-xs text-gray-500">Sessions</p>
                <p className="text-sm font-bold text-gray-700">{p.sessions}</p>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Upload page ────────────────────────────────────────────────────────
  if (currentPage === 'upload') {
    return (
      <div className="w-full min-h-screen bg-gray-950 flex flex-col">
        <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Activity className="w-7 h-7 text-green-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Team Recovery Dashboard</h1>
              <p className="text-sm text-gray-500">Whoop Performance Analytics</p>
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all',
                isDragging ? 'border-green-400 bg-green-950 scale-105' : 'border-gray-700 bg-gray-900 hover:border-gray-500',
              ].join(' ')}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-green-400' : 'text-gray-500'}`} />
              <h3 className="text-lg font-semibold text-white mb-2">Upload Whoop CSV</h3>
              <p className="text-sm text-gray-400 mb-4">Drag and drop or click to browse</p>
              <span className="inline-block px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg">Select File</span>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
            </div>
            {whoopData.length > 0 && (
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="mt-6 w-full py-3 bg-gray-800 text-white font-medium rounded-xl border border-gray-700 hover:bg-gray-700 transition-colors"
              >
                Continue ({players.length} athletes)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard page ─────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-green-400" />
            <h1 className="text-lg font-bold">Team Recovery Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{filteredWhoopData.length} records</span>
            <button
              onClick={() => setCurrentPage('upload')}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700 transition-colors"
            >
              <Upload size={14} className="inline mr-1" />Update
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── Tab bar ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex border-b border-gray-200">
            {([
              { id: 'overview', label: 'Overview', icon: Heart },
              { id: 'trends',   label: 'Trends',   icon: TrendingUp },
              { id: 'players',  label: 'Players',  icon: Users },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-6 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <tab.icon size={16} />{tab.label}
              </button>
            ))}
          </div>

          {/* Filters (overview / trends / players all) */}
          <div className="p-4 bg-gray-50">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Filter size={14} />{showFilters ? 'Hide' : 'Show'} Filters
            </button>
            {showFilters && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Athlete</label>
                  <select value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="All">All Athletes</option>
                    {players.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Time Range</label>
                  <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="all">All Time</option>
                    <option value="7">Last 7 Days</option>
                    <option value="14">Last 14 Days</option>
                    <option value="30">Last 30 Days</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {METRICS.map((metric) => {
                const stat = summaryStats[metric];
                const Icon = metricIcon(metric);
                const unit = metricUnit(metric);
                if (!stat) return (
                  <div key={metric} className="bg-white rounded-xl shadow-sm p-5 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={18} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">{metric}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-300">--</p>
                  </div>
                );
                return (
                  <div key={metric} className="bg-white rounded-xl shadow-sm p-5 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={18} className="text-blue-500" />
                      <span className="text-xs font-medium text-gray-500">{metric}</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-800">
                      {Math.round(stat.avg)}
                      <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{stat.min.toFixed(0)}–{stat.max.toFixed(0)}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Trends</h3>
              {trendData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData.slice(-14)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Recovery" stroke="#22c55e" strokeWidth={2.5} name="Recovery %" dot={false} />
                      <Line type="monotone" dataKey="Strain" stroke="#f59e0b" strokeWidth={2.5} name="Strain" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-gray-400">No data available</div>
              )}
            </div>
          </div>
        )}

        {/* ── Trends Tab ── */}
        {activeTab === 'trends' && (
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Metric Trends</h2>
            {trendData.length > 0 ? (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Recovery" stroke="#22c55e" strokeWidth={2} name="Recovery %" dot={false} />
                    <Line type="monotone" dataKey="Strain" stroke="#f59e0b" strokeWidth={2} name="Strain" dot={false} />
                    <Line type="monotone" dataKey="HRV" stroke="#3b82f6" strokeWidth={2} name="HRV" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">No data</div>
            )}
          </div>
        )}

        {/* ── Players Tab ── */}
        {activeTab === 'players' && (
          <div className="space-y-6">

            {/* Report selector + legend */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                {(['7', '14'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setReportRange(r)}
                    className={[
                      'px-4 py-1.5 rounded-md text-sm font-semibold transition-colors',
                      reportRange === r ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {r}-Day Report
                  </button>
                ))}
              </div>
              {/* Color legend */}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />≥67%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />30–66%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />≤29%</span>
              </div>
            </div>

            {/* Bar chart using report-range data */}
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Athlete Comparison</h2>
              <p className="text-xs text-gray-400 mb-4">Last {reportRange} days</p>
              {reportData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="player" type="category" width={95} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avgRecovery" fill="#22c55e" name="Recovery %" />
                      <Bar dataKey="avgStrain" fill="#f59e0b" name="Strain" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-400">No data for last {reportRange} days</div>
              )}
            </div>

            {/* Player cards using report-range data */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Individual Cards — Last {reportRange} Days
                </h3>
                <p className="text-xs text-gray-400">Dots = HRV trend (last 5 days vs prior week)</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportData.map((p) => <PlayerCard key={p.player} p={p} />)}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
