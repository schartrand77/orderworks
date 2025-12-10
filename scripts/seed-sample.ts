import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { JobStatus, FulfillmentStatus } from "../src/generated/prisma/enums";

const prisma = new PrismaClient();

async function main() {
const sampleJob = {
  id: "makerworks-sample-job",
    paymentIntentId: "pi_sample_123456",
    totalCents: 18500,
    currency: "usd",
    lineItems: [
      {
        description: "3D printed enclosure",
        quantity: 1,
        unitPriceCents: 12500,
        material: "PLA",
        fileUrl: "https://files.makerworks.app/models/controller-enclosure.3mf",
      },
      {
        description: "Laser cut acrylic panels",
        quantity: 2,
        unitPriceCents: 3000,
        color: "smoke gray",
        url: "https://files.makerworks.app/models/laser-panels.dxf",
      },
    ],
    shipping: {
      service: "UPS Ground",
      tracking: null,
      address: {
        name: "Ada Lovelace",
        street: "123 Maker Lane",
        city: "Ann Arbor",
        state: "MI",
        postalCode: "48103",
        country: "US",
      },
    },
    metadata: {
      project: "Sample MakerWorks Job",
      priority: "rush",
      approximate_print_time_hours: 6.5,
      models: [
        {
          name: "Controller shell",
          url: "https://files.makerworks.app/models/controller-shell.stl",
        },
        {
          name: "Mounting bracket",
          url: "https://files.makerworks.app/models/mounting-bracket.stl",
        },
      ],
      documentation: {
        bomUrl: "https://files.makerworks.app/docs/sample-bom.pdf",
      },
    },
    userId: "user_sample_001",
    customerEmail: "info@makerworks.app",
    makerworksCreatedAt: new Date("2025-01-01T12:00:00Z"),
    makerworksUpdatedAt: new Date("2025-01-01T12:00:00Z"),
    status: JobStatus.PENDING,
    paymentMethod: "card",
    paymentStatus: "paid",
    fulfillmentStatus: FulfillmentStatus.PENDING,
    notes:
      "Sample job inserted via npm run seed:sample.\nController jig reference: https://files.makerworks.app/models/controller-jig.stl",
  };

  const existing = await prisma.job.findUnique({
    where: { id: sampleJob.id },
  });

  let createQueuePosition: number | undefined;
  if (!existing) {
    const aggregate = await prisma.job.aggregate({ _max: { queuePosition: true } });
    createQueuePosition = (aggregate._max.queuePosition ?? 0) + 1;
  }

  const job = await prisma.job.upsert({
    where: { id: sampleJob.id },
    create:
      createQueuePosition === undefined
        ? sampleJob
        : {
            ...sampleJob,
            queuePosition: createQueuePosition,
          },
    update: sampleJob,
  });

  console.log(`Seeded sample job: ${job.id}`);
}

main()
  .catch((error) => {
    console.error("Failed to seed sample job:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
