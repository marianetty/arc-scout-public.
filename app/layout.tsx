import "./globals.css";

export const metadata = {
  title: "Arc Scout",
  description: "Arc mainnet token intelligence",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
