'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Heart,
  Play,
  Pause,
  ArrowUpRight,
  ArrowRight,
  Search,
  SlidersHorizontal,
  AudioLines,
  Sparkles,
  Cpu,
  Headphones,
} from 'lucide-react';
import { useStudio } from '@/components/providers';
import { Button, Panel, Badge, SearchInput, Slider, EmptyState, Tip } from '@/components/ui';
import { PageHeading } from '@/components/page-heading';
import { VoiceGlyph } from '@/components/voice-glyph';
import { MiniWave } from '@/components/visuals';
import { effects, getEffect } from '@/lib/data';
import { cn, formatTime } from '@/lib/utils';
const categories = ['All voices', 'Human', 'Fun', 'Robotic', 'Cinematic', 'Professional'];
export default function VoiceEffectsPage() {
  const {
    selectedEffect,
    setSelectedEffect,
    player,
    previewEffect,
    favorites,
    toggleFavorite,
    intensity,
    setIntensity,
  } = useStudio();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All voices');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState('Popular');
  const [inspected, setInspected] = useState(selectedEffect);
  const effect = getEffect(inspected);
  const active = player.playing && player.id === `preview-${effect.id}`;
  const filtered = useMemo(
    () =>
      effects
        .filter(
          (e) =>
            (category === 'All voices' || e.category === category) &&
            e.name.toLowerCase().includes(query.toLowerCase()) &&
            (!onlyFavorites || favorites.includes(e.id)),
        )
        .sort((a, b) =>
          sort === 'A–Z'
            ? a.name.localeCompare(b.name)
            : sort === 'Newest'
              ? Number(b.badge === 'NEW') - Number(a.badge === 'NEW')
              : Number(!!b.badge) - Number(!!a.badge),
        ),
    [category, query, onlyFavorites, favorites, sort],
  );
  const useVoice = (id: string) => {
    setSelectedEffect(id);
    router.push('/studio');
  };
  return (
    <div className="effects-page">
      <PageHeading
        eyebrow="THE VOICE LIBRARY"
        title="Meet your next alter ego."
        description="A voice for every version of you. Explore, experiment, and find your frequency."
      >
        <div className="library-spectrum">
          <MiniWave bars={24} color="#8ea5ef" seed={2} />
          <span>{effects.length} VOICES. INFINITE POSSIBILITIES.</span>
        </div>
      </PageHeading>
      <div className="tabs-line category-tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            className={category === cat ? 'active' : ''}
            onClick={() => setCategory(cat)}
          >
            {cat}
            {cat === 'All voices' && <span>{effects.length}</span>}
          </button>
        ))}
      </div>
      <div className="toolbar-row">
        <SearchInput
          placeholder="Find a voice, mood, or identity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="toolbar-group">
          <button
            className={cn('favorite-filter', onlyFavorites && 'active')}
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            aria-pressed={onlyFavorites}
          >
            <Heart size={13} fill={onlyFavorites ? 'currentColor' : 'none'} />
            Favorites
          </button>
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort voice effects"
          >
            <option>Popular</option>
            <option>Newest</option>
            <option>A–Z</option>
          </select>
        </div>
      </div>
      <div className="result-count">
        <strong>{filtered.length}</strong> voices to make your own
        <span>CREATIVE AUDIO EFFECTS · LOCAL PROCESSING</span>
      </div>
      <div className="effects-layout">
        <div className="voice-library-grid">
          {filtered.map((voice, index) => {
            const playing = player.playing && player.id === `preview-${voice.id}`;
            return (
              <article
                className={cn('voice-card', inspected === voice.id && 'voice-card-selected')}
                key={voice.id}
                style={{ '--voice-color': voice.color } as React.CSSProperties}
              >
                <div className="voice-card-top">
                  <button
                    className="voice-card-icon"
                    onClick={() => {
                      setInspected(voice.id);
                      setSelectedEffect(voice.id);
                    }}
                    aria-label={`Inspect ${voice.name}`}
                  >
                    <VoiceGlyph id={voice.id} size={38} />
                  </button>
                  <div>
                    {voice.badge && (
                      <Badge className={voice.badge === 'NEW' ? 'badge-violet' : 'badge-cyan'}>
                        {voice.badge}
                      </Badge>
                    )}
                    <Tip
                      label={favorites.includes(voice.id) ? 'Remove from favorites' : 'Save voice'}
                    >
                      <button
                        className={cn(
                          'voice-favorite',
                          favorites.includes(voice.id) && 'is-favorite',
                        )}
                        onClick={() => toggleFavorite(voice.id)}
                        aria-label={`${favorites.includes(voice.id) ? 'Unfavorite' : 'Favorite'} ${voice.name}`}
                      >
                        <Heart
                          size={14}
                          fill={favorites.includes(voice.id) ? 'currentColor' : 'none'}
                        />
                      </button>
                    </Tip>
                  </div>
                </div>
                <button
                  className="voice-card-description"
                  onClick={() => {
                    setInspected(voice.id);
                    setSelectedEffect(voice.id);
                  }}
                >
                  <span className="voice-category">{voice.category.toUpperCase()}</span>
                  <h2>{voice.name}</h2>
                  <p>{voice.description}</p>
                </button>
                <MiniWave bars={38} color={voice.color} seed={index * 0.4 + 2} active={playing} />
                <div className="voice-card-footer">
                  <button
                    className={cn('voice-preview', playing && 'playing')}
                    onClick={() => previewEffect(voice.id)}
                  >
                    {playing ? (
                      <Pause size={11} fill="currentColor" />
                    ) : (
                      <Play size={11} fill="currentColor" />
                    )}
                    {playing ? 'Playing' : 'Preview'}
                  </button>
                  <button onClick={() => useVoice(voice.id)} className="voice-use">
                    Use voice
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="library-empty">
              <EmptyState
                icon={<Search size={27} />}
                title="Nothing on this frequency."
                description="Try a different search or explore another category."
              >
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setOnlyFavorites(false);
                    setCategory('All voices');
                  }}
                >
                  Show all voices
                </Button>
              </EmptyState>
            </div>
          )}
        </div>
        <Panel
          className="voice-inspector"
          style={{ '--voice-color': effect.color } as React.CSSProperties}
        >
          <div className="inspector-heading">
            <span>PRESET INSPECTOR</span>
            <Badge className="badge-green">
              <span className="status-dot" />
              READY
            </Badge>
          </div>
          <div className="inspector-visual">
            <span className="inspector-ring" />
            <div className="inspector-glyph">
              <VoiceGlyph id={effect.id} size={64} />
            </div>
            <Badge>{effect.category}</Badge>
          </div>
          <h2>{effect.name}</h2>
          <p className="inspector-description">{effect.description}</p>
          <div className="inspector-audio">
            <div>
              <Headphones size={12} />
              <span>Voice preview</span>
              <span>
                {active
                  ? `${formatTime(player.time)} / ${formatTime(player.duration)}`
                  : '0:00 / 0:12'}
              </span>
            </div>
            <MiniWave
              bars={42}
              color={effect.color}
              seed={6}
              active={active}
              progress={active ? player.time / player.duration : 0}
            />
            <button onClick={() => previewEffect(effect.id)}>
              {active ? (
                <Pause size={11} fill="currentColor" />
              ) : (
                <Play size={11} fill="currentColor" />
              )}
              {active ? 'Pause preview' : 'Listen to this voice'}
            </button>
          </div>
          <div className="inspector-control">
            <div>
              <span>Effect intensity</span>
              <strong>{intensity}%</strong>
            </div>
            <Slider
              value={[intensity]}
              max={100}
              min={0}
              onValueChange={([value]) => setIntensity(value)}
              aria-label="Voice effect intensity"
            />
            <div className="slider-labels">
              <span>SUBTLE</span>
              <span>FULL PERSONALITY</span>
            </div>
          </div>
          <div className="inspector-specs">
            <span>
              <Cpu size={12} />
              LOCAL AUDIO FX
            </span>
            <span>WAV · LOSSLESS</span>
          </div>
          <Button className="full-width" onClick={() => useVoice(effect.id)}>
            Use this voice
            <ArrowRight size={15} />
          </Button>
          <p className="effect-disclaimer">
            Creative pitch and modulation effects.
            <br />
            Not realistic speaker identity conversion.
          </p>
        </Panel>
      </div>
    </div>
  );
}
