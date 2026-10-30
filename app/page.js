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

  // Deteksi URL channel YouTube
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
        embed: '',
        id: null
      };
    }
  }

  // Video YouTube
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];

    if (!id) throw new Error('ID video YouTube tidak ditemukan.');

    return {
      platform: 'YouTube',
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&mute=1&playsinline=1`,
      id
    };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') ||
      (url.pathname.match(/\/(?:live|embed|shorts)\/([^/?]+)/) || [])[1];

    if (!id) {
      throw new Error('Tautan YouTube bukan URL video atau channel yang valid.');
    }

    return {
      platform: 'YouTube',
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&mute=1&playsinline=1`,
      id
    };
  }

  // Video TikTok
  if (host.endsWith('tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/);

    if (match) {
      return {
        platform: 'TikTok',
        embed: `https://www.tiktok.com/player/v1/${match[1]}?music_info=1&description=1`,
        id: match[1]
      };
    }

    if (url.pathname.includes('/live')) {
      throw new Error('Tautan TikTok LIVE belum didukung untuk embed.');
    }

    throw new Error('Gunakan tautan video TikTok yang memiliki /video/ID.');
  }

  throw new Error('Platform belum didukung.');
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

function videoEmbed(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&mute=1&playsinline=1`;
}

export default function Home() {
  const [streams, setStreams] = useState([]);
  const streamsRef = useRef([]);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [columns, setColumns] = useState('2');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  streamsRef.current = streams;

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '[]'
      );

      if (Array.isArray(saved)) {
        setStreams(saved.slice(0, 80));
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streams));
  }, [streams]);

  // Periksa semua channel setiap 60 detik
  const hasChannels = streams.some(s => s.isChannel);

  useEffect(() => {
    if (!hasChannels) return;

    async function syncChannels() {
      const channels = streamsRef.current.filter(s => s.isChannel);

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
                  liveTitle: '',
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
          console.error('Gagal sinkronisasi:', err);
        }
      }
    }

    const timer = setInterval(syncChannels, 60000);

    return () => clearInterval(timer);
  }, [hasChannels]);

  async function addStream(e) {
    e.preventDefault();
    setError('');

    if (streamsRef.current.length >= 80) {
      return setError('Maksimal 80 sumber siaran.');
    }

    try {
      const parsed = identifyUrl(url);

      const item = {
        ...parsed,
        key: `${Date.now()}-${Math.random()}`,
        name: name.trim() ||
          `${parsed.platform} ${streamsRef.current.length + 1}`,
        originalUrl: url.trim(),
        liveStatus: parsed.isChannel ? 'checking' : 'live'
      };

      if (parsed.isChannel) {
        setSyncing(true);

        try {
          const data = await checkChannel(parsed.channelUrl);

          if (data.live) {
            item.id = data.videoId;
            item.embed = videoEmbed(data.videoId);
            item.liveTitle = data.title;
            item.liveStatus = 'live';
          } else {
            item.liveStatus = 'offline';
          }
        } catch (err) {
          throw err;
        } finally {
          setSyncing(false);
        }
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

  async function syncNow() {
    setSyncing(true);
    setError('');

    const channels = streamsRef.current.filter(s => s.isChannel);

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
                liveTitle: '',
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

    setSyncing(false);
  }

  function removeAll() {
    if (confirm('Hapus semua sumber siaran dari daftar?')) {
      setStreams([]);
      setSelected(null);
    }
  }

  function removeOne(key) {
    setStreams(prev => prev.filter(s => s.key !== key));

    if (selected === key) setSelected(null);
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-7">
      <div className="mx-auto max-w-6xl">

        <header className="mb-8">
          <p className="mb-2 text-xs font-bold tracking-[.28em] text-pink-500">
            DASHBOARD STREAMING
          </p>

          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            MULTIVIEW KELUARGA
          </h1>

          <p className="mt-2 max-w-xl text-sm text-zinc-400 sm:text-base">
            Pantau beberapa sudut pandang keluarga secara bersamaan.
          </p>
        </header>

        <section className="panel p-5 sm:p-7">

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-lg font-bold">Siaran Aktif</div>
              <div className="mt-1 text-sm text-zinc-400">
                {streams.length}/80 sumber tersimpan
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn border-amber-700 bg-amber-950/60 text-amber-300"
                onClick={syncNow}
                disabled={syncing}
              >
                ⚡ {syncing ? 'MEMERIKSA...' : 'SYNC LIVE'}
              </button>

              <button
                className="btn border-red-900 bg-red-950/50 text-red-300"
                onClick={removeAll}
              >
                KOSONGKAN
              </button>

              <button
                className="btn"
                onClick={() => setListOpen(v => !v)}
              >
                {listOpen ? '⌃ TUTUP' : '⌄ BUKA'}
              </button>

              <button
                className="btn"
                onClick={() => setShowSettings(v => !v)}
              >
                ☷ PENGATURAN
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm">
              <label htmlFor="columns" className="text-zinc-300">
                Kolom player:
              </label>

              <select
                id="columns"
                value={columns}
                onChange={e => setColumns(e.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2"
              >
                <option value="1">1 kolom</option>
                <option value="2">2 kolom</option>
                <option value="3">3 kolom</option>
              </select>

              <span className="text-zinc-500">
                Daftar disimpan otomatis di browser perangkat ini.
              </span>
            </div>
          )}

          {listOpen && (
            <>
              <div className="my-6 border-t border-zinc-800" />

              {streams.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
                  Belum ada sumber siaran. Tambahkan tautan YouTube atau TikTok di bawah.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {streams.map(stream => (
                    <div
                      key={stream.key}
                      className={`stream-chip ${selected === stream.key ? 'selected' : ''}`}
                    >
                      <button
                        onClick={() => setSelected(stream.key)}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <span className="text-xs">
                          {stream.platform === 'TikTok' ? '♪' : '▶'}
                        </span>

                        <span className="truncate text-sm font-bold">
                          {stream.name}
                        </span>
                      </button>

                      <button
                        onClick={() => removeOne(stream.key)}
                        className="text-xs text-zinc-500 hover:text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="my-6 border-t border-zinc-800" />

          <form onSubmit={addStream} className="grid gap-3">

            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nama Siaran (contoh: Keluarga)"
              maxLength={60}
            />

            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="🔗 URL Video atau Channel YouTube / TikTok"
              type="url"
              required
            />

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              className="btn w-full rounded-2xl py-5 text-sm text-zinc-200"
              type="submit"
              disabled={syncing}
            >
              {syncing ? 'MEMERIKSA CHANNEL...' : '＋ TAMBAH LINK'}
            </button>
          </form>

        </section>

        <section className="mt-8">

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold">
              Tampilan MultiView
            </h2>

            <span className="text-xs text-zinc-500">
              {streams.length} sumber
            </span>
          </div>

          {streams.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-zinc-500">
              Player akan muncul setelah kamu menambahkan tautan.
            </div>
          ) : (
            <div className="grid gap-5" style={gridStyle}>

              {streams.map(stream => (
                <article
                  key={stream.key}
                  className={`overflow-hidden rounded-3xl border ${
                    selected === stream.key
                      ? 'border-pink-600/70'
                      : 'border-zinc-800'
                  } bg-[#111115]`}
                >

                  <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                    <span className="h-2 w-2 rounded-full bg-pink-500" />

                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {stream.name}
                    </span>

                    <span className="text-[10px] text-zinc-500">
                      {stream.isChannel
                        ? stream.liveStatus === 'live'
                          ? 'LIVE'
                          : stream.liveStatus === 'offline'
                            ? 'OFFLINE'
                            : 'CHECKING'
                        : stream.platform}
                    </span>

                    <button
                      onClick={() => setSelected(stream.key)}
                      className="rounded-full border border-zinc-700 px-3 py-1 text-xs"
                    >
                      PILIH
                    </button>
                  </div>

                  {stream.embed ? (
                    <div className="aspect-video bg-black">
                      <iframe
                        key={`${stream.key}-${stream.id}-${soundEnabled}`}
                        src={
                          stream.platform === 'YouTube'
                            ? stream.embed.replace(
                                'mute=1',
                                `mute=${soundEnabled ? '0' : '1'}`
                              )
                            : stream.embed
                        }
                        title={stream.name}
                        className="h-full w-full"
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-black p-5 text-center text-sm text-zinc-400">
                      {stream.isChannel
                        ? stream.liveStatus === 'offline'
                          ? 'Channel belum melakukan siaran LIVE.'
                          : 'Sedang mencari siaran LIVE...'
                        : 'Player tidak tersedia.'}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <span className="truncate text-xs text-zinc-500">
                      {stream.liveTitle || stream.originalUrl}
                    </span>

                    <button
                      onClick={() => removeOne(stream.key)}
                      className="shrink-0 text-xs text-red-400"
                    >
                      Hapus
                    </button>
                  </div>

                </article>
              ))}

            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
            <span>
              Player YouTube dimulai dalam keadaan mute. Aktifkan suara melalui kontrol player.
            </span>

            <span>
              Data tersimpan lokal di browser.
            </span>
          </div>

        </section>

        <footer className="mt-12 border-t border-zinc-900 pt-5 text-center text-xs text-zinc-600">
          MULTIVIEW KELUARGA · Versi awal
        </footer>

      </div>
    </main>
  );
}
