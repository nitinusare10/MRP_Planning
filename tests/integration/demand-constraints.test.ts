import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, createTestItem, cleanupIds } from "./helpers";

describe("Demand source uniqueness and validity (requirement #9)", () => {
  const createdUsers: string[] = [];
  const createdItems: string[] = [];
  const createdDemands: string[] = [];
  const createdPlanLines: string[] = [];
  const createdPlans: string[] = [];

  afterEach(async () => {
    await cleanupIds({
      demand: createdDemands.splice(0),
      productionPlanLine: createdPlanLines.splice(0),
      productionPlan: createdPlans.splice(0),
      item: createdItems.splice(0),
      user: createdUsers.splice(0),
    });
  });

  async function fixtures() {
    const user = await createTestUser({ role: "PLANNER" });
    createdUsers.push(user.id);
    const item = await createTestItem({ itemClassification: "FINISHED_GOOD" });
    createdItems.push(item.id);
    const plan = await prisma.productionPlan.create({
      data: {
        planCode: `PP-${Date.now()}`,
        planName: "Test plan",
        horizonStartDate: new Date("2026-01-01"),
        horizonEndDate: new Date("2026-03-31"),
        createdById: user.id,
      },
    });
    createdPlans.push(plan.id);
    const planLine = await prisma.productionPlanLine.create({
      data: {
        productionPlanId: plan.id,
        itemId: item.id,
        quantity: 100,
        requiredDate: new Date("2026-02-01"),
      },
    });
    createdPlanLines.push(planLine.id);
    return { user, item, plan, planLine };
  }

  it("rejects a second Demand row generated from the same ProductionPlanLine", async () => {
    const { item, planLine } = await fixtures();

    const first = await prisma.demand.create({
      data: {
        itemId: item.id,
        quantity: 100,
        requiredDate: new Date("2026-02-01"),
        demandSourceType: "PRODUCTION_PLAN",
        productionPlanLineId: planLine.id,
      },
    });
    createdDemands.push(first.id);

    await expect(
      prisma.demand.create({
        data: {
          itemId: item.id,
          quantity: 100,
          requiredDate: new Date("2026-02-01"),
          demandSourceType: "PRODUCTION_PLAN",
          productionPlanLineId: planLine.id, // same source line again
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects demandSourceType=PRODUCTION_PLAN without a productionPlanLineId", async () => {
    const { item } = await fixtures();

    await expect(
      prisma.demand.create({
        data: {
          itemId: item.id,
          quantity: 50,
          requiredDate: new Date("2026-02-01"),
          demandSourceType: "PRODUCTION_PLAN",
          // productionPlanLineId intentionally omitted
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects MANUAL demand that also sets a productionPlanLineId", async () => {
    const { item, planLine } = await fixtures();

    await expect(
      prisma.demand.create({
        data: {
          itemId: item.id,
          quantity: 50,
          requiredDate: new Date("2026-02-01"),
          demandSourceType: "MANUAL",
          productionPlanLineId: planLine.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows unlimited MANUAL demand rows with no source reference", async () => {
    const { item } = await fixtures();

    const first = await prisma.demand.create({
      data: {
        itemId: item.id,
        quantity: 10,
        requiredDate: new Date("2026-02-01"),
        demandSourceType: "MANUAL",
      },
    });
    createdDemands.push(first.id);

    const second = await prisma.demand.create({
      data: {
        itemId: item.id,
        quantity: 20,
        requiredDate: new Date("2026-02-15"),
        demandSourceType: "MANUAL",
      },
    });
    createdDemands.push(second.id);

    expect(second.id).not.toBe(first.id);
  });
});
