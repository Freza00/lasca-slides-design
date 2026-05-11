import { Suspense } from 'react';
import { WorksGallery } from '@/components/works/WorksGallery';

export default function WorksPage() {
  return (
    <Suspense>
      <WorksGallery />
    </Suspense>
  );
}
