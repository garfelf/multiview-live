const API_KEY = process.env.YOUTUBE_API_KEY;

async function youtubeRequest(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);

  Object.entries({
    ...params,
    key: API_KEY,
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Gagal menghubungi YouTube API");
  }

  return data;
}

async function getChannelId(input) {
  let handle = input.trim();

  if (handle.startsWith("http")) {
    const url = new URL(handle);

    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      throw new Error("URL harus berasal dari YouTube");
    }

    const parts = url.pathname.split("/").filter(Boolean);
    handle = parts[0] || "";
    
    if (handle === "channel" && parts[1]) return parts[1];

    if (handle.startsWith("@")) {
      handle = handle.slice(1);
    } else if (handle === "user" && parts[1]) {
      handle = parts[1];
    } else {
      throw new Error("Gunakan URL channel YouTube dengan format @handle atau /channel/ID");
    }
  } else {
    handle = handle.replace(/^@/, "");
  }

  const result = await youtubeRequest("channels", {
    part: "id",
    forHandle: handle,
  });

  const channelId = result.items?.[0]?.id;

  if (!channelId) {
    throw new Error("Channel YouTube tidak ditemukan");
  }

  return channelId;
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

    const result = await youtubeRequest("search", {
      part: "snippet",
      channelId,
      type: "video",
      eventType: "live",
      maxResults: "5",
    });

    const live = result.items?.[0];

    if (!live) {
      return Response.json({
        live: false,
        message: "Channel tersebut sedang tidak melakukan siaran langsung",
      });
    }

    return Response.json({
      live: true,
      videoId: live.id.videoId,
      title: live.snippet.title,
      channelTitle: live.snippet.channelTitle,
      channelId,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}
