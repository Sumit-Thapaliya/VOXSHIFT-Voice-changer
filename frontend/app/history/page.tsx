'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Download,
  Trash2,
  AudioLines,
  Upload,
  Mic,
  Settings,
  Clock,
  Sparkles,
  MoreHorizontal,
  Play,
  Eye,
  History as HistoryIcon,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from '@/components/providers';
import { PageHeading, SessionNotice } from '@/components/page-heading';
import {
  Button,
  Panel,
  Badge,
  SearchInput,
  Dropdown,
  DropdownItem,
  Modal,
  EmptyState,
} from '@/components/ui';
import { cn, downloadFile, formatTime } from '@/lib/utils';
import { type HistoryEntry, getEffect } from '@/lib/data';
const filters = [
  { id: 'all', label: 'All activity' },
  { id: 'conversion', label: 'Conversions' },
  { id: 'upload', label: 'Uploads' },
  { id: 'export', label: 'Exports' },
  { id: 'voice', label: 'Voice designs' },
  { id: 'polish', label: 'Polish passes' },
];
const activityIcons = {
  conversion: AudioLines,
  upload: Upload,
  export: Download,
  voice: Mic,
  settings: Settings,
  polish: Sparkles,
  analysis: Activity,
};
export default function HistoryPage() {
  const { history, clearHistory, creations, output, playTrack, setSelectedEffect, hydrated } =
    useStudio();
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('All time');
  const [clearOpen, setClearOpen] = useState(false);
  const [details, setDetails] = useState<HistoryEntry | null>(null);
  const filtered = useMemo(
    () =>
      history.filter(
        (entry) =>
          (filter === 'all' || entry.type === filter) &&
          (entry.action + ' ' + entry.detail).toLowerCase().includes(query.toLowerCase()) &&
          (range === 'All time' || range === 'Today'
            ? range === 'All time' ||
              new Date(entry.time).toDateString() === new Date().toDateString()
            : Date.now() - new Date(entry.time).getTime() < 7 * 86400000),
      ),
    [history, filter, query, range],
  );
  const grouped = useMemo(() => {
    const groups: Record<string, HistoryEntry[]> = {};
    for (const entry of filtered) {
      const date = new Date(entry.time);
      const yesterday = new Date(Date.now() - 86400000);
      const label =
        hydrated && date.toDateString() === new Date().toDateString()
          ? 'TODAY'
          : hydrated && date.toDateString() === yesterday.toDateString()
            ? 'YESTERDAY'
            : date
                .toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  timeZone: hydrated ? undefined : 'UTC',
                })
                .toUpperCase();
      (groups[label] ||= []).push(entry);
    }
    return groups;
  }, [filtered, hydrated]);
  const findCreation = (entry: HistoryEntry) =>
    creations.find((c) => c.id === entry.creationId) ||
    (output?.id === entry.creationId ? output : null);
  const exportLog = () => {
    const lines = [
      'time,action,detail,status,duration_seconds',
      ...history.map((h) =>
        [h.time, h.action, h.detail, h.status, h.duration || 0]
          .map(
            (value) =>
              '"' +
              (/^[=+\-@\t\r]/.test(String(value)) ? "'" + String(value) : String(value)).replaceAll(
                '"',
                '""',
              ) +
              '"',
          )
          .join(','),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    downloadFile(url, 'voxshift-session-history.csv');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Session activity exported');
  };
  return (
    <div className="history-page">
      <PageHeading
        eyebrow="THE SESSION TIMELINE"
        title="Every sound has a story."
        description="A little record of your experiments, transformations, and creative moments."
      >
        <Button variant="outline" onClick={exportLog} disabled={!history.length}>
          <Download size={14} />
          Export log
        </Button>
        <Dropdown
          trigger={
            <button className="button button-outline button-icon" aria-label="History options">
              <MoreHorizontal size={16} />
            </button>
          }
        >
          <DropdownItem className="danger" onSelect={() => setClearOpen(true)}>
            <Trash2 size={13} />
            Clear session history
          </DropdownItem>
        </Dropdown>
      </PageHeading>
      <SessionNotice />
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            <Activity size={14} />
            Session activities
          </span>
          <div className="stat-value">
            {String(history.length).padStart(2, '0')}
            <span>moments of creativity</span>
          </div>
          <p className="stat-description">Your studio, in motion</p>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <Sparkles size={14} />
            Voice transformations
          </span>
          <div className="stat-value">
            {String(history.filter((h) => h.type === 'conversion').length).padStart(2, '0')}
            <span>new ways to sound</span>
          </div>
          <p className="stat-description">Including clearly labeled demo tracks</p>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <Clock size={14} />
            Audio transformed
          </span>
          <div className="stat-value">
            {formatTime(
              history
                .filter((h) => h.type === 'conversion')
                .reduce((n, h) => n + (h.duration || 0), 0),
            )}
            <span>of session audio</span>
          </div>
          <p className="stat-description">Every second, a new possibility</p>
        </div>
      </div>
      <div className="tabs-line history-tabs">
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? 'active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === 'all' && <span>{history.length}</span>}
          </button>
        ))}
      </div>
      <div className="toolbar-row">
        <SearchInput
          placeholder="Search your activity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="filter-select"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          aria-label="Filter history by date"
        >
          <option>All time</option>
          <option>Today</option>
          <option>Last 7 days</option>
        </select>
      </div>
      {filtered.length ? (
        <Panel className="activity-panel">
          <div className="activity-table-head">
            <span>ACTIVITY</span>
            <span>STATUS</span>
            <span>DURATION</span>
            <span>TIME</span>
            <span />
          </div>
          {Object.entries(grouped).map(([date, entries]) => (
            <div key={date} className="activity-day">
              <div className="activity-date">
                <span className="status-dot" />
                {date}
                <span>
                  {entries.length} {entries.length === 1 ? 'EVENT' : 'EVENTS'}
                </span>
              </div>
              {entries.map((entry) => {
                const Icon = activityIcons[entry.type];
                const creation = findCreation(entry);
                return (
                  <div className="activity-row" key={entry.id}>
                    <div className="activity-description">
                      <span className={cn('activity-icon', `activity-icon-${entry.type}`)}>
                        <Icon size={17} />
                      </span>
                      <div>
                        <h3>
                          {entry.action}
                          {entry.demo && <Badge>DEMO</Badge>}
                        </h3>
                        <p>{entry.detail}</p>
                      </div>
                    </div>
                    <div className="activity-status">
                      <Badge
                        className={
                          entry.status === 'Downloaded'
                            ? 'badge-cyan'
                            : entry.status === 'Completed'
                              ? 'badge-green'
                              : 'badge-violet'
                        }
                      >
                        <span />
                        {entry.status}
                      </Badge>
                    </div>
                    <span className="activity-duration">
                      {entry.duration ? formatTime(entry.duration) : '—'}
                    </span>
                    <span className="activity-time">
                      {new Date(entry.time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: hydrated ? undefined : 'UTC',
                      })}
                    </span>
                    <Dropdown
                      trigger={
                        <button className="icon-button" aria-label={`Options for ${entry.action}`}>
                          <MoreHorizontal size={16} />
                        </button>
                      }
                    >
                      <DropdownItem onSelect={() => setDetails(entry)}>
                        <Eye size={13} />
                        View details
                      </DropdownItem>
                      {creation && (
                        <DropdownItem
                          onSelect={() =>
                            playTrack({
                              id: creation.id,
                              title: creation.name,
                              url: creation.url,
                              effectId: creation.effectId,
                            })
                          }
                        >
                          <Play size={12} />
                          Play audio
                        </DropdownItem>
                      )}
                      {creation && (
                        <DropdownItem
                          onSelect={() => {
                            downloadFile(creation.url, `${creation.name}.wav`);
                            toast.success('Audio ready to download');
                          }}
                        >
                          <Download size={13} />
                          Download audio
                        </DropdownItem>
                      )}
                      {creation && (
                        <DropdownItem
                          onSelect={() => {
                            setSelectedEffect(creation.effectId);
                            router.push('/studio');
                          }}
                        >
                          <ArrowUpRight size={13} />
                          Reopen effect in studio
                        </DropdownItem>
                      )}
                    </Dropdown>
                  </div>
                );
              })}
            </div>
          ))}
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={query ? <Search size={24} /> : <HistoryIcon size={26} />}
            title={query ? 'No echoes of that one.' : 'A fresh start sounds good.'}
            description={
              query
                ? 'Try another search or change the activity filter.'
                : 'Create a new sound in the studio. Your activity will appear right here.'
            }
          >
            {query || filter !== 'all' || range !== 'All time' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                  setRange('All time');
                }}
              >
                Reset filters
              </Button>
            ) : (
              <Button onClick={() => router.push('/studio')}>
                Back to the studio
                <ArrowRight size={14} />
              </Button>
            )}
          </EmptyState>
        </Panel>
      )}
      <div className="history-bottom-note">
        <Clock size={12} />
        This is a session timeline, not a permanent archive. Activity disappears when you refresh.
      </div>
      <Modal
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Start with a clean slate?"
        description="This clears your session history. Your audio creations will stay available until you refresh."
      >
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setClearOpen(false)}>
            Keep history
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearHistory();
              setClearOpen(false);
              toast.success('Session history cleared');
            }}
          >
            <Trash2 size={14} />
            Clear history
          </Button>
        </div>
      </Modal>
      <Modal
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
        title={details?.action || 'Activity details'}
        description={details?.detail}
      >
        <div className="activity-detail-grid">
          <span>
            ACTIVITY ID<strong>{details?.id}</strong>
          </span>
          <span>
            STATUS<strong>{details?.status}</strong>
          </span>
          <span>
            DATE<strong>{details && new Date(details.time).toLocaleString('en-US')}</strong>
          </span>
          <span>
            DURATION<strong>{formatTime(details?.duration || 0)}</strong>
          </span>
          <span>
            PROCESSING
            <strong>
              {details?.demo ? 'Included demo track' : 'Browser session · Local processing'}
            </strong>
          </span>
        </div>
        <div className="info-box">
          <Activity size={16} />
          <p>
            Session metadata only. This is not a durable conversion job or an AI inference record.
          </p>
        </div>
        <Button variant="outline" className="full-width" onClick={() => setDetails(null)}>
          Close details
        </Button>
      </Modal>
    </div>
  );
}
