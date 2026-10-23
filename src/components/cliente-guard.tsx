'use client';

/**
 * Segunda proteção (a primeira é o middleware): cliente externo só usa o
 * portal. Se cair em outra tela, por exemplo no primeiro acesso antes de a
 * pessoa ser vinculada ao login, vai para /portal sem precisar de F5.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useData } from '@/lib/data-store';

export function ClienteGuard() {
  const { viewerRole } = useData();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (viewerRole === 'cliente' && !pathname.startsWith('/portal')) router.replace('/portal');
  }, [viewerRole, pathname, router]);
  return null;
}
