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
    const id = url.searchParams.get('v') ||
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

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [columns, setColumns] = useState('1');
  const [syncing, setSyncing] = useState(false);

  const [chatOpen, setChatOpen] = useState({});
  const [mutedPlayers, setMutedPlayers] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showPermanent, setShowPermanent] = useState(true);
  const [permanentStatuses, setPermanentStatuses] = useState({});
  const [clock, setClock] = useState(0);

  const syncingRef = useRef(false);

  streamsRef.current = streams;

  // Memuat sumber pribadi dari perangkat.
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '[]'
      );

      if (Array.isArray(saved)) {
        setStreams(saved);
      }
    } catch {}
  }, []);

  // Menyimpan sumber pribadi.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streams));
  }, [streams]);

  // Jam pembaruan tampilan setiap 1 detik.
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(value => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Pemeriksaan status LIVE melalui YouTube API.
  async function syncChannels() {
    if (syncingRef.current) return;

    const channels = streamsRef.current.filter(
      stream => stream.isChannel
    );

    if (!channels.length) return;

    syncingRef.current = true;
    setSyncing(true);

    try {
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

              // Tidak memuat ulang player jika video masih sama.
              if (item.id === data.videoId) {
                return {
                  ...item,
                  liveTitle: data.title,
                  liveStatus: 'live'
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
          console.error(err);
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  const hasChannels = streams.some(stream => stream.isChannel);

  useEffect(() => {
    if (!hasChannels) return;

    const timer = setInterval(() => {
      syncChannels();
    }, 60000);

    return () => clearInterval(timer);
  }, [hasChannels]);

  // Menambahkan sumber pribadi.
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

        setSyncing(false);
      }

      setStreams(prev => [...prev, item]);

      setName('');
      setUrl('');
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  // Menambahkan channel permanen ke player.
  async function addPermanentChannel(channel) {
    setError('');

    const exists = streamsRef.current.some(
      stream => stream.isChannel &&
        stream.channelUrl === channel.url
    );

    if (exists) {
      setError(`${channel.name} sudah ditambahkan.`);
      return;
    }

    const item = {
      platform: 'YouTube',
      isChannel: true,
      channelUrl: channel.url,
      originalUrl: channel.url,
      id: null,
      embed: '',
      key: `${Date.now()}-${Math.random()}`,
      name: channel.name,
      liveStatus: 'checking'
    };

    setStreams(prev => [...prev, item]);

    try {
      const data = await checkChannel(channel.url);

      setStreams(current =>
        current.map(stream => {
          if (stream.key !== item.key) return stream;

          if (!data.live) {
            return {
              ...stream,
              liveStatus: 'offline'
            };
          }

          return {
            ...stream,
            id: data.videoId,
            embed: videoEmbed(data.videoId),
            liveTitle: data.title,
            liveStatus: 'live'
          };
        })
      );
    } catch (err) {
      setError(err.message);

      setStreams(current =>
        current.map(stream =>
          stream.key === item.key
            ? { ...stream, liveStatus: 'offline' }
            : stream
        )
      );
    }
  }

  function removeOne(key) {
    setStreams(prev =>
      prev.filter(stream => stream.key !== key)
    );

    setChatOpen(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setMutedPlayers(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function removeAll() {
    if (confirm('Kosongkan semua player pribadi?')) {
      setStreams([]);
      setChatOpen({});
      setMutedPlayers({});
    }
  }

  // Kontrol suara masing-masing player.
  function togglePlayerSound(key) {
    const frame = document.getElementById(`player-${key}`);

    if (!frame) return;

    const next = !mutedPlayers[key];

    frame.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func: next ? 'mute' : 'unMute',
        args: []
      }),
      '*'
    );

    if (!next) {
      frame.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'playVideo',
          args: []
        }),
        '*'
      );
    }

    setMutedPlayers(prev => ({
      ...prev,
      [key]: next
    }));
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

    return `https://www.youtube.com/live_chat?v=${stream.id}&embed_domain=${window.location.hostname}`;
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

        {/* FORM TAMBAH PLAYER */}
        <section className="mb-7 rounded-3xl border border-yellow-900/50 bg-zinc-950 p-5">

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-yellow-400">
                MSF STREAMING
              </h2>

              <p className="text-xs text-zinc-500">
                {streams.length} player tersimpan
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={syncChannels}
                disabled={syncing}
                className="rounded-xl bg-yellow-500 px-4 py-3 text-xs font-black text-black"
              >
                {syncing ? 'SYNC...' : '● SYNC'}
              </button>

              <button
                onClick={removeAll}
                className="rounded-xl border border-red-900 px-4 py-3 text-xs text-red-400"
              >
                KOSONGKAN
              </button>
            </div>
          </div>

          {/* DAFTAR CHANNEL PERMANEN */}
          {/* DAFTAR CHANNEL PERMANEN */}
<div className="mb-5 overflow-hidden rounded-3xl border border-yellow-900/50 bg-zinc-950">

  <button
    onClick={() => setShowPermanent(v => !v)}
    className="flex w-full items-center justify-between bg-zinc-900 p-5 text-left"
  >
    <span className="text-lg font-black tracking-wide text-yellow-400">
      CHANNEL PERMANEN
    </span>

    <span className="text-xl text-yellow-400">
      {showPermanent ? '⌃' : '⌄'}
    </span>
  </button>

  {showPermanent && (
    <div className="grid grid-cols-2 gap-3 p-4">

      {PERMANENT_CHANNELS.map(channel => {
        const added = streams.find(
          stream =>
            stream.isChannel &&
            stream.channelUrl === channel.url
        );

        const isLive = added?.liveStatus === 'live';

        return (
          <button
            key={channel.url}
            onClick={() => addPermanentChannel(channel)}
            disabled={!!added}
            className={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-4 text-left transition ${
              isLive
                ? 'border-red-900 bg-red-950/20 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                : 'border-zinc-800 bg-zinc-900/70'
            } ${added ? 'cursor-default' : 'active:scale-95'}`}
          >

            {/* IKON YOUTUBE */}
            <span className={`shrink-0 text-sm ${
              isLive ? 'text-red-500' : 'text-zinc-700'
            }`}>
              ▶
            </span>

            {/* INDIKATOR */}
            <span className={`h-2 w-2 shrink-0 rounded-full ${
              isLive ? 'bg-red-500' : 'bg-zinc-600'
            }`} />

            {/* NAMA CHANNEL */}
            <span className="min-w-0 flex-1 text-left text-sm font-bold leading-tight whitespace-normal break-words">
  {channel.name}
</span>

            {/* STATUS */}
            <span className="shrink-0 text-xs font-bold">
  {channel.status}
</span>

          </button>
        );
      })}

    </div>
  )}

</div>

          {/* PENGATURAN */}
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

          {/* FORM */}
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

            {error && (
              <p className="text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              disabled={syncing}
              className="rounded-xl bg-yellow-500 p-4 font-black tracking-wider text-black disabled:opacity-50"
            >
              {syncing ? 'MEMERIKSA...' : '+ TAMBAH LINK'}
            </button>

          </form>
        </section>

        {/* JUDUL MULTIVIEW */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-yellow-400">
            LIVE MULTIVIEW
          </h2>

          <span className="text-xs text-zinc-500">
            {streams.length} PLAYER
          </span>
        </div>

        {/* GRID PLAYER */}
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >

          {streams.map(stream => {
            const isMuted = !!mutedPlayers[stream.key];

            return (
              <article
                key={stream.key}
                className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"
              >

                {/* HEADER PLAYER */}
                <div className="flex items-center gap-2 border-b border-zinc-800 p-3">

                  <span className="min-w-0 flex-1 truncate font-bold">
                    {stream.name}
                  </span>

                  {stream.platform === 'YouTube' && stream.id && (
                    <>
                      <button
                        onClick={() => togglePlayerSound(stream.key)}
                        title={isMuted ? 'Aktifkan suara' : 'Matikan suara'}
                        className="rounded-lg border border-yellow-800 px-3 py-2 text-yellow-400"
                      >
                        {isMuted ? '🔇' : '🔊'}
                      </button>

                      <button
                        onClick={() => toggleChat(stream.key)}
                        title="Live Chat"
                        className={`rounded-lg border px-3 py-2 ${
                          chatOpen[stream.key]
                            ? 'border-yellow-500 bg-yellow-500 text-black'
                            : 'border-yellow-800 text-yellow-400'
                        }`}
                      >
                        ▢
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => removeOne(stream.key)}
                    title="Hapus player"
                    className="rounded-lg border border-red-900 px-3 py-2 text-red-400"
                  >
                    ✕
                  </button>

                </div>

                {/* VIDEO PLAYER */}
                <div className="relative aspect-video bg-black">

                  {stream.embed ? (
                    <iframe
                      id={`player-${stream.key}`}
                      key={`${stream.key}-${stream.id}`}
                      src={stream.embed}
                      title={stream.name}
                      className="h-full w-full"
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                      loading="eager"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      {stream.isChannel
                        ? stream.liveStatus === 'checking'
                          ? 'Memeriksa siaran...'
                          : 'Channel belum LIVE.'
                        : 'Player tidak tersedia.'}
                    </div>
                  )}

                  {/* CHAT BUBBLE */}
                  {chatOpen[stream.key] &&
                    stream.platform === 'YouTube' &&
                    stream.id && (

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

                {/* INFORMASI PLAYER */}
                <div className="p-3">
                  <span className="block truncate text-xs text-zinc-500">
                    {stream.liveTitle || stream.originalUrl}
                  </span>
                </div>

              </article>
            );
          })}

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
