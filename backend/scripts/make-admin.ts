import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.update({
    where: {
      email: "esamnajjar6@gmail.com",
    },
    data: {
      role: "ADMIN",
    },
  });

  console.log("User is now ADMIN");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
