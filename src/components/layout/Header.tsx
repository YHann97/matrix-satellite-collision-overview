'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/context/DataContext';
import { CsvImportModal } from '@/components/modals/CsvImportModal';
import { AboutDataModal } from '@/components/modals/AboutDataModal';
import { DatasetSelectorModal } from '@/components/modals/DatasetSelectorModal';

export function Header() {
  const pathname = usePathname();
  const { activeDataset } = useData();

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDatasetOpen, setIsDatasetOpen] = useState(false);

  const navItems = [
    { label: '1. GLOBE', href: '/globe' },
    { label: '2. ENCOUNTERS', href: '/encounters' },
    { label: '3. INSIGHTS', href: '/insights' },
    { label: '4. PLANNING', href: '/planning' },
    { label: '5. HISTORY', href: '/history' },
  ];

  return (
    <>
      <header className="border-b border-[#243B55] bg-[#0B1E35] sticky top-0 z-40 px-6 py-3 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        {/* Brand & Dataset Selector */}
        <div className="flex items-center gap-4">
          <Link href="/globe" className="flex items-center gap-2 group">
            {/* Satellite SVG Logo */}
            <svg
              className="w-6 h-6 text-[#245BFF] group-hover:scale-105 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#245BFF" fillOpacity="0.3" stroke="currentColor" />
              <path d="M2 10h5v4H2zM17 10h5v4h-5z" />
              <line x1="7" y1="12" x2="9" y2="12" />
              <line x1="15" y1="12" x2="17" y2="12" />
              <line x1="12" y1="6" x2="12" y2="9" />
              <circle cx="12" cy="4" r="1.5" fill="currentColor" />
            </svg>
            <div>
              <span className="font-bold text-sm tracking-tight text-[#F5F7FA]">
                SATELLITE COLLISION OVERVIEW
              </span>
              <span className="text-[11px] text-[#A8B6CB] ml-2 hidden sm:inline">
                DECISION SUPPORT
              </span>
            </div>
          </Link>

          {/* Active Dataset Badge */}
          <div className="flex items-center gap-2 pl-4 border-l border-[#243B55]">
            <span className="text-[#A8B6CB] hidden md:inline">DATASET:</span>
            <button
              onClick={() => setIsDatasetOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#061426] border border-[#243B55] rounded text-[#F5F7FA] hover:border-[#245BFF] transition-colors"
              title="Click to switch active dataset"
            >
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              <span className="font-bold">{activeDataset?.filename || 'test.csv'}</span>
              <span className="text-[#A8B6CB] text-[11px] hidden lg:inline">
                ({activeDataset?.encounter_count.toLocaleString() || '2,167'} Encounters)
              </span>
              <svg className="w-3.5 h-3.5 text-[#A8B6CB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* 5 Top Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-[#061426] p-1 rounded-lg border border-[#243B55]">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3.5 py-1.5 rounded text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#245BFF] text-white shadow'
                    : 'text-[#A8B6CB] hover:text-[#F5F7FA] hover:bg-[#0B1E35]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAboutOpen(true)}
            className="px-3 py-1.5 text-[#A8B6CB] hover:text-[#F5F7FA] border border-[#243B55] hover:border-[#A8B6CB] rounded transition-colors"
          >
            About Data
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-1.5 font-bold bg-[#245BFF] hover:bg-blue-600 text-white rounded flex items-center gap-1.5 transition-colors shadow"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Import CSV</span>
          </button>
        </div>
      </header>

      {/* Modals */}
      <CsvImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      <AboutDataModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <DatasetSelectorModal isOpen={isDatasetOpen} onClose={() => setIsDatasetOpen(false)} />
    </>
  );
}
