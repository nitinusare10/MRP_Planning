import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser, createTestItem, cleanupIds } from "./helpers";

describe("Bom constraints", () => {
  const createdUsers: string[] = [];
  const createdItems: string[] = [];
  const createdBoms: string[] = [];
  const createdComponents: string[] = [];

  afterEach(async () => {
    await cleanupIds({
      bomComponent: createdComponents.splice(0),
      bom: createdBoms.splice(0),
      item: createdItems.splice(0),
      user: createdUsers.splice(0),
    });
  });

  async function fixtures() {
    const user = await createTestUser();
    createdUsers.push(user.id);
    const parent = await createTestItem({ itemClassification: "FINISHED_GOOD" });
    createdItems.push(parent.id);
    const component = await createTestItem({ itemClassification: "RAW_MATERIAL" });
    createdItems.push(component.id);
    return { user, parent, component };
  }

  it("rejects a second BOM with the same parentItemId + revision (requirement #1)", async () => {
    const { user, parent } = await fixtures();

    const first = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
      },
    });
    createdBoms.push(first.id);

    await expect(
      prisma.bom.create({
        data: {
          bomCode: `BOM-${parent.sku}-A-dup-${Date.now()}`,
          parentItemId: parent.id,
          revision: "A",
          createdById: user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects overlapping effective date ranges between two APPROVED revisions (requirement #2)", async () => {
    const { user, parent } = await fixtures();

    const revA = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: new Date("2026-06-30"),
      },
    });
    createdBoms.push(revA.id);

    await expect(
      prisma.bom.create({
        data: {
          bomCode: `BOM-${parent.sku}-B-${Date.now()}`,
          parentItemId: parent.id,
          revision: "B",
          createdById: user.id,
          status: "APPROVED",
          approvedById: user.id,
          approvedAt: new Date(),
          effectiveFrom: new Date("2026-06-01"), // overlaps revA's range
        },
      }),
    ).rejects.toThrow();
  });

  it("allows a non-overlapping APPROVED revision after the previous one ends", async () => {
    const { user, parent } = await fixtures();

    const revA = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: new Date("2026-06-30"),
      },
    });
    createdBoms.push(revA.id);

    const revB = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-B-${Date.now()}`,
        parentItemId: parent.id,
        revision: "B",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-07-01"),
      },
    });
    createdBoms.push(revB.id);

    expect(revB.id).toBeDefined();
  });

  it("forbids modifying a defining field of an APPROVED BOM (requirement #3)", async () => {
    const { user, parent } = await fixtures();

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    createdBoms.push(bom.id);

    await expect(
      prisma.bom.update({ where: { id: bom.id }, data: { revision: "A2" } }),
    ).rejects.toThrow();
  });

  it("forbids deleting an APPROVED BOM (requirement #3)", async () => {
    const { user, parent } = await fixtures();

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    createdBoms.push(bom.id);

    await expect(prisma.bom.delete({ where: { id: bom.id } })).rejects.toThrow();
  });

  it("allows transitioning an APPROVED BOM to OBSOLETE", async () => {
    const { user, parent } = await fixtures();

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        effectiveFrom: new Date("2026-01-01"),
      },
    });
    createdBoms.push(bom.id);

    const obsoleted = await prisma.bom.update({
      where: { id: bom.id },
      data: { status: "OBSOLETE", obsoletedById: user.id, obsoletedAt: new Date() },
    });

    expect(obsoleted.status).toBe("OBSOLETE");
  });

  it("rejects a component that would create a circular BOM (requirement #4)", async () => {
    const { user, parent, component } = await fixtures();

    // parent's BOM includes `component`...
    const parentBom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
      },
    });
    createdBoms.push(parentBom.id);

    const line1 = await prisma.bomComponent.create({
      data: {
        bomId: parentBom.id,
        lineNumber: 1,
        componentItemId: component.id,
        quantityPer: 1,
        uom: "PCS",
      },
    });
    createdComponents.push(line1.id);

    // ...so `component`'s own BOM must not be allowed to include `parent`.
    const componentBom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${component.sku}-A-${Date.now()}`,
        parentItemId: component.id,
        revision: "A",
        createdById: user.id,
      },
    });
    createdBoms.push(componentBom.id);

    await expect(
      prisma.bomComponent.create({
        data: {
          bomId: componentBom.id,
          lineNumber: 1,
          componentItemId: parent.id,
          quantityPer: 1,
          uom: "PCS",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an item being a component of its own BOM directly", async () => {
    const { user, parent } = await fixtures();

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
      },
    });
    createdBoms.push(bom.id);

    await expect(
      prisma.bomComponent.create({
        data: {
          bomId: bom.id,
          lineNumber: 1,
          componentItemId: parent.id,
          quantityPer: 1,
          uom: "PCS",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a scrapPercentage outside [0, 1)", async () => {
    const { user, parent, component } = await fixtures();

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-${parent.sku}-A-${Date.now()}`,
        parentItemId: parent.id,
        revision: "A",
        createdById: user.id,
      },
    });
    createdBoms.push(bom.id);

    await expect(
      prisma.bomComponent.create({
        data: {
          bomId: bom.id,
          lineNumber: 1,
          componentItemId: component.id,
          quantityPer: 1,
          uom: "PCS",
          scrapPercentage: 1, // must be < 1
        },
      }),
    ).rejects.toThrow();
  });
});
