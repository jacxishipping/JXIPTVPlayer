// A curated LEGAL demo M3U playlist built from publicly-available test streams
// (Big Buck Bunny / Sintel / Tears of Steel / Apple BipBop / Mux test streams).
// None of these are copyrighted broadcasts — they are royalty-free demo content
// shipped specifically so players can be demonstrated out of the box.

export const DEMO_PLAYLIST_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="bbb.mux" tvg-name="Big Buck Bunny" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Big_Buck_Bunny_poster_big.jpg/480px-Big_Buck_Bunny_poster_big.jpg" group-title="Movies",Big Buck Bunny (HLS)
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="sintel" tvg-name="Sintel" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sintel_poster.jpg/480px-Sintel_poster.jpg" group-title="Movies",Sintel (HLS)
https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
#EXTINF:-1 tvg-id="tears" tvg-name="Tears of Steel" tvg-logo="https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Tears_of_Steel_poster.jpg/480px-Tears_of_Steel_poster.jpg" group-title="Movies",Tears of Steel (HLS)
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-id="apple.bipbop" tvg-name="Apple BipBop Adv" tvg-logo="https://www.apple.com/v/apple-tv-plus/aa/images/channellogo/logo_apple_tv__ckkg9vc0yr2a_large_2x.png" group-title="Test",Apple BipBop Advanced (HLS)
https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8
#EXTINF:-1 tvg-id="apple.bipbop.basic" tvg-name="Apple BipBop Basic" group-title="Test",Apple BipBop Basic (HLS)
https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8
#EXTINF:-1 tvg-id="mux.too" tvg-name="Mux Example" group-title="Test",Mux Test Stream (HLS)
https://stream.mux.com/v69RSHhFelSm4701snP22KYpinIoLo.m3u8
#EXTINF:-1 tvg-id="mux.low.latency" tvg-name="Mux Low Latency" group-title="Live",Mux Low-Latency Live (HLS)
https://stream.mux.com/v69RSHhFelSm4701snP22KYpinIoLo.m3u8
#EXTINF:-1 tvg-id="bbb.loop" tvg-name="Big Buck Bunny (fMP4)" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Big_Buck_Bunny_poster_big.jpg/480px-Big_Buck_Bunny_poster_big.jpg" group-title="Movies",Big Buck Bunny (fMP4 HLS)
https://test-streams.mux.dev/x36xhzz/u6uyvatoy5amawxmzn3pmxqfpl6yz5xvmteftvm6yqx5v6tx.m3u8
`;

export const DEMO_PLAYLIST_ID = "demo";
export const DEMO_PLAYLIST_NAME = "Streamline Demo (Legal Test Streams)";

export const LEGAL_SAMPLE_STREAMS = [
  {
    name: "Big Buck Bunny",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Big_Buck_Bunny_poster_big.jpg/480px-Big_Buck_Bunny_poster_big.jpg",
    group: "Movies",
  },
  {
    name: "Sintel",
    url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sintel_poster.jpg/480px-Sintel_poster.jpg",
    group: "Movies",
  },
];
