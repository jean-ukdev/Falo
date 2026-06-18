export const metadata = {
  title: "Falô — Aprenda inglês conversando",
  description: "Seu professor de inglês com IA. Converse, receba correções e evolua.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#221833",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#1A1227" }}>{children}</body>
    </html>
  );
}
