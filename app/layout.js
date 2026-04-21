import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: {
    default: "AR Pet Studio",
    template: "%s | AR Pet Studio",
  },
  description: "Interactive 3D pet viewer with AR camera, animation engine, and health telemetry.",
  icons: {
    icon: "/assets/icons/dog.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <Script
          src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"
          type="module"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        {children}
      </body>
    </html>
  );
}
