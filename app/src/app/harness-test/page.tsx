import { Suspense } from 'react';
import { HarnessTestClient } from './HarnessTestClient';

export default function HarnessTestPage() {
  return (
    <Suspense>
      <HarnessTestClient />
    </Suspense>
  );
}
