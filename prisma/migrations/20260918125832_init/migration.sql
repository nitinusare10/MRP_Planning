-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PLANNER', 'PROCUREMENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "ItemUomType" AS ENUM ('DISCRETE', 'CONTINUOUS');

-- CreateEnum
CREATE TYPE "MrpPlanningStatus" AS ENUM ('PLANNED', 'NOT_PLANNED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ItemClassification" AS ENUM ('RAW_MATERIAL', 'PURCHASED_COMPONENT', 'SUB_ASSEMBLY', 'FINISHED_GOOD');

-- CreateEnum
CREATE TYPE "PlanningMethod" AS ENUM ('MRP', 'REORDER_POINT', 'NOT_PLANNED');

-- CreateEnum
CREATE TYPE "MakeOrBuy" AS ENUM ('MAKE', 'BUY');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "DemandSourceType" AS ENUM ('PRODUCTION_PLAN', 'SALES_ORDER', 'MANUAL', 'FORECAST');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SyncEntityType" AS ENUM ('ITEM', 'VENDOR', 'WAREHOUSE', 'STOCK', 'PURCHASE_ORDER', 'SALES_ORDER', 'PURCHASE_RECEIPT');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ZohoConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MrpRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MrpTimeBucket" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PurchaseRecommendationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PurchaseRequisitionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT_TO_ZOHO', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MrpExceptionType" AS ENUM ('CRITICAL_SHORTAGE', 'MATERIAL_SHORTAGE', 'MISSING_BOM', 'NO_APPROVED_BOM', 'MISSING_PLANNING_PARAMETERS', 'NO_APPROVED_VENDOR', 'PO_OVERDUE', 'INCOMING_PO_AFTER_REQUIRED_DATE', 'BELOW_SAFETY_STOCK', 'EXCESS_INVENTORY', 'MOQ_INDUCED_EXCESS', 'LEAD_TIME_RISK');

-- CreateEnum
CREATE TYPE "MrpExceptionSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "MrpExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoItemId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "uom" TEXT NOT NULL,
    "uomType" "ItemUomType" NOT NULL,
    "zohoItemType" TEXT NOT NULL,
    "zohoStatus" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "mrpPlanningStatus" "MrpPlanningStatus" NOT NULL DEFAULT 'NOT_PLANNED',
    "itemClassification" "ItemClassification" NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpParameter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "planningMethod" "PlanningMethod" NOT NULL,
    "makeOrBuy" "MakeOrBuy" NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "moq" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "orderMultiple" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "safetyStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "criticality" "Criticality" NOT NULL,
    "preferredVendorId" UUID,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "plannerOwnerId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MrpParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoVendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "paymentTerms" TEXT,
    "zohoStatus" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoWarehouseId" TEXT NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "zohoStatus" TEXT NOT NULL,
    "usableForMrp" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bomCode" TEXT NOT NULL,
    "parentItemId" UUID NOT NULL,
    "revision" TEXT NOT NULL,
    "description" TEXT,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "isCurrentRevision" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "obsoletedById" UUID,
    "obsoletedAt" TIMESTAMP(3),
    "revisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomComponent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bomId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "componentItemId" UUID NOT NULL,
    "quantityPer" DECIMAL(18,6) NOT NULL,
    "uom" TEXT NOT NULL,
    "scrapPercentage" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "operationSequence" TEXT,
    "referenceDesignator" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVendor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "vendorItemCode" TEXT,
    "vendorPrice" DECIMAL(14,4),
    "currency" TEXT,
    "vendorLeadTimeDays" INTEGER,
    "vendorMoq" DECIMAL(18,6),
    "vendorOrderMultiple" DECIMAL(18,6),
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(18,6) NOT NULL,
    "quantityAvailable" DECIMAL(18,6),
    "quantityCommitted" DECIMAL(18,6),
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoPoId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "currency" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoPoLineId" TEXT NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "orderedQuantity" DECIMAL(18,6) NOT NULL,
    "receivedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "pendingQuantity" DECIMAL(18,6) NOT NULL,
    "rate" DECIMAL(14,4),
    "expectedDeliveryDate" DATE NOT NULL,
    "lineStatus" TEXT NOT NULL,
    "usableForMrp" BOOLEAN NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoReceiptId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "vendorId" UUID NOT NULL,
    "receivedDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoReceiptLineId" TEXT NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID,
    "itemId" UUID NOT NULL,
    "quantityReceived" DECIMAL(18,6) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoSoId" TEXT NOT NULL,
    "soNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "orderDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoSoLineId" TEXT NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "shippedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "expectedShipmentDate" DATE,
    "status" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "syncEntityType" "SyncEntityType" NOT NULL,
    "runStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runEndedAt" TIMESTAMP(3),
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "recordsProcessed" INTEGER,
    "recordsCreated" INTEGER,
    "recordsUpdated" INTEGER,
    "recordsFailed" INTEGER,
    "errorDetails" TEXT,
    "triggerType" "SyncTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "triggeredByUserId" UUID,
    "lastPageCursor" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZohoConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoOrganizationId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "apiDomain" TEXT NOT NULL,
    "connectedById" UUID NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt" TIMESTAMP(3),
    "status" "ZohoConnectionStatus" NOT NULL DEFAULT 'CONNECTED',

    CONSTRAINT "ZohoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planCode" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "horizonStartDate" DATE NOT NULL,
    "horizonEndDate" DATE NOT NULL,
    "status" "ProductionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "productionPlanId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "requiredDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "requiredDate" DATE NOT NULL,
    "demandSourceType" "DemandSourceType" NOT NULL,
    "productionPlanLineId" UUID,
    "salesOrderLineId" UUID,
    "status" "DemandStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runNumber" TEXT NOT NULL,
    "runStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runEndedAt" TIMESTAMP(3),
    "planningHorizonStart" DATE NOT NULL,
    "planningHorizonEnd" DATE NOT NULL,
    "timeBucket" "MrpTimeBucket" NOT NULL,
    "triggeredById" UUID NOT NULL,
    "status" "MrpRunStatus" NOT NULL DEFAULT 'RUNNING',
    "engineVersion" TEXT,
    "errorDetails" TEXT,

    CONSTRAINT "MrpRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpResult" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mrpRunId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "bomId" UUID,
    "bomExplosionLevel" INTEGER NOT NULL DEFAULT 0,
    "theoreticalGrossRequirement" DECIMAL(18,6) NOT NULL,
    "scrapPercentageApplied" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "scrapAdjustedGrossRequirement" DECIMAL(18,6) NOT NULL,
    "safetyStockApplied" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "availableStockSnapshot" DECIMAL(18,6) NOT NULL,
    "usableIncomingSupplySnapshot" DECIMAL(18,6) NOT NULL,
    "netRequirement" DECIMAL(18,6) NOT NULL,
    "moqApplied" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "orderMultipleApplied" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "recommendedQuantity" DECIMAL(18,6) NOT NULL,
    "earliestRequiredDate" DATE NOT NULL,
    "vendorLeadTimeDaysApplied" INTEGER,
    "latestPoReleaseDate" DATE,
    "criticalitySnapshot" "Criticality" NOT NULL,
    "shortageFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrpResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpResultPeriod" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mrpResultId" UUID NOT NULL,
    "periodStartDate" DATE NOT NULL,
    "grossRequirement" DECIMAL(18,6) NOT NULL,
    "scheduledReceipts" DECIMAL(18,6) NOT NULL,
    "projectedOnHand" DECIMAL(18,6) NOT NULL,
    "netRequirement" DECIMAL(18,6) NOT NULL,
    "plannedOrderReceipt" DECIMAL(18,6) NOT NULL,
    "plannedOrderRelease" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "MrpResultPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpResultDemandLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mrpResultId" UUID NOT NULL,
    "demandId" UUID NOT NULL,
    "quantityApplied" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "MrpResultDemandLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRecommendation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mrpResultId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "recommendedVendorId" UUID,
    "recommendedQuantity" DECIMAL(18,6) NOT NULL,
    "requiredDate" DATE NOT NULL,
    "latestReleaseDate" DATE,
    "shortageQuantity" DECIMAL(18,6) NOT NULL,
    "criticality" "Criticality" NOT NULL,
    "status" "PurchaseRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requisitionNumber" TEXT NOT NULL,
    "vendorId" UUID NOT NULL,
    "status" "PurchaseRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "zohoPoId" TEXT,
    "zohoPoNumber" TEXT,
    "pushedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisitionLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseRequisitionId" UUID NOT NULL,
    "purchaseRecommendationId" UUID,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(14,4),
    "requiredDate" DATE NOT NULL,

    CONSTRAINT "PurchaseRequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpException" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mrpRunId" UUID,
    "itemId" UUID NOT NULL,
    "exceptionType" "MrpExceptionType" NOT NULL,
    "severity" "MrpExceptionSeverity" NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" UUID,
    "details" TEXT,
    "status" "MrpExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "MrpException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultPlanningHorizonDays" INTEGER NOT NULL DEFAULT 90,
    "defaultTimeBucket" "MrpTimeBucket" NOT NULL DEFAULT 'WEEKLY',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'INR',
    "workingDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]',
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MrpSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Item_zohoItemId_key" ON "Item"("zohoItemId");

-- CreateIndex
CREATE INDEX "Item_sku_idx" ON "Item"("sku");

-- CreateIndex
CREATE INDEX "Item_itemClassification_mrpPlanningStatus_idx" ON "Item"("itemClassification", "mrpPlanningStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MrpParameter_itemId_key" ON "MrpParameter"("itemId");

-- CreateIndex
CREATE INDEX "MrpParameter_makeOrBuy_idx" ON "MrpParameter"("makeOrBuy");

-- CreateIndex
CREATE INDEX "MrpParameter_criticality_idx" ON "MrpParameter"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_zohoVendorId_key" ON "Vendor"("zohoVendorId");

-- CreateIndex
CREATE INDEX "Vendor_vendorName_idx" ON "Vendor"("vendorName");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_zohoWarehouseId_key" ON "Warehouse"("zohoWarehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_bomCode_key" ON "Bom"("bomCode");

-- CreateIndex
CREATE INDEX "Bom_parentItemId_status_idx" ON "Bom"("parentItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_parentItemId_revision_key" ON "Bom"("parentItemId", "revision");

-- CreateIndex
CREATE INDEX "BomComponent_componentItemId_idx" ON "BomComponent"("componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BomComponent_bomId_lineNumber_key" ON "BomComponent"("bomId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVendor_itemId_vendorId_key" ON "ItemVendor"("itemId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockSnapshot_itemId_warehouseId_key" ON "StockSnapshot"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_zohoPoId_key" ON "PurchaseOrder"("zohoPoId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_zohoPoLineId_key" ON "PurchaseOrderLine"("zohoPoLineId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_itemId_expectedDeliveryDate_idx" ON "PurchaseOrderLine"("itemId", "expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_itemId_usableForMrp_idx" ON "PurchaseOrderLine"("itemId", "usableForMrp");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_zohoReceiptId_key" ON "PurchaseReceipt"("zohoReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiptLine_zohoReceiptLineId_key" ON "PurchaseReceiptLine"("zohoReceiptLineId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_purchaseOrderLineId_idx" ON "PurchaseReceiptLine"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_zohoSoId_key" ON "SalesOrder"("zohoSoId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_zohoSoLineId_key" ON "SalesOrderLine"("zohoSoLineId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_itemId_idx" ON "SalesOrderLine"("itemId");

-- CreateIndex
CREATE INDEX "SyncLog_syncEntityType_runStartedAt_idx" ON "SyncLog"("syncEntityType", "runStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_planCode_key" ON "ProductionPlan"("planCode");

-- CreateIndex
CREATE INDEX "ProductionPlanLine_itemId_requiredDate_idx" ON "ProductionPlanLine"("itemId", "requiredDate");

-- CreateIndex
CREATE UNIQUE INDEX "Demand_productionPlanLineId_key" ON "Demand"("productionPlanLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Demand_salesOrderLineId_key" ON "Demand"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "Demand_itemId_requiredDate_status_idx" ON "Demand"("itemId", "requiredDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MrpRun_runNumber_key" ON "MrpRun"("runNumber");

-- CreateIndex
CREATE INDEX "MrpRun_status_runStartedAt_idx" ON "MrpRun"("status", "runStartedAt");

-- CreateIndex
CREATE INDEX "MrpResult_itemId_mrpRunId_idx" ON "MrpResult"("itemId", "mrpRunId");

-- CreateIndex
CREATE INDEX "MrpResult_shortageFlag_idx" ON "MrpResult"("shortageFlag");

-- CreateIndex
CREATE UNIQUE INDEX "MrpResult_mrpRunId_itemId_key" ON "MrpResult"("mrpRunId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MrpResultPeriod_mrpResultId_periodStartDate_key" ON "MrpResultPeriod"("mrpResultId", "periodStartDate");

-- CreateIndex
CREATE INDEX "MrpResultDemandLink_demandId_idx" ON "MrpResultDemandLink"("demandId");

-- CreateIndex
CREATE UNIQUE INDEX "MrpResultDemandLink_mrpResultId_demandId_key" ON "MrpResultDemandLink"("mrpResultId", "demandId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRecommendation_mrpResultId_key" ON "PurchaseRecommendation"("mrpResultId");

-- CreateIndex
CREATE INDEX "PurchaseRecommendation_status_recommendedVendorId_idx" ON "PurchaseRecommendation"("status", "recommendedVendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_requisitionNumber_key" ON "PurchaseRequisition"("requisitionNumber");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_vendorId_status_idx" ON "PurchaseRequisition"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisitionLine_purchaseRecommendationId_key" ON "PurchaseRequisitionLine"("purchaseRecommendationId");

-- CreateIndex
CREATE INDEX "MrpException_itemId_status_idx" ON "MrpException"("itemId", "status");

-- CreateIndex
CREATE INDEX "MrpException_mrpRunId_idx" ON "MrpException"("mrpRunId");

-- CreateIndex
CREATE INDEX "MrpException_exceptionType_status_idx" ON "MrpException"("exceptionType", "status");

-- CreateIndex
CREATE INDEX "MrpException_relatedEntityType_relatedEntityId_idx" ON "MrpException"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_changedAt_idx" ON "AuditLog"("entityType", "entityId", "changedAt");

-- AddForeignKey
ALTER TABLE "MrpParameter" ADD CONSTRAINT "MrpParameter_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpParameter" ADD CONSTRAINT "MrpParameter_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpParameter" ADD CONSTRAINT "MrpParameter_plannerOwnerId_fkey" FOREIGN KEY ("plannerOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_obsoletedById_fkey" FOREIGN KEY ("obsoletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomComponent" ADD CONSTRAINT "BomComponent_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVendor" ADD CONSTRAINT "ItemVendor_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVendor" ADD CONSTRAINT "ItemVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSnapshot" ADD CONSTRAINT "StockSnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSnapshot" ADD CONSTRAINT "StockSnapshot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZohoConnection" ADD CONSTRAINT "ZohoConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_productionPlanLineId_fkey" FOREIGN KEY ("productionPlanLineId") REFERENCES "ProductionPlanLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRun" ADD CONSTRAINT "MrpRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResult" ADD CONSTRAINT "MrpResult_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "MrpRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResult" ADD CONSTRAINT "MrpResult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResult" ADD CONSTRAINT "MrpResult_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResultPeriod" ADD CONSTRAINT "MrpResultPeriod_mrpResultId_fkey" FOREIGN KEY ("mrpResultId") REFERENCES "MrpResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResultDemandLink" ADD CONSTRAINT "MrpResultDemandLink_mrpResultId_fkey" FOREIGN KEY ("mrpResultId") REFERENCES "MrpResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpResultDemandLink" ADD CONSTRAINT "MrpResultDemandLink_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_mrpResultId_fkey" FOREIGN KEY ("mrpResultId") REFERENCES "MrpResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_recommendedVendorId_fkey" FOREIGN KEY ("recommendedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecommendation" ADD CONSTRAINT "PurchaseRecommendation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionLine" ADD CONSTRAINT "PurchaseRequisitionLine_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionLine" ADD CONSTRAINT "PurchaseRequisitionLine_purchaseRecommendationId_fkey" FOREIGN KEY ("purchaseRecommendationId") REFERENCES "PurchaseRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionLine" ADD CONSTRAINT "PurchaseRequisitionLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpException" ADD CONSTRAINT "MrpException_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "MrpRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpException" ADD CONSTRAINT "MrpException_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpException" ADD CONSTRAINT "MrpException_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpSettings" ADD CONSTRAINT "MrpSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- Hand-written additions: constraints and triggers not expressible in the
-- Prisma schema DSL. See docs/architecture.md "Database Enforcement" for
-- the rationale behind each one. Keep this block in sync with schema.prisma
-- comments if the schema changes.
-- ═══════════════════════════════════════════════════════════════════════

-- Required for the EXCLUDE constraint below (equality + range overlap in one constraint).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────
-- 1) BOM revision uniqueness — already enforced by the natural-key unique
--    constraint @@unique([parentItemId, revision]) in schema.prisma.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 2) BOM effective-date overlap prevention: no two APPROVED revisions of
--    the same parent item may have overlapping effective date ranges.
--    An open-ended effectiveTo is treated as "infinity".
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Bom"
  ADD CONSTRAINT "bom_no_overlapping_approved_ranges"
  EXCLUDE USING gist (
    "parentItemId" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[]') WITH &&
  )
  WHERE (status = 'APPROVED');

-- Only one current revision per parent item.
CREATE UNIQUE INDEX "bom_one_current_revision_per_parent"
  ON "Bom" ("parentItemId")
  WHERE "isCurrentRevision" = true;

-- effectiveTo, when set, must be after effectiveFrom.
ALTER TABLE "Bom"
  ADD CONSTRAINT "bom_effective_to_after_from"
  CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom");

-- ─────────────────────────────────────────────────────────────────────
-- 3) Approved BOM immutability: once a BOM's status is APPROVED, its
--    defining fields cannot change except the single allowed transition
--    to OBSOLETE (setting obsoletedById/obsoletedAt). Deleting an
--    APPROVED or OBSOLETE BOM is never allowed — history must survive.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_approved_bom_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    IF NEW.status = 'OBSOLETE' THEN
      IF NEW."parentItemId" <> OLD."parentItemId"
         OR NEW."revision" <> OLD."revision"
         OR NEW."bomCode" <> OLD."bomCode"
         OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
         OR NEW."isCurrentRevision" <> OLD."isCurrentRevision" THEN
        RAISE EXCEPTION 'Approved BOM % cannot have its defining fields changed; create a new revision instead', OLD."bomCode";
      END IF;
      RETURN NEW;
    ELSIF NEW.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'Approved BOM % can only transition to OBSOLETE, not %', OLD."bomCode", NEW.status;
    ELSE
      RAISE EXCEPTION 'Approved BOM % is immutable; create a new revision instead of modifying it', OLD."bomCode";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_approved_bom_mutation
  BEFORE UPDATE ON "Bom"
  FOR EACH ROW EXECUTE FUNCTION prevent_approved_bom_mutation();

CREATE OR REPLACE FUNCTION prevent_historical_bom_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'OBSOLETE') THEN
    RAISE EXCEPTION 'BOM % cannot be deleted once Approved or Obsolete — history must be preserved', OLD."bomCode";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_historical_bom_delete
  BEFORE DELETE ON "Bom"
  FOR EACH ROW EXECUTE FUNCTION prevent_historical_bom_delete();

-- ─────────────────────────────────────────────────────────────────────
-- 4) Circular BOM prevention: a component item can never be, directly or
--    transitively (across ALL revisions), an ancestor of the parent item
--    whose BOM it is being added to.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bom_component_would_cycle(p_parent_item_id UUID, p_component_item_id UUID)
RETURNS BOOLEAN AS $$
  WITH RECURSIVE descendants AS (
    SELECT bc."componentItemId" AS item_id
    FROM "BomComponent" bc
    JOIN "Bom" b ON b.id = bc."bomId"
    WHERE b."parentItemId" = p_component_item_id

    UNION

    SELECT bc."componentItemId"
    FROM "BomComponent" bc
    JOIN "Bom" b ON b.id = bc."bomId"
    JOIN descendants d ON b."parentItemId" = d.item_id
  )
  SELECT (p_component_item_id = p_parent_item_id)
      OR EXISTS (SELECT 1 FROM descendants WHERE item_id = p_parent_item_id);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION prevent_circular_bom() RETURNS TRIGGER AS $$
DECLARE
  v_parent_item_id UUID;
BEGIN
  SELECT "parentItemId" INTO v_parent_item_id FROM "Bom" WHERE id = NEW."bomId";
  IF bom_component_would_cycle(v_parent_item_id, NEW."componentItemId") THEN
    RAISE EXCEPTION 'Circular BOM: item % cannot be a component anywhere in its own BOM tree', NEW."componentItemId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_circular_bom
  BEFORE INSERT OR UPDATE ON "BomComponent"
  FOR EACH ROW EXECUTE FUNCTION prevent_circular_bom();

-- Scrap percentage must be a valid loss fraction (see docs/architecture.md
-- "MRP Calculation Method": Gross Requirement / (1 - scrapPercentage)).
ALTER TABLE "BomComponent"
  ADD CONSTRAINT "bom_component_scrap_percentage_range"
  CHECK ("scrapPercentage" >= 0 AND "scrapPercentage" < 1);

-- ─────────────────────────────────────────────────────────────────────
-- 5) Item/Vendor uniqueness — already enforced by @@unique([itemId, vendorId])
--    in schema.prisma (ItemVendor).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 6) Single preferred vendor per item (among active sourcing records).
-- ─────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "item_vendor_one_active_preferred_per_item"
  ON "ItemVendor" ("itemId")
  WHERE "preferred" = true AND "active" = true;

-- ─────────────────────────────────────────────────────────────────────
-- 7) Item/Warehouse stock uniqueness — already enforced by
--    @@unique([itemId, warehouseId]) in schema.prisma (StockSnapshot).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 8) Zoho IDs as stable sync keys — already enforced by @unique on every
--    zoho*Id column in schema.prisma (Item, Vendor, Warehouse,
--    PurchaseOrder(Line), PurchaseReceipt(Line), SalesOrder(Line)).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 9) Demand source uniqueness: a Demand row's source-reference columns
--    must match its demandSourceType, and a given ProductionPlanLine /
--    SalesOrderLine can back at most one Demand row (nullable-unique
--    constraints already declared in schema.prisma do the latter).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Demand"
  ADD CONSTRAINT "demand_source_reference_matches_type"
  CHECK (
    ("demandSourceType" = 'PRODUCTION_PLAN' AND "productionPlanLineId" IS NOT NULL AND "salesOrderLineId" IS NULL)
    OR ("demandSourceType" = 'SALES_ORDER' AND "salesOrderLineId" IS NOT NULL AND "productionPlanLineId" IS NULL)
    OR ("demandSourceType" IN ('MANUAL', 'FORECAST') AND "productionPlanLineId" IS NULL AND "salesOrderLineId" IS NULL)
  );

-- ─────────────────────────────────────────────────────────────────────
-- 10) Purchase Recommendation → Purchase Requisition uniqueness — already
--     enforced by @unique on PurchaseRequisitionLine.purchaseRecommendationId
--     in schema.prisma (a recommendation can be converted at most once;
--     many recommendations may still land on the same requisition).
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 11) MRP Result historical snapshots: results, their time-phased periods,
--     and their demand links are append-only once written. MrpRun itself
--     is append-only once its status leaves RUNNING.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_row_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable historical records and cannot be modified or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_mrp_result
  BEFORE UPDATE OR DELETE ON "MrpResult"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

CREATE TRIGGER trg_immutable_mrp_result_period
  BEFORE UPDATE OR DELETE ON "MrpResultPeriod"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

CREATE TRIGGER trg_immutable_mrp_result_demand_link
  BEFORE UPDATE OR DELETE ON "MrpResultDemandLink"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_mrprun_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'MrpRun % is finalized (status=%) and cannot be modified', OLD."runNumber", OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_finalized_mrprun_mutation
  BEFORE UPDATE ON "MrpRun"
  FOR EACH ROW EXECUTE FUNCTION prevent_finalized_mrprun_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_mrprun_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('COMPLETED', 'FAILED') THEN
    RAISE EXCEPTION 'MrpRun % is finalized (status=%) and cannot be deleted', OLD."runNumber", OLD.status;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Only a finalized run is protected from DELETE; a still-RUNNING run may be
-- removed (e.g. a crashed run cleaned up before it ever produced results).
CREATE TRIGGER trg_prevent_mrprun_delete
  BEFORE DELETE ON "MrpRun"
  FOR EACH ROW EXECUTE FUNCTION prevent_finalized_mrprun_delete();

-- ─────────────────────────────────────────────────────────────────────
-- 12) MRP Result → Demand traceability — already enforced by
--     @@unique([mrpResultId, demandId]) on MrpResultDemandLink in
--     schema.prisma, plus its immutability trigger above.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 13) MRP Exception relationships — itemId/mrpRunId FKs and indexes are
--     declared directly in schema.prisma; relatedEntityType/relatedEntityId
--     stay a deliberately unenforced polymorphic pointer (see
--     docs/architecture.md), same pattern as AuditLog.
-- ─────────────────────────────────────────────────────────────────────

-- Additional sane-default CHECK constraints (data integrity, not covered above).
ALTER TABLE "MrpParameter"
  ADD CONSTRAINT "mrp_parameter_non_negative_values"
  CHECK ("leadTimeDays" >= 0 AND "moq" >= 0 AND "orderMultiple" > 0 AND "safetyStock" >= 0);

ALTER TABLE "ItemVendor"
  ADD CONSTRAINT "item_vendor_non_negative_values"
  CHECK (
    ("vendorLeadTimeDays" IS NULL OR "vendorLeadTimeDays" >= 0)
    AND ("vendorMoq" IS NULL OR "vendorMoq" >= 0)
    AND ("vendorOrderMultiple" IS NULL OR "vendorOrderMultiple" > 0)
  );

ALTER TABLE "MrpResult"
  ADD CONSTRAINT "mrp_result_scrap_percentage_range"
  CHECK ("scrapPercentageApplied" >= 0 AND "scrapPercentageApplied" < 1);

ALTER TABLE "MrpResult"
  ADD CONSTRAINT "mrp_result_recommended_quantity_non_negative"
  CHECK ("recommendedQuantity" >= 0);

-- MrpSettings is a deliberate singleton (see schema.prisma comment).
ALTER TABLE "MrpSettings"
  ADD CONSTRAINT "mrp_settings_singleton"
  CHECK ("id" = 1);
