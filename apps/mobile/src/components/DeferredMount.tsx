import { useEffect, useState, type ReactNode } from 'react';
import { deferToIdle } from '@/lib/idle';

/**
 * يؤجّل تركيب أعمال خلفية (جسور المزامنة...) إلى ما بعد أول رسم، حتى لا تتنافس مع
 * أول شاشة على JS thread وSQLite عند الإقلاع. لا يُستعمل لما يلزم قبل أول تفاعل (auth، push).
 */
export function DeferredMount({ children, delayMs = 400 }: { children: ReactNode; delayMs?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => deferToIdle(() => setReady(true), { delayMs }), [delayMs]);
  return ready ? <>{children}</> : null;
}
