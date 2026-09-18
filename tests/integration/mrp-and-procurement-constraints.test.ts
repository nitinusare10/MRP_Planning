import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, createTestItem, createTestVendor, cleanupIds } from "./helpers";

describe("MRP result immutability, traceability, and procurement consolidation", () => {
  const createdUsers: string[] = [];
  const createdItems: string[] = [];
  const createdVendors: string[] = [];
  const createdDemands: string[] = [];
  const createdRuns: string[] = [];
  const createdResults: string[] = [];
  const createdDemandLinks: string[] = [];
  const createdRecommendations: string[] = [];
  const createdRequisitions: string[] = [];
  const createdRequisitionLines: string[] = [];
  const createdExceptions: string[] = [];

  afterEach(async () => {
    await cleanupIds({
      mrpException: createdExceptions.splice(0),
      purchaseRequisitionLine: createdRequisitionLines.splice(0),
      purchaseRequisition: createdRequisitions.splice(0),
      purchaseRecommendation: createdRecommendations.splice(0),
      mrpResultDemandLink: createdDemandLinks.splice(0),
      mrpResult: createdResults.splice(0),
      mrpRun: createdRuns.splice(0),
      demand: createdDemands.splice(0),
      item: createdItems.splice(0),
      vendor: createdVendors.splice(0),
      user: createdUsers.splice(0),
    });
  });

  async function fixtures() {
    const user = await createTestUser({ role: "PLANNER" });
    createdUsers.push(user.id);
    const item = await createTestItem({ itemClassification: "PURCHASED_COMPONENT" });
    createdItems.push(item.id);
    const vendor = await createTestVendor();
    createdVendors.push(vendor.id);

    const demand = await prisma.demand.create({
      data: {
        itemId: item.id,
        quantity: 500,
        requiredDate: new Date("2026-10-15"),
        demandSourceType: "MANUAL",
      },
    });
    createdDemands.push(demand.id);

    const run = await prisma.mrpRun.create({
      data: {
        runNumber: `RUN-${Date.now()}`,
        planningHorizonStart: new Date("2026-09-01"),
        planningHorizonEnd: new Date("2026-12-31"),
        timeBucket: "WEEKLY",
        triggeredById: user.id,
      },
    });
    createdRuns.push(run.id);

    const result = await prisma.mrpResult.create({
      data: {
        mrpRunId: run.id,
        itemId: item.id,
        theoreticalGrossRequirement: 500,
        scrapAdjustedGrossRequirement: 500,
        availableStockSnapshot: 200,
        usableIncomingSupplySnapshot: 100,
        netRequirement: 250,
        recommendedQuantity: 500, // MOQ-inflated
        earliestRequiredDate: new Date("2026-10-15"),
        criticalitySnapshot: "HIGH",
        shortageFlag: true,
      },
    });
    createdResults.push(result.id);

    const link = await prisma.mrpResultDemandLink.create({
      data: { mrpResultId: result.id, demandId: demand.id, quantityApplied: 500 },
    });
    createdDemandLinks.push(link.id);

    return { user, item, vendor, demand, run, result, link };
  }

  it("traces an MrpResult back to the Demand rows that produced it (requirement #12)", async () => {
    const { result, demand } = await fixtures();

    const links = await prisma.mrpResultDemandLink.findMany({ where: { mrpResultId: result.id } });
    expect(links).toHaveLength(1);
    expect(links[0]?.demandId).toBe(demand.id);
    expect(links[0]?.quantityApplied.toString()).toBe("500");
  });

  it("forbids updating an MrpResult once written (requirement #11)", async () => {
    const { result } = await fixtures();

    await expect(
      prisma.mrpResult.update({ where: { id: result.id }, data: { netRequirement: 999 } }),
    ).rejects.toThrow();
  });

  it("forbids deleting an MrpResult once written (requirement #11)", async () => {
    const { result } = await fixtures();

    await expect(prisma.mrpResult.delete({ where: { id: result.id } })).rejects.toThrow();
  });

  it("forbids modifying an MrpRun once it has finished (requirement #11)", async () => {
    const { run } = await fixtures();

    const finished = await prisma.mrpRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", runEndedAt: new Date() },
    });
    expect(finished.status).toBe("COMPLETED");

    await expect(
      prisma.mrpRun.update({ where: { id: run.id }, data: { engineVersion: "v2" } }),
    ).rejects.toThrow();
  });

  it("allows many approved recommendations for one vendor to consolidate into a single requisition (requirement #10)", async () => {
    const { user, item, vendor, result } = await fixtures();

    // A second item + result + recommendation, same vendor, to prove consolidation.
    const item2 = await createTestItem({ itemClassification: "PURCHASED_COMPONENT" });
    createdItems.push(item2.id);
    const run2 = await prisma.mrpRun.create({
      data: {
        runNumber: `RUN-${Date.now()}-2`,
        planningHorizonStart: new Date("2026-09-01"),
        planningHorizonEnd: new Date("2026-12-31"),
        timeBucket: "WEEKLY",
        triggeredById: user.id,
      },
    });
    createdRuns.push(run2.id);
    const result2 = await prisma.mrpResult.create({
      data: {
        mrpRunId: run2.id,
        itemId: item2.id,
        theoreticalGrossRequirement: 300,
        scrapAdjustedGrossRequirement: 300,
        availableStockSnapshot: 0,
        usableIncomingSupplySnapshot: 0,
        netRequirement: 300,
        recommendedQuantity: 300,
        earliestRequiredDate: new Date("2026-10-15"),
        criticalitySnapshot: "MEDIUM",
        shortageFlag: true,
      },
    });
    createdResults.push(result2.id);

    const rec1 = await prisma.purchaseRecommendation.create({
      data: {
        mrpResultId: result.id,
        itemId: item.id,
        recommendedVendorId: vendor.id,
        recommendedQuantity: 500,
        requiredDate: new Date("2026-10-15"),
        shortageQuantity: 250,
        criticality: "HIGH",
        status: "APPROVED",
      },
    });
    createdRecommendations.push(rec1.id);

    const rec2 = await prisma.purchaseRecommendation.create({
      data: {
        mrpResultId: result2.id,
        itemId: item2.id,
        recommendedVendorId: vendor.id,
        recommendedQuantity: 300,
        requiredDate: new Date("2026-10-15"),
        shortageQuantity: 300,
        criticality: "MEDIUM",
        status: "APPROVED",
      },
    });
    createdRecommendations.push(rec2.id);

    const requisition = await prisma.purchaseRequisition.create({
      data: {
        requisitionNumber: `REQ-${Date.now()}`,
        vendorId: vendor.id,
        createdById: user.id,
        status: "DRAFT",
      },
    });
    createdRequisitions.push(requisition.id);

    const line1 = await prisma.purchaseRequisitionLine.create({
      data: {
        purchaseRequisitionId: requisition.id,
        purchaseRecommendationId: rec1.id,
        itemId: item.id,
        quantity: 500,
        requiredDate: new Date("2026-10-15"),
      },
    });
    createdRequisitionLines.push(line1.id);

    // Both recommendations land on the SAME requisition — proving one
    // recommendation never automatically forces its own PO.
    const line2 = await prisma.purchaseRequisitionLine.create({
      data: {
        purchaseRequisitionId: requisition.id,
        purchaseRecommendationId: rec2.id,
        itemId: item2.id,
        quantity: 300,
        requiredDate: new Date("2026-10-15"),
      },
    });
    createdRequisitionLines.push(line2.id);

    const lines = await prisma.purchaseRequisitionLine.findMany({
      where: { purchaseRequisitionId: requisition.id },
    });
    expect(lines).toHaveLength(2);
  });

  it("rejects converting the same recommendation into a requisition line twice (requirement #10)", async () => {
    const { user, item, vendor, result } = await fixtures();

    const rec = await prisma.purchaseRecommendation.create({
      data: {
        mrpResultId: result.id,
        itemId: item.id,
        recommendedVendorId: vendor.id,
        recommendedQuantity: 500,
        requiredDate: new Date("2026-10-15"),
        shortageQuantity: 250,
        criticality: "HIGH",
        status: "APPROVED",
      },
    });
    createdRecommendations.push(rec.id);

    const requisition = await prisma.purchaseRequisition.create({
      data: { requisitionNumber: `REQ-${Date.now()}`, vendorId: vendor.id, createdById: user.id },
    });
    createdRequisitions.push(requisition.id);

    const line1 = await prisma.purchaseRequisitionLine.create({
      data: {
        purchaseRequisitionId: requisition.id,
        purchaseRecommendationId: rec.id,
        itemId: item.id,
        quantity: 500,
        requiredDate: new Date("2026-10-15"),
      },
    });
    createdRequisitionLines.push(line1.id);

    await expect(
      prisma.purchaseRequisitionLine.create({
        data: {
          purchaseRequisitionId: requisition.id,
          purchaseRecommendationId: rec.id, // same recommendation again
          itemId: item.id,
          quantity: 100,
          requiredDate: new Date("2026-10-15"),
        },
      }),
    ).rejects.toThrow();
  });

  it("records an MrpException tied to both an item and a run (requirement #13)", async () => {
    const { item, run } = await fixtures();

    const exception = await prisma.mrpException.create({
      data: {
        mrpRunId: run.id,
        itemId: item.id,
        exceptionType: "CRITICAL_SHORTAGE",
        severity: "CRITICAL",
        details: "Net requirement exceeds usable supply before the required date.",
      },
    });
    createdExceptions.push(exception.id);

    expect(exception.status).toBe("OPEN");
  });

  it("allows an MrpException with no run (a static data-quality finding) (requirement #13)", async () => {
    const item = await createTestItem({ itemClassification: "SUB_ASSEMBLY" });
    createdItems.push(item.id);

    const exception = await prisma.mrpException.create({
      data: {
        itemId: item.id,
        exceptionType: "MISSING_BOM",
        severity: "WARNING",
        details: "Item is a Sub-Assembly with no BOM defined.",
      },
    });
    createdExceptions.push(exception.id);

    expect(exception.mrpRunId).toBeNull();
  });
});
