import Providers from "./providers";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div style={{ padding: 16 }}>{children}</div>
    </Providers>
  );
}
