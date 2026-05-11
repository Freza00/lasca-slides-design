import { Suspense } from 'react';
import { CreateFlow } from '@/components/create/CreateFlow';
import { AuthGuard } from '@/components/auth/AuthGuard';

export default function CreatePage() {
  return (
    <Suspense>
      <AuthGuard>
        <CreateFlow />
      </AuthGuard>
    </Suspense>
  );
}
