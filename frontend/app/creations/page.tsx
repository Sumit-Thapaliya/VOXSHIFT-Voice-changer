'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Heart,
  Play,
  Pause,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  AudioLines,
  Clock,
  Sparkles,
  ArrowUpRight,
  FolderOpen,
  Search,
  ArrowRight,
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
  Tip,
} from '@/components/ui';
import { VoiceGlyph } from '@/components/voice-glyph';
import { MiniWave } from '@/components/visuals';
import { getEffect, type Creation } from '@/lib/data';
import { cn, formatTime, downloadFile } from '@/lib/utils';
export default function CreationsPage() {
  const router = useRouter();
  const {
    creations,
    updateCreation,
    deleteCreation,
    player,
    playTrack,
    addHistory,
    setSource,
    setSelectedEffect,
    hydrated,
  } = useStudio();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('Newest first');
  const [renaming, setRenaming] = useState<Creation | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Creation | null>(null);
  const filtered = useMemo(
    () =>
      creations
        .filter(
          (c) =>
            (!favorites || c.favorite) &&
            (c.name.toLowerCase().includes(query.toLowerCase()) ||
              getEffect(c.effectId).name.toLowerCase().includes(query.toLowerCase())),
        )
        .sort((a, b) =>
          sort === 'A–Z'
            ? a.name.localeCompare(b.name)
            : sort === 'Oldest first'
              ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [creations, query, favorites, sort],
  );
  const duration = creations.reduce((total, c) => total + c.duration, 0);
  const download = (creation: Creation) => {
    downloadFile(creation.url, `${creation.name}.wav`);
    addHistory({
      action: 'Audio exported',
      type: 'export',
      detail: creation.name,
      status: 'Downloaded',
      duration: creation.duration,
      creationId: creation.id,
      demo: creation.demo,
    });
    toast.success('Audio ready to download');
  };
  const rename = () => {
    if (!newName.trim()) {
      toast.error('Give this creation a name.');
      return;
    }
    if (renaming) {
      updateCreation(renaming.id, { name: newName.trim() });
      setRenaming(null);
      toast.success('A fresh name for a fresh sound');
    }
  };
  return (
    <div className="creations-page">
      <PageHeading
        eyebrow="YOUR SOUND COLLECTION"
        title="Made by you. Unlike anything."
        description="Every experiment, every new identity. A little collection of what’s possible."
      >
        <Button asChild>
          <Link href="/studio">
            <Plus size={15} />
            New creation
          </Link>
        </Button>
      </PageHeading>
      <SessionNotice />
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            <FolderOpen size={14} />
            Session creations
          </span>
          <div className="stat-value">
            {String(creations.length).padStart(2, '0')}
            <span>including {creations.filter((c) => c.demo).length} demos</span>
          </div>
          <p className="stat-description">A whole new collection of you</p>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <Clock size={14} />
            Audio created
          </span>
          <div className="stat-value">
            {formatTime(duration)}
            <span>minutes of possibility</span>
          </div>
          <p className="stat-description">Every second sounds different</p>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <Heart size={14} />
            Saved favorites
          </span>
          <div className="stat-value">
            {String(creations.filter((c) => c.favorite).length).padStart(2, '0')}
            <span>worth another listen</span>
          </div>
          <p className="stat-description">The sounds you keep coming back to</p>
        </div>
      </div>
      <div className="toolbar-row">
        <SearchInput
          placeholder="Find a creation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="toolbar-group">
          <div className="segmented-control collection-tabs">
            <button className={!favorites ? 'active' : ''} onClick={() => setFavorites(false)}>
              All creations
            </button>
            <button className={favorites ? 'active' : ''} onClick={() => setFavorites(true)}>
              <Heart size={11} />
              Favorites
            </button>
          </div>
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort creations"
          >
            <option>Newest first</option>
            <option>Oldest first</option>
            <option>A–Z</option>
          </select>
          <div className="segmented-control view-toggle">
            <Tip label="Grid view">
              <button
                className={view === 'grid' ? 'active' : ''}
                onClick={() => setView('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid size={13} />
              </button>
            </Tip>
            <Tip label="List view">
              <button
                className={view === 'list' ? 'active' : ''}
                onClick={() => setView('list')}
                aria-label="List view"
              >
                <List size={14} />
              </button>
            </Tip>
          </div>
        </div>
      </div>
      <div className="result-count">
        <strong>{filtered.length}</strong> {filtered.length === 1 ? 'creation' : 'creations'} in
        your {favorites ? 'favorites' : 'session'}
      </div>
      {filtered.length ? (
        <div className={cn('creation-grid', view === 'list' && 'creation-list')}>
          {filtered.map((creation, index) => {
            const effect = getEffect(creation.effectId);
            const playing = player.id === creation.id && player.playing;
            return (
              <Panel
                className={cn('creation-card', playing && 'creation-playing')}
                key={creation.id}
                style={{ '--voice-color': effect.color } as React.CSSProperties}
              >
                <div className="creation-artwork">
                  <span className="creation-serial">VX / {String(index + 1).padStart(3, '0')}</span>
                  {creation.demo && <Badge className="demo-badge">DEMO TRACK</Badge>}
                  <div className="creation-art-rings">
                    <i />
                    <i />
                    <i />
                  </div>
                  <VoiceGlyph id={effect.id} size={55} />
                  <MiniWave bars={35} color={effect.color} active={playing} seed={index + 3} />
                  <button
                    className={cn('creation-favorite', creation.favorite && 'active')}
                    onClick={() => updateCreation(creation.id, { favorite: !creation.favorite })}
                    aria-label={`${creation.favorite ? 'Unfavorite' : 'Favorite'} ${creation.name}`}
                  >
                    <Heart size={15} fill={creation.favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="creation-details">
                  <div className="creation-name-row">
                    <h2 title={creation.name}>{creation.name}</h2>
                    <Dropdown
                      trigger={
                        <button className="icon-button" aria-label={`Options for ${creation.name}`}>
                          <MoreHorizontal size={16} />
                        </button>
                      }
                    >
                      <DropdownItem
                        onSelect={() => {
                          setRenaming(creation);
                          setNewName(creation.name);
                        }}
                      >
                        <Pencil size={13} />
                        Rename creation
                      </DropdownItem>
                      <DropdownItem onSelect={() => download(creation)}>
                        <Download size={13} />
                        Download WAV
                      </DropdownItem>
                      <DropdownItem
                        onSelect={() => {
                          setSource({
                            url: creation.url,
                            name: creation.name + '.wav',
                            duration: creation.duration,
                            blob: creation.blob,
                          });
                          setSelectedEffect(creation.effectId);
                          router.push('/studio');
                        }}
                      >
                        <AudioLines size={13} />
                        Load audio into studio
                      </DropdownItem>
                      <DropdownItem className="danger" onSelect={() => setDeleting(creation)}>
                        <Trash2 size={13} />
                        Delete creation
                      </DropdownItem>
                    </Dropdown>
                  </div>
                  <div className="creation-metadata">
                    <Badge style={{ color: effect.color }}>{effect.name}</Badge>
                    <span>
                      {new Date(creation.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: hydrated ? undefined : 'UTC',
                      })}
                    </span>
                    <span>WAV</span>
                  </div>
                  <MiniWave
                    bars={53}
                    color={effect.color}
                    active={playing}
                    seed={index * 0.7 + 3}
                    progress={player.id === creation.id ? player.time / creation.duration : 0}
                    className="creation-wave"
                  />
                  <div className="creation-footer">
                    <button
                      className="creation-play"
                      onClick={() =>
                        playTrack({
                          id: creation.id,
                          title: creation.name,
                          url: creation.url,
                          effectId: creation.effectId,
                        })
                      }
                      aria-label={`${playing ? 'Pause' : 'Play'} ${creation.name}`}
                    >
                      {playing ? (
                        <Pause size={12} fill="currentColor" />
                      ) : (
                        <Play size={12} fill="currentColor" />
                      )}
                      <span>{playing ? 'Playing' : 'Play audio'}</span>
                    </button>
                    <span className="creation-length">{formatTime(creation.duration)}</span>
                    <Tip label="Download WAV">
                      <button
                        className="icon-button"
                        onClick={() => download(creation)}
                        aria-label={`Download ${creation.name}`}
                      >
                        <Download size={14} />
                      </button>
                    </Tip>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={query ? <Search size={25} /> : <FolderOpen size={25} />}
            title={
              favorites
                ? 'No favorites on this frequency.'
                : query
                  ? 'We haven’t heard that one yet.'
                  : 'Your next sound starts here.'
            }
            description={
              favorites
                ? 'Tap the heart on a creation to keep it close.'
                : query
                  ? 'Try another name or search for a voice effect.'
                  : 'Choose a voice, add your audio, and create something that could only come from you.'
            }
          >
            {query || favorites ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setFavorites(false);
                }}
              >
                Show all creations
              </Button>
            ) : (
              <Button asChild>
                <Link href="/studio">
                  Open the studio
                  <ArrowRight size={15} />
                </Link>
              </Button>
            )}
          </EmptyState>
        </Panel>
      )}
      <div className="collection-bottom-note">
        <ShieldNote />
        <span>
          These sounds live in your session, not in the cloud. Download your favorites before you
          go.
        </span>
      </div>
      <Modal
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        title="A name that sounds right."
        description="Make this creation a little more yours."
      >
        <div className="rename-form">
          <label className="field-label" htmlFor="creation-name">
            Creation name
          </label>
          <input
            id="creation-name"
            className="input-field"
            autoFocus
            maxLength={72}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
            }}
          />
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={rename}>Save name</Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Let this sound go?"
        description={`“${deleting?.name || ''}” will be removed from this session. This cannot be undone.`}
      >
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) {
                deleteCreation(deleting.id);
                setDeleting(null);
                toast.success('Creation removed from your session');
              }
            }}
          >
            <Trash2 size={14} />
            Delete creation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function ShieldNote() {
  return <Sparkles size={12} />;
}
