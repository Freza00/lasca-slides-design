import { Suspense } from 'react';
import { Editor } from '@/components/editor/Editor';
import { AuthGuard } from '@/components/auth/AuthGuard';

export default function EditorPage() {
  return (
    <Suspense>
      <AuthGuard>
        <Editor />
      </AuthGuard>
    </Suspense>
  );
}
