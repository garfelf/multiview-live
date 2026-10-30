'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'multiview-keluarga-streams-v1';

function identifyUrl(raw) {
  let url;

  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Masukkan URL lengkap yang valid.');
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (['youtube.com', 'm.youtube.com'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);

    if (
      parts[0]?.startsWith('@') ||
      parts[0] === 'channel' ||
      parts[0] === 'user'
    ) {
      return {
        platform: 'YouTube',
        isChannel: true,
        channelUrl: raw.trim(),
        id: null,
        embed: ''
      };
    }
  }

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];

    if (!id) throw new Error('ID video tidak ditemukan.');

    return {
      platform: 'YouTube',
      id,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`
    };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') ||
      (url.pathname.match(/\/(?:live|embed|shorts)\/([^/?]+)/) || [])[1];

    if (!id) throw new Error('URL video YouTube tidak valid.');

    return {
      platform: 'YouTube',
      id,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`
    };
  }

  if (host.endsWith('tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/);

    if (match) {
      return {
        platform: 'TikTok',
        id: match[1],
        embed: `https://www.tiktok.com/player/v1/${match[1]}?music_info=1&description=1`
      };
    }

    throw new Error('Gunakan URL video TikTok.');
  }

  throw new Error('Platform belum didukung.');
}

async function checkChannel(channelUrl) {
  const response = await fetch(
    `/api/youtube?channel=${encodeURIComponent(channelUrl)}`,
    { cache: 'no-store' }
  );

  const data = await response.json();

  if (!response.ok) throw new Error(data.error || 'Gagal memeriksa channel.');

  return data;
}

function videoEmbed(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&enablejsapi=1`;
}

export default function Home() {
  const [streams, setStreams] = useState([]);
  const streamsRef = useRef([]);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [columns, setColumns] = useState('1');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [chatOpen, setChatOpen] = useState({});
  const [chatModes, setChatModes] = useState({});
  const [showSettings, setShowSettings] = useState(false);

  streamsRef.current = streams;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setStreams(saved.slice(0, 80));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streams));
  }, [streams]);

  async function syncChannels() {
    setSyncing(true);

    for (const stream of streamsRef.current.filter(s => s.isChannel)) {
      try {
        const data = await checkChannel(stream.channelUrl);

        setStreams(current => current.map(item => {
          if (item.key !== stream.key) return item;

          if (!data.live) {
            return {
              ...item,
              id: null,
              embed: '',
              liveStatus: 'offline'
            };
          }

          return {
            ...item,
            id: data.videoId,
            embed: videoEmbed(data.videoId),
            liveTitle: data.title,
            liveStatus: 'live'
          };
        }));
      } catch (err) {
        setError(err.message);
      }
    }

    setSyncing(false);
  }

  const hasChannels = streams.some(s => s.isChannel);

  useEffect(() => {
    if (!hasChannels) return;

    const timer = setInterval(syncChannels, 60000);

    return () => clearInterval(timer);
  }, [hasChannels]);

  async function addStream(e) {
    e.preventDefault();
    setError('');

    if (streamsRef.current.length >= 80) {
      setError('Maksimal 80 sumber.');
      return;
    }

    try {
      const parsed = identifyUrl(url);

      const item = {
        ...parsed,
        key: `${Date.now()}-${Math.random()}`,
        name: name.trim() || `MSF ${streamsRef.current.length + 1}`,
        originalUrl: url.trim(),
        liveStatus: parsed.isChannel ? 'checking' : 'live'
      };

      if (parsed.isChannel) {
        setSyncing(true);
        const data = await checkChannel(parsed.channelUrl);

        if (data.live) {
          item.id = data.videoId;
          item.embed = videoEmbed(data.videoId);
          item.liveTitle = data.title;
          item.liveStatus = 'live';
        } else {
          item.liveStatus = 'offline';
        }

        setSyncing(false);
      }

      setStreams(prev => [...prev, item]);
      setSelected(item.key);
      setName('');
      setUrl('');
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  function removeOne(key) {
    setStreams(prev => prev.filter(s => s.key !== key));
    if (selected === key) setSelected(null);
  }

  function removeAll() {
    if (confirm('Hapus semua sumber siaran?')) {
      setStreams([]);
      setSelected(null);
    }
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);

    document.querySelectorAll('iframe').forEach(frame => {
      if (!frame.src.includes('youtube')) return;

      frame.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: next ? 'unMute' : 'mute',
          args: []
        }),
        '*'
      );
    });
  }

  function toggleChat(key) {
    setChatOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function setChatMode(key, mode) {
    setChatModes(prev => ({ ...prev, [key]: mode }));
  }

  function chatUrl(stream) {
    if (!stream.id || typeof window === 'undefined') return '';

    return `https://www.youtube.com/live_chat?v=${stream.id}&embed_domain=${window.location.hostname}`;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white sm:px-7">
      <div className="mx-auto max-w-6xl">

        <header className="mb-8 flex items-center justify-between border-b border-yellow-900/50 pb-5">
          <div className="flex items-center gap-3">
            <img
              src="/msf-logo.webp"
              alt="MSF"
              className="h-14 w-14 rounded-full border border-yellow-500 object-cover"
            />
            <div>
              <h1 className="text-2xl font-black tracking-widest text-yellow-400">
                MSF
              </h1>
              <p className="text-[10px] tracking-[.25em] text-zinc-500">
                MULTIVIEW LIVE
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(v => !v)}
            className="rounded-xl border border-yellow-800 px-4 py-3 text-yellow-400"
          >
            ⚙ PENGATURAN
          </button>
        </header>

        <section className="mb-7 rounded-3xl border border-yellow-900/50 bg-zinc-950 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-yellow-400">
                MSF STREAMING
              </h2>
              <p className="text-xs text-zinc-500">
                {streams.length}/80 sumber tersimpan
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={syncChannels}
                disabled={syncing}
                className="rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black"
              >
                {syncing ? 'SYNC...' : '● SYNC'}
              </button>

              <button
                onClick={toggleSound}
                className="rounded-xl border border-yellow-700 px-4 py-3 text-xs font-bold text-yellow-400"
              >
                {soundEnabled ? '🔊 SUARA' : '🔇 MUTE'}
              </button>

              <button
                onClick={removeAll}
                className="rounded-xl border border-red-900 px-4 py-3 text-xs text-red-400"
              >
                HAPUS SEMUA
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="mb-5 rounded-xl border border-zinc-800 p-4">
              <label className="text-sm text-zinc-400">
                Jumlah kolom player
              </label>
              <select
                value={columns}
                onChange={e => setColumns(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3"
              >
                <option value="1">1 kolom</option>
                <option value="2">2 kolom</option>
                <option value="3">3 kolom</option>
              </select>
            </div>
          )}

          <form onSubmit={addStream} className="grid gap-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nama Siaran"
              maxLength={60}
              className="w-full rounded-xl border border-zinc-700 bg-black p-4 outline-none focus:border-yellow-500"
            />

            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="URL Channel YouTube / Video / TikTok"
              type="url"
              required
              className="w-full rounded-xl border border-zinc-700 bg-black p-4 outline-none focus:border-yellow-500"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              disabled={syncing}
              className="rounded-xl bg-yellow-500 p-4 font-black tracking-wider text-black disabled:opacity-50"
            >
              {syncing ? 'MEMERIKSA...' : '+ TAMBAH LINK'}
            </button>
          </form>
        </section>

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-yellow-400">
            LIVE MULTIVIEW
          </h2>
          <span className="text-xs text-zinc-500">
            {streams.length} PLAYER
          </span>
        </div>

        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >
          {streams.map(stream => {
            const mode = chatModes[stream.key] || 'bubble';

            return (
              <article
                key={stream.key}
                className={`overflow-hidden rounded-3xl border bg-zinc-950 ${
                  selected === stream.key
                    ? 'border-yellow-400 shadow-lg shadow-yellow-900/20'
                    : 'border-zinc-800'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 p-3">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />

                  <span className="min-w-0 flex-1 truncate font-bold">
                    {stream.name}
                  </span>

                  <span className="text-[10px] text-yellow-500">
                    {stream.isChannel
                      ? stream.liveStatus === 'live' ? 'LIVE' : 'OFFLINE'
                      : stream.platform}
                  </span>

                  <button
                    onClick={() => setSelected(stream.key)}
                    className="rounded-lg border border-yellow-800 px-3 py-2 text-xs text-yellow-400"
                  >
                    PILIH
                  </button>

                  <button
                    onClick={() => toggleChat(stream.key)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      chatOpen[stream.key]
                        ? 'bg-yellow-500 text-black'
                        : 'border border-zinc-700 text-yellow-400'
                    }`}
                  >
                    ▢ CHAT
                  </button>

                  <button
                    onClick={() => removeOne(stream.key)}
                    className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-400"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative aspect-video bg-black">
                  {stream.embed ? (
                    <iframe
                      key={`${stream.key}-${stream.id}`}
                      src={
                        stream.platform === 'YouTube'
                          ? `${stream.embed}&enablejsapi=1`
                          : stream.embed
                      }
                      title={stream.name}
                      className="h-full w-full"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      {stream.isChannel
                        ? 'Channel belum LIVE.'
                        : 'Player tidak tersedia.'}
                    </div>
                  )}

                  {chatOpen[stream.key] && stream.platform === 'YouTube' && stream.id && mode === 'bubble' && (
                    <div className="absolute bottom-3 left-3 right-3 z-10 h-[65%] overflow-hidden rounded-2xl border border-yellow-500/70 bg-black/90 shadow-xl">
                      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
                        <span className="text-xs font-bold text-yellow-400">
                          MSF LIVE CHAT
                        </span>
                        <button
                          onClick={() => toggleChat(stream.key)}
                          className="text-xs text-white"
                        >
                          TUTUP ✕
                        </button>
                      </div>

                      <iframe
                        src={chatUrl(stream)}
                        title="Live Chat Bubble"
                        className="h-[calc(100%-36px)] w-full"
                      />
                    </div>
                  )}
                </div>

                {chatOpen[stream.key] && stream.platform === 'YouTube' && stream.id && mode === 'embed' && (
                  <div className="border-t border-yellow-900/50">
                    <div className="flex items-center justify-between p-3">
                      <span className="text-sm font-bold text-yellow-400">
                        LIVE CHAT
                      </span>
                      <button
                        onClick={() => toggleChat(stream.key)}
                        className="text-xs text-zinc-400"
                      >
                        TUTUP ✕
                      </button>
                    </div>

                    <iframe
                      src={chatUrl(stream)}
                      title="YouTube Live Chat"
                      className="h-80 w-full bg-black"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                    {stream.liveTitle || stream.originalUrl}
                  </span>

                  {stream.platform === 'YouTube' && stream.id && (
                    <select
                      value={mode}
                      onChange={e => setChatMode(stream.key, e.target.value)}
                      className="rounded-lg border border-yellow-900 bg-black px-2 py-2 text-xs text-yellow-400"
                    >
                      <option value="bubble">CHAT BUBBLE</option>
                      <option value="embed">CHAT EMBED</option>
                    </select>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <footer className="mt-12 border-t border-yellow-900/40 py-6 text-center">
          <p className="font-black tracking-[.3em] text-yellow-500">
            MSF MULTIVIEW
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            BLACK & YELLOW EDITION
          </p>
        </footer>

      </div>
    </main>
  );
}
