import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// FIX (audit #23): this used to hardcode a personal email
// (esamnajjar6@gmail.com) as the SUPER_ADMIN target — anyone running the
// script unmodified would silently grant full admin to that exact
// account if it happened to be registered. Now requires the email as a
// CLI argument, so there's no default target at all.
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: ts-node scripts/make-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`User ${user.email} is now SUPER_ADMIN`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
