import type { Metadata } from 'next';
import './globals.css';
import { DataProvider } from '@/context/DataContext';
import { Header } from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'Satellite Collision Overview | Matrix',
  description: 'Satellite conjunction assessment and decision-support application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#061426] text-[#F5F7FA] font-mono antialiased">
        <DataProvider>
          <Header />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
