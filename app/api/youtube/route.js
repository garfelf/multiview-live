const API_KEY = process.env.YOUTUBE_API_KEY;

// Cache sementara untuk mengurangi permintaan API.
const CACHE_DURATION = 5 * 60 * 1000;

const globalCache = globalThis.youtubeCache || new Map();
globalThis.youtubeCache = globalCache;

async function youtubeRequest(endpoint, params) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  Object.entries({
    ...params,
    key: API_KEY,
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Gagal menghubungi YouTube API"
    );
  }

  return data;
}

// Mengambil ID channel.
async function getChannelId(input) {
  let handle = input.trim();

  if (handle.startsWith("http")) {
    const url = new URL(handle);

    if (
      !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
        url.hostname
      )
    ) {
      throw new Error("URL harus berasal dari YouTube");
    }

    const parts = url.pathname.split("/").filter(Boolean);

    handle = parts[0] || "";

    if (handle === "channel" && parts[1]) {
      return parts[1];
    }

    if (handle.startsWith("@")) {
      handle = handle.slice(1);
    } else {
      throw new Error("Gunakan URL channel dengan format @handle");
    }
  } else {
    handle = handle.replace(/^@/, "");
  }

  const cacheKey = `channel:${handle.toLowerCase()}`;
  const cached = globalCache.get(cacheKey);

  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const result = await youtubeRequest("channels", {
    part: "id",
    forHandle: handle,
  });

  const channelId = result.items?.[0]?.id;

  if (!channelId) {
    throw new Error("Channel YouTube tidak ditemukan");
  }

  globalCache.set(cacheKey, {
    data: channelId,
    expiry: Date.now() + 24 * 60 * 60 * 1000,
  });

  return channelId;
}

// Memeriksa status LIVE.
async function checkLive(channelId) {
  const cacheKey = `live:${channelId}`;
  const cached = globalCache.get(cacheKey);

  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  const result = await youtubeRequest("search", {
    part: "snippet",
    channelId,
    type: "video",
    eventType: "live",
    maxResults: "1",
  });

  const live = result.items?.[0];

  const data = live
    ? {
        live: true,
        videoId: live.id.videoId,
        title: live.snippet.title,
        channelTitle: live.snippet.channelTitle,
        channelId,
      }
    : {
        live: false,
        message: "Channel sedang tidak melakukan siaran langsung",
      };

  // Cache hasil LIVE maupun OFFLINE selama 5 menit.
  globalCache.set(cacheKey, {
    data,
    expiry: Date.now() + CACHE_DURATION,
  });

  return data;
}

export async function GET(request) {
  try {
    if (!API_KEY) {
      return Response.json(
        { error: "YOUTUBE_API_KEY belum dikonfigurasi di Vercel" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel");

    if (!channel) {
      return Response.json(
        { error: "Masukkan URL channel YouTube" },
        { status: 400 }
      );
    }

    const channelId = await getChannelId(channel);
    const data = await checkLive(channelId);

    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}
