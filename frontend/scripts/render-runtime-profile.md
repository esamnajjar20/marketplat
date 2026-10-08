# R13 — Runtime render profiling protocol

This stage is intentionally measurement-only. It does not add production rendering instrumentation.

Use React DevTools Profiler against a production-like build with representative data and record:

1. Conversation list: search, unread filter, flag one conversation, delete one conversation.
2. Chat window: send, retry one message, mark one message.
3. Notifications: mark one read, delete one notification.
4. Admin reports: select one row, resolve one row, paginate/filter.

For each flow capture:
- commit count;
- total commit duration;
- components rendered in the commit;
- whether unchanged rows rendered.

Acceptance targets:
- changing one row state must not render sibling rows;
- SSE-connected screens must not produce redundant high-frequency polling;
- long lists should be evaluated by DOM/layout cost before virtualization is introduced.

Do not add `why-did-you-render`, global render logging, or permanent production instrumentation solely for this audit.
