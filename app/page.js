'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'multiview-keluarga-streams-v1';

const PERMANENT_CHANNELS = [
  {
    name: 'Cherrydlum',
    url: 'https://youtube.com/@maciwayaya'
  },
  {
    name: 'Kuro El Sailor',
    url: 'https://youtube.com/@kuroelsailor'
  },
  {
    name: 'Munkar A Bellamy',
    url: 'https://youtube.com/@munkar.abellamy'
  },
  {
    name: 'Slebew Gaming',
    url: 'https://youtube.com/@slebewgamingventra'
  }
];

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
      embed: videoEmbed(id)
    };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id =
      url.searchParams.get('v') ||
      (url.pathname.match(/\/(?:live|embed|shorts)\/([^/?]+)/) || [])[1];

    if (!id) throw new Error('URL video YouTube tidak valid.');

    return {
      platform: 'YouTube',
      id,
      embed: videoEmbed(id)
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

function videoEmbed(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=0&playsinline=1&enablejsapi=1`;
}

async function checkChannel(channelUrl) {
  const response = await fetch(
    `/api/youtube?channel=${encodeURIComponent(channelUrl)}`,
    { cache: 'no-store' }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Gagal memeriksa channel.');
  }

  return data;
}

export default function Home() {
  const [streams, setStreams] = useState([]);
  const streamsRef = useRef([]);

  const [channelStatus, setChannelStatus] = useState({});
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [columns, setColumns] = useState('1');
  const [chatOpen, setChatOpen] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showPermanent, setShowPermanent] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  streamsRef.current = streams;

  // Memuat player tersimpan
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '[]'
      );

      if (Array.isArray(saved)) {
        setStreams(saved);
      }
    } catch {
      setStreams([]);
    }
  }, []);

  // Menyimpan player
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streams));
  }, [streams]);

  // Memeriksa semua channel permanen
  async function syncPermanentChannels() {
    setSyncing(true);

    const results = await Promise.all(
      PERMANENT_CHANNELS.map(async channel => {
        try {
          const data = await checkChannel(channel.url);

          return {
            name: channel.name,
            url: channel.url,
            status: data.live ? 'live' : 'offline',
            videoId: data.videoId || null,
            title: data.title || ''
          };
        } catch (err) {
          return {
            name: channel.name,
            url: channel.url,
            status: 'error',
            message: err.message
          };
        }
      })
    );

    const updated = {};

    results.forEach(item => {
      updated[item.url] = item;
    });

    setChannelStatus(updated);

    setSyncing(false);
  }

  // Pemeriksaan awal dan berkala.
  // Interval 15 menit digunakan untuk menghemat kuota YouTube API.
  useEffect(() => {
    syncPermanentChannels();

    const timer = setInterval(() => {
      syncPermanentChannels();
    }, 15 * 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  // Memeriksa channel tambahan
  async function syncChannels() {
    setSyncing(true);
    setError('');

    const channels = streamsRef.current.filter(
      item => item.isChannel
    );

    for (const stream of channels) {
      try {
        const data = await checkChannel(stream.channelUrl);

        setStreams(current =>
          current.map(item => {
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
          })
        );
      } catch (err) {
        setError(err.message);
      }
    }

    await syncPermanentChannels();

    setSyncing(false);
  }

  // Klik channel permanen
  function addPermanentChannel(channel) {
    const status = channelStatus[channel.url];

    if (!status || status.status === 'checking') {
      setError('Status channel sedang diperiksa.');
      return;
    }

    if (status.status === 'error') {
      setError(status.message || 'Gagal memeriksa channel.');
      return;
    }

    if (status.status !== 'live' || !status.videoId) {
      setError(`${channel.name} sedang tidak LIVE.`);
      return;
    }

    const exists = streamsRef.current.some(
      item => item.id === status.videoId
    );

    if (exists) {
      setError('Channel tersebut sudah ada di player.');
      return;
    }

    const item = {
      key: `${Date.now()}-${Math.random()}`,
      name: channel.name,
      platform: 'YouTube',
      id: status.videoId,
      embed: videoEmbed(status.videoId),
      originalUrl: channel.url,
      liveTitle: status.title,
      liveStatus: 'live',
      isPermanent: true
    };

    setStreams(prev => [...prev, item]);
    setError('');
  }

  // Tambah link pribadi
  async function addStream(e) {
    e.preventDefault();
    setError('');

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
      }

      setStreams(prev => [...prev, item]);

      setName('');
      setUrl('');
      setError('');
    } catch (err) {
      setError(err.message);
    }

    setSyncing(false);
  }

  function removeOne(key) {
    setStreams(prev => prev.filter(item => item.key !== key));
  }

  function removeAll() {
    if (confirm('Kosongkan semua player?')) {
      setStreams([]);
      setChatOpen({});
    }
  }

  // Mencoba mengaktifkan suara
  function toggleSound(key) {
    const next = !soundEnabled;
    setSoundEnabled(next);

    document
      .querySelectorAll(`iframe[data-player="${key}"]`)
      .forEach(frame => {
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
    setChatOpen(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }

  function chatUrl(stream) {
  if (!stream.id || typeof window === 'undefined') {
    return '';
  }

  return `https://www.youtube.com/live_chat?is_popout=1&v=${stream.id}&embed_domain=${window.location.hostname}`;
}

  function statusLabel(channel) {
    const status = channelStatus[channel.url];

    if (!status) return 'MEMERIKSA';

    if (status.status === 'live') return 'LIVE';
    if (status.status === 'offline') return 'OFFLINE';
    if (status.status === 'error') return 'ERROR';

    return 'MEMERIKSA';
  }

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white sm:px-7">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
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

        {/* MSF STREAMING */}
        <section className="mb-7 rounded-3xl border border-yellow-900/50 bg-zinc-950 p-5">

          <div className="mb-5">
            <h2 className="text-xl font-black text-yellow-400">
              MSF STREAMING
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {streams.length} player tersimpan
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <button
              onClick={syncChannels}
              disabled={syncing}
              className="rounded-xl bg-yellow-500 px-6 py-4 font-black text-black disabled:opacity-50"
            >
              ● {syncing ? 'SYNC...' : 'SYNC'}
            </button>

            <button
              onClick={removeAll}
              className="rounded-xl border border-red-900 px-6 py-4 font-bold text-red-400"
            >
              KOSONGKAN
            </button>
          </div>

          {/* CHANNEL PERMANEN */}
          <section className="mb-6 overflow-hidden rounded-3xl border border-yellow-900/60 bg-black">

            <button
              onClick={() => setShowPermanent(v => !v)}
              className="flex w-full items-center justify-between bg-zinc-900 px-5 py-8 text-left"
            >
              <span className="text-xl font-black text-yellow-400">
                CHANNEL PERMANEN
              </span>

              <span className="text-2xl text-yellow-400">
                {showPermanent ? '⌃' : '⌄'}
              </span>
            </button>

            {showPermanent && (
  <div className="grid grid-cols-2 gap-3 p-4">

    {PERMANENT_CHANNELS.map(channel => {
      const status = statusLabel(channel);
      const isLive = status === 'LIVE';
      const isError = status === 'ERROR';

      return (
        <button
          key={channel.url}
          onClick={() => addPermanentChannel(channel)}
          className={`grid min-h-[100px] min-w-0 grid-cols-[14px_9px_minmax(0,1fr)] items-center gap-2 rounded-2xl border p-3 text-left transition ${
            isLive
              ? 'border-red-800 bg-red-950/30 shadow-lg shadow-red-900/30'
              : 'border-zinc-800 bg-zinc-900'
          }`}
        >

          {/* IKON PLAY KECIL */}
          <span
            className={`text-xs ${
              isLive ? 'text-red-500' : 'text-zinc-600'
            }`}
          >
            ▶
          </span>

          {/* TITIK STATUS KECIL */}
          <span
            className={`h-2 w-2 rounded-full ${
              isLive ? 'bg-red-500' : 'bg-zinc-600'
            }`}
          />

          {/* NAMA DAN STATUS CHANNEL */}
          <div className="min-w-0">
            <p className="text-sm font-bold leading-snug text-white [overflow-wrap:normal]">
              {channel.name}
            </p>

            <p
              className={`mt-2 text-[10px] font-black ${
                isLive
                  ? 'text-red-400'
                  : isError
                    ? 'text-orange-400'
                    : 'text-zinc-500'
              }`}
            >
              {status}
            </p>
          </div>

        </button>
      );
    })}

  </div>
)}
          </section>

          {/* TAMBAH PLAYER */}
          <form onSubmit={addStream} className="grid gap-3">

            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nama Siaran"
              maxLength={60}
              className="w-full rounded-2xl border border-zinc-700 bg-black p-5 outline-none focus:border-yellow-500"
            />

            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="URL Channel YouTube / Video / TikTok"
              type="url"
              required
              className="w-full rounded-2xl border border-zinc-700 bg-black p-5 outline-none focus:border-yellow-500"
            />

            {error && (
              <p className="rounded-xl bg-red-950/40 p-3 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              disabled={syncing}
              className="rounded-2xl bg-yellow-500 p-5 font-black tracking-wider text-black disabled:opacity-50"
            >
              {syncing ? 'MEMERIKSA...' : '+ TAMBAH LINK'}
            </button>

          </form>

          {/* PENGATURAN */}
          {showSettings && (
            <div className="mt-5 rounded-2xl border border-zinc-800 p-4">
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

        </section>

        {/* PLAYER */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-yellow-400">
            LIVE MULTIVIEW
          </h2>

          <span className="text-xs text-zinc-500">
            {streams.length} PLAYER
          </span>
        </div>

        <div
          className="grid gap-5"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >
          {streams.map(stream => (
            <article
              key={stream.key}
              className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"
            >

              {/* PLAYER HEADER */}
              <div className="flex items-center gap-2 border-b border-zinc-800 p-3">

                <span className="min-w-0 flex-1 truncate font-bold">
                  {stream.name}
                </span>

                <button
                  onClick={() => toggleSound(stream.key)}
                  className="rounded-lg border border-yellow-800 px-3 py-2 text-sm text-yellow-400"
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>

                <button
                  onClick={() => toggleChat(stream.key)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    chatOpen[stream.key]
                      ? 'border-yellow-500 bg-yellow-500 text-black'
                      : 'border-zinc-700 text-yellow-400'
                  }`}
                >
                  ▢
                </button>

                <button
                  onClick={() => removeOne(stream.key)}
                  className="rounded-lg border border-red-900 px-3 py-2 text-red-400"
                >
                  ✕
                </button>

              </div>

              {/* VIDEO */}
              <div className="relative aspect-video bg-black">

                {stream.embed ? (
                  <iframe
                    key={`${stream.key}-${stream.id}`}
                    data-player={stream.key}
                    src={stream.embed}
                    title={stream.name}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    {stream.isChannel
                      ? 'Channel belum LIVE.'
                      : 'Player tidak tersedia.'}
                  </div>
                )}

                {/* CHAT BUBBLE */}
                {chatOpen[stream.key] &&
                  stream.platform === 'YouTube' &&
                  stream.id && (
                    <div className="absolute inset-2 z-10 flex flex-col overflow-hidden rounded-2xl border border-yellow-500/70 bg-black shadow-xl">

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
  title="MSF Live Chat"
  className="min-h-0 w-full flex-1 border-0"
  allow="autoplay"
/>

                    </div>
                  )}

              </div>

              {/* PLAYER FOOTER */}
              <div className="p-3">
                <p className="truncate text-xs text-zinc-500">
                  {stream.liveTitle || stream.originalUrl}
                </p>
              </div>

            </article>
          ))}
        </div>

        {/* FOOTER */}
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
