import { Suspense } from 'react';
import { RegisterFlow } from '@/components/auth/RegisterFlow';

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterFlow />
    </Suspense>
  );
}
