'use client';

// ============================================================================
// /harness-test — 独立测试页面，用于端到端验证 harness 流程
// ============================================================================
// 零风险：不碰 ChatPanel、不碰 Editor。只调新 API，渲染事件流。
// 用户可以点"应用到编辑器"把生成结果塞回 store。
// ============================================================================

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { withSessionHeaders } from '@/lib/clientApi';
import type { Slide } from '@/lib/types';
import type {
  HarnessEvent,
  ClarifierQuestion,
  ClarifierAnswers,
  HarnessPlan,
  RuleReport,
  StylePresetId,
  WorkflowType,
} from '@/lib/ai/harness/types';

type LogEntry = { t: number; event: HarnessEvent };

export function HarnessTestClient() {
  const router = useRouter();
  const replaceAllSlides = useEditorStore((s) => s.replaceAllSlides);

  const [rawInput, setRawInput] = useState(
    'Q3 业绩复盘：ARR 从 2M 涨到 3.5M，净留存 92%，北美客户增长 180%，下个季度聚焦企业客户扩张。',
  );
  const [workflow] = useState<WorkflowType>('generate-from-draft');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<ClarifierQuestion[] | null>(null);
  const [answers, setAnswers] = useState<ClarifierAnswers>({});
  const [plan, setPlan] = useState<HarnessPlan | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [report, setReport] = useState<RuleReport | null>(null);
  const [showViolations, setShowViolations] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const push = (event: HarnessEvent) => {
    setLog((l) => [...l, { t: Date.now(), event }]);
  };

  const reset = () => {
    setLog([]);
    setPendingQuestions(null);
    setPlan(null);
    setSlides([]);
    setReport(null);
    setShowViolations(false);
  };

  const run = async (clarifierAnswers?: ClarifierAnswers, skipClarifier = false) => {
    reset();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workflow,
          rawInput,
          clarifierAnswers: clarifierAnswers ?? answers,
          skipClarifier,
        }),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload) as HarnessEvent;
            push(event);
            handleEvent(event);
          } catch (e) {
            console.warn('parse fail', e, payload);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleEvent = (e: HarnessEvent) => {
    switch (e.type) {
      case 'clarify-needed':
        setPendingQuestions(e.questions);
        break;
      case 'plan':
        setPlan(e.plan);
        break;
      case 'violations':
        setReport(e.data.report);
        break;
      case 'done':
        setSlides(e.data.slides);
        setReport(e.data.report);
        setPendingQuestions(null);
        break;
    }
  };

  const answerAndContinue = () => {
    if (!pendingQuestions) return;
    // Gather current answers (assume all questions answered)
    void run(answers);
  };

  const applyToEditor = () => {
    if (slides.length === 0) return;
    replaceAllSlides(slides);
    router.push('/editor');
  };

  const abort = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Harness 测试台</h1>
        <p style={styles.sub}>
          端到端验证 clarifier → plan → generate → validate → fix → done 全流程
        </p>
      </div>

      <section style={styles.section}>
        <label style={styles.label}>草稿 / 原始输入</label>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          rows={6}
          style={styles.textarea}
          disabled={running}
        />
        <div style={styles.btnRow}>
          <button onClick={() => run()} disabled={running || !rawInput.trim()} style={styles.primary}>
            {running ? '运行中…' : '开始（走 clarifier）'}
          </button>
          <button
            onClick={() => run({ audience: 'boss', length: 5, preset: 'warm' }, true)}
            disabled={running || !rawInput.trim()}
            style={styles.secondary}
          >
            跳过 clarifier（默认 warm · 5 页 · boss）
          </button>
          {running && (
            <button onClick={abort} style={styles.danger}>
              中止
            </button>
          )}
        </div>
      </section>

      {pendingQuestions && pendingQuestions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>需要澄清</h2>
          {pendingQuestions.map((q) => (
            <div key={q.id} style={styles.qBlock}>
              <div style={styles.qText}>
                <span style={styles.chip}>{q.header}</span> {q.question}
              </div>
              <div style={styles.optRow}>
                {q.options.map((o) => {
                  const selected = answers[q.id] === o.value;
                  return (
                    <button
                      key={String(o.value)}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))}
                      style={{
                        ...styles.opt,
                        ...(selected ? styles.optSelected : {}),
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={answerAndContinue} style={styles.primary} disabled={running}>
            就这么干 →
          </button>
        </section>
      )}

      {plan && (
        <section style={styles.section}>
          <h2 style={styles.h2}>执行计划</h2>
          <div style={styles.planCard}>
            <div style={styles.planSummary}>{plan.summary}</div>
            <ol style={styles.planSteps}>
              {plan.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div style={styles.planMeta}>
              预估成本 {plan.estimatedCostUsd ? `$${plan.estimatedCostUsd.toFixed(3)}` : '—'} · 时长{' '}
              {plan.estimatedDurationSec ? `${plan.estimatedDurationSec}s` : '—'}
            </div>
          </div>
        </section>
      )}

      {report && (
        <section style={styles.section}>
          <h2 style={styles.h2}>
            校验报告 {report.pass ? '✅ 通过' : '⚠️ 有违规'}
          </h2>
          <button onClick={() => setShowViolations((v) => !v)} style={styles.secondary}>
            {showViolations ? '折叠' : '展开'}违规清单（{report.violations.length}）
          </button>
          {showViolations && (
            <div style={styles.violations}>
              {report.violations.map((v, i) => (
                <div key={i} style={styles.violation}>
                  <span
                    style={{
                      ...styles.sev,
                      background: v.severity === 'error' ? '#b91c1c' : '#b45309',
                    }}
                  >
                    {v.severity}
                  </span>
                  <span style={styles.vPage}>p{v.pageIndex + 1}</span>
                  <code style={styles.vRule}>{v.ruleId}</code>
                  <span>{v.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {slides.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>生成结果（{slides.length} 页）</h2>
          <div style={styles.slideGrid}>
            {slides.map((s, i) => (
              <div key={i} style={styles.slideCard}>
                <div style={styles.slideIdx}>#{i + 1}</div>
                <div style={styles.slideLayout}>{s.layout}</div>
                <pre style={styles.slideJson}>{JSON.stringify(s.data, null, 2).slice(0, 240)}</pre>
              </div>
            ))}
          </div>
          <button onClick={applyToEditor} style={styles.primary}>
            应用到编辑器 →
          </button>
        </section>
      )}

      <section style={styles.section}>
        <h2 style={styles.h2}>事件流 ({log.length})</h2>
        <div style={styles.logBox}>
          {log.map((l, i) => (
            <div key={i} style={styles.logRow}>
              <span style={styles.logType}>{l.event.type}</span>
              <span style={styles.logPayload}>
                {JSON.stringify(l.event).slice(0, 200)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 24px 80px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    color: '#1f1d17',
    background: '#faf9f5',
    minHeight: '100vh',
  },
  header: { marginBottom: 24 },
  h1: { fontSize: 28, fontWeight: 700, margin: 0 },
  sub: { color: '#6b6658', marginTop: 4, fontSize: 14 },
  section: {
    background: '#fff',
    border: '1px solid #e8e4d8',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  h2: { fontSize: 16, fontWeight: 600, margin: '0 0 12px' },
  label: { fontSize: 13, color: '#6b6658', display: 'block', marginBottom: 6 },
  textarea: {
    width: '100%',
    border: '1px solid #e0dccf',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  btnRow: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  primary: {
    background: '#c2410c',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondary: {
    background: '#f3eee1',
    color: '#1f1d17',
    border: '1px solid #e0dccf',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  danger: {
    background: '#fee2e2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  qBlock: { marginBottom: 16 },
  qText: { fontSize: 14, marginBottom: 8 },
  chip: {
    display: 'inline-block',
    background: '#fff7ed',
    color: '#c2410c',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    marginRight: 6,
  },
  optRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  opt: {
    background: '#fff',
    border: '1px solid #e0dccf',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
  optSelected: { background: '#c2410c', color: '#fff', borderColor: '#c2410c' },
  planCard: { background: '#fff7ed', borderRadius: 8, padding: 14 },
  planSummary: { fontWeight: 600, marginBottom: 8 },
  planSteps: { margin: '0 0 8px', paddingLeft: 20, fontSize: 13, color: '#4b4638' },
  planMeta: { fontSize: 12, color: '#8a8470' },
  violations: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 },
  violation: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 12,
    padding: '4px 0',
  },
  sev: { color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 10 },
  vPage: { color: '#6b6658', fontSize: 11 },
  vRule: { background: '#f3eee1', padding: '1px 4px', borderRadius: 3, fontSize: 11 },
  slideGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10,
    marginBottom: 12,
  },
  slideCard: {
    border: '1px solid #e8e4d8',
    borderRadius: 8,
    padding: 10,
    background: '#fafaf7',
  },
  slideIdx: { fontSize: 11, color: '#8a8470' },
  slideLayout: { fontSize: 13, fontWeight: 600, marginBottom: 4 },
  slideJson: {
    fontSize: 10,
    color: '#4b4638',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: 0,
    maxHeight: 120,
    overflow: 'hidden',
  },
  logBox: {
    background: '#1f1d17',
    color: '#e8e4d8',
    borderRadius: 8,
    padding: 12,
    fontSize: 11,
    fontFamily: 'ui-monospace, monospace',
    maxHeight: 280,
    overflow: 'auto',
  },
  logRow: { display: 'flex', gap: 8, padding: '2px 0' },
  logType: { color: '#fb923c', minWidth: 90 },
  logPayload: { color: '#d4cfbe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
