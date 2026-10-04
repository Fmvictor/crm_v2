'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, initialize } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Siempre intentar recuperar sesión desde la cookie HttpOnly al montar
    initialize().finally(() => setChecking(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!checking && !isAuthenticated) {
      router.replace('/login');
    }
  }, [checking, isAuthenticated, router]);

  if (checking || !isAuthenticated) return null;

  return (
    <div className="min-h-dvh bg-gray-50 md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
