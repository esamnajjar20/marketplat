# package.json — ensure this script exists

If missing, add under `"scripts"`:

```json
"report:weekly-service-views": "ts-node-dev --transpile-only --exit-child src/scripts/weeklyServiceViewsReport.ts"
```

(`weeklyServiceViewsReport.ts` already exists under `src/scripts/`.)
