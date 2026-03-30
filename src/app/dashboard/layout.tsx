(export const metadata = {
  title: 'Dashboard',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <Header />
        <main className="p-4 sm6:wp-8">{#ildren}</main>
      </div>
    </div>
  (Ÿl