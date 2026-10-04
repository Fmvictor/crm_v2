'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GraduationCap, Kanban, LogOut, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const nav = [
  { href: '/pipeline', label: 'Pipeline WhatsApp', icon: Kanban },
];

export function Sidebar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navigation = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegación principal">
      {nav.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700"
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-gray-100 px-4 py-4">
      {user && (
        <div className="mb-3 px-2">
          <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
      )}
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-blue-600" />
          <span className="text-base font-bold text-gray-900">Emeb CRM</span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Abrir menú"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-gray-900/30"
            onClick={() => setIsOpen(false)}
          />
          <aside id="mobile-navigation" className="relative flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-blue-600" />
                <span className="font-bold text-gray-900">Emeb CRM</span>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </button>
            </div>
            {navigation(() => setIsOpen(false))}
            {account}
          </aside>
        </div>
      )}

      <aside className="hidden min-h-dvh w-64 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-5">
          <GraduationCap className="h-7 w-7 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">Emeb CRM</span>
        </div>
        {navigation()}
        {account}
      </aside>
    </>
  );
}
