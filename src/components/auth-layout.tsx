'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from './bottom-nav';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <>
      <main className={isLoginPage ? '' : 'pb-16 min-h-screen'}>{children}</main>
      {!isLoginPage && <BottomNav />}
    </>
  );
}
