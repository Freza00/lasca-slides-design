'use client';
import { useState } from 'react';

export function AiActionBlock({ text, detail }: { text: string; detail?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginTop: 2 }}>
      <div onClick={() => detail && setExpanded(e => !e)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: detail ? 'pointer' : 'default' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6a9bcc', flexShrink: 0, marginTop: 5 }} />
        <div style={{ fontSize: 13, color: '#141413', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 500 }}>{text}</span>
          {detail && (
            <span style={{ fontSize: 11, color: '#b0aea5', marginLeft: 8 }}>
              {expanded ? '\u25be' : '\u25b8'} {expanded ? '\u6536\u8d77' : '\u8be6\u60c5'}
            </span>
          )}
        </div>
      </div>
      {expanded && detail && (
        <div style={{ marginLeft: 15, marginTop: 4, padding: '8px 10px', background: '#f0efeb', borderRadius: 6, borderLeft: '2px solid #e8e6dc', fontSize: 12, color: '#b0aea5', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
          {detail}
        </div>
      )}
    </div>
  );
}
