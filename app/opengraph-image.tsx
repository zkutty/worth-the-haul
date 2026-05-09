import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Worth The Haul — Is the trip worth it?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#060606",
          color: "#EFEFEF",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 18,
            background: "#FF4500",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 36,
            color: "#FF4500",
            letterSpacing: 6,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Worththehaul.app
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 180,
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: -2,
            marginTop: 40,
          }}
        >
          <span>WORTH</span>
          <span>THE HAUL</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: "auto",
            fontSize: 40,
            color: "#999",
          }}
        >
          <span>🔥 Fire Score</span>
          <span style={{ color: "#444" }}>·</span>
          <span>😮‍💨 Schlep Score</span>
          <span style={{ color: "#444" }}>·</span>
          <span style={{ color: "#EFEFEF" }}>Is the trip worth it?</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
