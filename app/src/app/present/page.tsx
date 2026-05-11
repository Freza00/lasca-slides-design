import { Suspense } from 'react';
import { Presenter } from '@/components/present/Presenter';
import { AuthGuard } from '@/components/auth/AuthGuard';

export default function PresentPage() {
  return (
    <Suspense>
      <AuthGuard>
        <Presenter />
      </AuthGuard>
    </Suspense>
  );
}
