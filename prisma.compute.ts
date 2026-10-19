import { defineComputeConfig } from '@prisma/compute-sdk/config';

export default defineComputeConfig({
  apps: {
    backend: {
      root: './backend', // يحدد أن الباك اند موجود داخل مجلد backend
      framework: 'custom', // لأننا نستخدم Express
    },
  },
});
