import { Suspense } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ProfilePage } from '@/components/auth/ProfilePage';

export default function Profile() {
  return (
    <Suspense>
      <AuthGuard>
        <ProfilePage />
      </AuthGuard>
    </Suspense>
  );
}
