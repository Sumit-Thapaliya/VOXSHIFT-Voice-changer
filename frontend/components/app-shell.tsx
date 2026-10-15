'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LayoutGrid,
  AudioLines,
  Mic,
  FolderOpen,
  History,
  Settings,
  ArrowUpRight,
  ChevronRight,
  ChevronsUpDown,
  Bell,
  Search,
  Command,
  HelpCircle,
  Download,
  Sparkles,
  Menu,
  X,
  Check,
  ShieldCheck,
  Cpu,
  Radio,
} from 'lucide-react';
import { Button, Modal, Dropdown, DropdownItem, SearchInput, Tip, Badge } from './ui';
import { GlobalAudioPlayer } from './audio-player';
import { useStudio } from './providers';
import { effects } from '@/lib/data';
import { downloadFile, cn } from '@/lib/utils';
import { toast } from 'sonner';
const navigation = [
  { href: '/studio', label: 'Studio', icon: LayoutGrid, section: 'CREATE' },
  { href: '/voice-effects', label: 'Voice Effects', icon: AudioLines },
  { href: '/custom-voice', label: 'Custom Voice', icon: Mic },
  { href: '/creations', label: 'My Creations', icon: FolderOpen, section: 'YOUR WORKSPACE' },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { player, output, creations, preferences, togglePlayback, setSelectedEffect, addHistory } =
    useStudio();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [transitionReady, setTransitionReady] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  const restoreFocus = useRef<'menu' | 'workspace' | null>(null);
  const reducedMotion = useReducedMotion();
  const motionEnabled = preferences.motion && !reducedMotion;
  const closeNavigation = useCallback(() => {
    restoreFocus.current = 'menu';
    setMobileOpen(false);
  }, []);
  const navigateFromDrawer = useCallback(() => {
    if (!isMobile) return;
    restoreFocus.current = 'workspace';
    setMobileOpen(false);
  }, [isMobile]);
  const current =
    navigation.find((n) => n.href === pathname) ||
    (pathname === '/' ? navigation[0] : navigation[0]);
  useEffect(() => {
    setTransitionReady(true);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) {
        restoreFocus.current = null;
        setMobileOpen(false);
      }
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (previousPath.current !== pathname && isMobile) restoreFocus.current = 'workspace';
    previousPath.current = pathname;
    setMobileOpen(false);
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, isMobile]);
  useEffect(() => {
    if (mobileOpen || helpOpen || searchOpen || !restoreFocus.current) return;
    const target = restoreFocus.current === 'menu' ? menuRef.current : contentRef.current;
    restoreFocus.current = null;
    target?.focus({ preventScroll: true });
  }, [mobileOpen, helpOpen, searchOpen, pathname]);
  useEffect(() => {
    if (!isMobile || !mobileOpen || helpOpen || searchOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const getFocusable = () =>
      Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')).filter(
        (element) => element.getClientRects().length > 0,
      );
    const activeLink = drawer.querySelector<HTMLElement>('[aria-current="page"]');
    (activeLink || getFocusable()[0])?.focus({ preventScroll: true });
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNavigation();
      }
      if (event.key !== 'Tab') return;
      const items = getFocusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const outside = !drawer.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [isMobile, mobileOpen, helpOpen, searchOpen, closeNavigation]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (
        e.code === 'Space' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(
          (e.target as HTMLElement).tagName,
        ) &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [togglePlayback]);
  const exportAudio = () => {
    const creation = output || creations.find((c) => c.id === player.id);
    if (!creation) {
      toast.info('Convert a voice first, or download a track from My Creations.');
      return;
    }
    downloadFile(creation.url, `${creation.name}.wav`);
    addHistory({
      action: 'Audio exported',
      type: 'export',
      detail: creation.name,
      status: 'Downloaded',
      duration: creation.duration,
      creationId: creation.id,
    });
    toast.success('Your audio is ready to download');
  };
  const initials = preferences.displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="app-window" data-page={current.href.split('/')[1]}>
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <AnimatePresence>
        {mobileOpen && (
          <motion.button
            initial={motionEnabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={motionEnabled ? { opacity: 0 } : undefined}
            transition={{ duration: motionEnabled ? 0.18 : 0 }}
            className="sidebar-backdrop"
            onClick={closeNavigation}
            tabIndex={-1}
            aria-hidden="true"
            aria-label="Close navigation"
          />
        )}
      </AnimatePresence>
      <aside
        ref={drawerRef}
        id="workspace-navigation"
        className={cn('sidebar', mobileOpen && 'sidebar-open')}
        role={isMobile ? 'dialog' : undefined}
        aria-label={isMobile ? 'Workspace navigation' : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        inert={isMobile && !mobileOpen}
      >
        <div className="sidebar-header">
          <Link
            href="/studio"
            className="brand"
            aria-label="VoxShift home"
            onClick={navigateFromDrawer}
          >
            <img src="/logo.png" alt="" className="brand-mark" />
            <div>
              <span className="brand-name">
                VOXSHIFT
                <span className="brand-wave">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span className="brand-tagline">ONE VOICE. INFINITE YOU.</span>
            </div>
          </Link>
          <button
            className="mobile-sidebar-close icon-button"
            onClick={closeNavigation}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <div key={item.href}>
              {item.section && <div className="nav-section-label">{item.section}</div>}
              <Link
                href={item.href}
                className={cn('nav-item', current.href === item.href && 'nav-active')}
                aria-current={current.href === item.href ? 'page' : undefined}
                onClick={navigateFromDrawer}
              >
                <item.icon size={18} strokeWidth={1.7} />
                <span>{item.label}</span>
                {item.href === '/custom-voice' && <span className="nav-beta">BETA</span>}
                {current.href === item.href && (
                  <motion.span className="nav-active-indicator" layoutId="active-navigation" />
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="inspiration-card">
            <span className="inspiration-spark">
              <Sparkles size={23} />
            </span>
            <span className="inspiration-eyebrow">A DIFFERENT KIND OF YOU</span>
            <h3>
              Make some
              <br />
              noise.
            </h3>
            <p>
              Find the voice you didn’t
              <br />
              know you had.
            </p>
            <Link href="/voice-effects" onClick={navigateFromDrawer}>
              Explore voices
              <ArrowUpRight size={15} />
            </Link>
            <span className="inspiration-orbit" />
          </div>
          <button
            className="sidebar-help"
            onClick={() => {
              if (isMobile) closeNavigation();
              setHelpOpen(true);
            }}
          >
            <HelpCircle size={16} />
            Help & shortcuts
            <ArrowUpRight size={13} />
          </button>
          <Link href="/settings" className="sidebar-profile" onClick={navigateFromDrawer}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{preferences.displayName}</strong>
              <small>Personal workspace</small>
            </span>
            <ChevronsUpDown size={14} />
          </Link>
          <div className="sidebar-version">
            <span className="status-dot" />
            SESSION WORKSPACE<span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="app-main" inert={isMobile && mobileOpen}>
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <button
              ref={menuRef}
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="workspace-navigation"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} />
            <span>{current.label}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="command-trigger"
              onClick={() => {
                setQuery('');
                setSearchOpen(true);
              }}
            >
              <Search size={15} />
              <span>Quick search</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="engine-status">
              <span className="status-dot" />
              ENGINE ONLINE
            </span>
            <Tip label="Help & keyboard shortcuts">
              <button
                className="icon-button topbar-help"
                onClick={() => setHelpOpen(true)}
                aria-label="Help"
              >
                <HelpCircle size={18} />
              </button>
            </Tip>
            <Dropdown
              trigger={
                <button className="icon-button notification-trigger" aria-label="Notifications">
                  <Bell size={18} />
                  {unread && preferences.notifications && <i />}
                </button>
              }
            >
              <div className="notification-heading">
                Your studio updates
                <button onClick={() => setUnread(false)} aria-label="Mark all as read">
                  <Check size={14} />
                </button>
              </div>
              <div className="notification-item">
                <span>
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>A new voice is waiting</strong>
                  <p>Explore 16 creative effects in the library.</p>
                  <small>WELCOME TO VOXSHIFT</small>
                </div>
              </div>
              <div className="notification-item">
                <span>
                  <ShieldCheck size={16} />
                </span>
                <div>
                  <strong>Private by design</strong>
                  <p>Your audio stays on your device in this preview.</p>
                  <small>FRONTEND PREVIEW</small>
                </div>
              </div>
              <DropdownItem onSelect={() => router.push('/voice-effects')}>
                Explore the voice library
                <ArrowUpRight size={14} />
              </DropdownItem>
            </Dropdown>
            <span className="topbar-divider" />
            <Button variant="outline" size="sm" className="export-button" onClick={exportAudio}>
              <Download size={14} />
              <span>Quick export</span>
            </Button>
          </div>
        </header>
        <div
          className="workspace-content"
          id="workspace-main"
          role="main"
          aria-label={`${current.label} workspace`}
          tabIndex={-1}
          ref={contentRef}
        >
          <motion.div
            key={pathname}
            initial={motionEnabled && transitionReady ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionEnabled ? 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}
            className="page-content"
          >
            {children}
          </motion.div>
          <div className="workspace-footer">
            <span>
              <ShieldCheck size={12} />
              Your sound. Your space. Always private.
            </span>
            <span>
              VOXSHIFT STUDIO<span className="footer-dot">·</span>FRONTEND PREVIEW
            </span>
          </div>
        </div>
      </div>
      <GlobalAudioPlayer />
      <Modal
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Meet your new voice studio."
        description="A few things to help you find your sound."
      >
        <div className="help-steps">
          <div>
            <span>01</span>
            <div>
              <h4>Choose your transformation</h4>
              <p>Pick an effect in the studio, or discover something new in the voice library.</p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <h4>Add a little of you</h4>
              <p>Upload a recording, use the demo, or record directly with your microphone.</p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <h4>Make it sound different</h4>
              <p>
                Effects are processed locally using Web Audio. Download your WAV when it’s ready.
              </p>
            </div>
          </div>
        </div>
        <div className="help-shortcuts">
          <span>
            Play / pause <kbd>SPACE</kbd>
          </span>
          <span>
            Quick search <kbd>⌘ / CTRL K</kbd>
          </span>
        </div>
        <div className="info-box">
          <Cpu size={18} />
          <p>
            <strong>This is the frontend phase.</strong> Custom AI voice conversion needs a real
            inference backend. Pitch effects are creative effects, not realistic speaker cloning.
            Session audio and history disappear on refresh.
          </p>
        </div>
        <Button className="full-width" onClick={() => setHelpOpen(false)}>
          Let’s make something
          <ArrowUpRight size={16} />
        </Button>
      </Modal>
      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find your next sound"
        description="Jump to a page or select a voice effect."
        className="command-modal"
      >
        <SearchInput
          placeholder="Search pages, voices, and more…"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-results">
          <span className="field-eyebrow">PAGES</span>
          {navigation
            .filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
            .map((n) => (
              <button
                key={n.href}
                onClick={() => {
                  router.push(n.href);
                  setSearchOpen(false);
                }}
              >
                <n.icon size={17} />
                <span>{n.label}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          <span className="field-eyebrow">VOICE EFFECTS</span>
          {effects
            .filter((e) => query && e.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6)
            .map((effect) => (
              <button
                key={effect.id}
                onClick={() => {
                  setSelectedEffect(effect.id);
                  router.push('/studio');
                  setSearchOpen(false);
                }}
              >
                <AudioLines size={17} style={{ color: effect.color }} />
                <span>{effect.name}</span>
                <Badge>{effect.category}</Badge>
              </button>
            ))}
          {query &&
            navigation.every((n) => !n.label.toLowerCase().includes(query.toLowerCase())) &&
            effects.every((e) => !e.name.toLowerCase().includes(query.toLowerCase())) && (
              <p className="command-empty">No matches. Try “Robot” or “Studio”.</p>
            )}
        </div>
      </Modal>
    </div>
  );
}
